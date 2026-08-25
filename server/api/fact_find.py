"""server/api/fact_find.py — Fact Find 结构化信息采集端点 (WO-77)。

支持 5 个 section：
1. employment_history（雇主历史）
2. living_history（居住历史）
3. solicitor_info（律师/过户师信息）
4. vehicle_asset（车辆资产）
5. super_balance（Super 养老金）
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.ai.case_summary import mark_case_summary_dirty
from core.context.accumulator import append_context_event
from core.logger import get_logger
from core.models.orm import Case, CaseChecklist, CaseFactFind
from server.api.schemas import (
    VALID_FACT_FIND_SECTIONS,
    FactFindAllResponse,
    FactFindConfirmResponse,
    FactFindSectionResponse,
    FactFindUpdateRequest,
)
from server.deps import get_db

router = APIRouter(prefix="/api/cases/{case_id}/fact-find", tags=["fact-find"])
logger = get_logger(__name__)


def _get_default_section_data(section: str) -> Any:
    """返回各 section 的标准默认数据契约。"""
    defaults = {
        "employment_history": [],
        "living_history": [],
        "solicitor_info": {"company": "", "contact_name": "", "email": "", "phone": ""},
        "vehicle_asset": {"make": "", "model": "", "value": 0},
        "super_balance": {"provider": "", "balance": 0},
    }
    return defaults.get(section, {})


def _get_case_or_404(case_id: str, db: Session) -> Case:
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail=f"案件 {case_id} 不存在")
    return case


@router.get("", response_model=FactFindAllResponse)
def get_all_fact_find(case_id: str, db: Session = Depends(get_db)) -> FactFindAllResponse:  # noqa: B008
    """获取指定案件全部 5 个 section 的 Fact Find 数据。"""
    _get_case_or_404(case_id, db)

    rows = db.query(CaseFactFind).filter(CaseFactFind.case_id == case_id).all()
    row_map = {r.section: r for r in rows}

    sections_res: dict[str, FactFindSectionResponse] = {}
    for sec in sorted(VALID_FACT_FIND_SECTIONS):
        if sec in row_map:
            r = row_map[sec]
            sections_res[sec] = FactFindSectionResponse(
                id=r.id,
                case_id=r.case_id,
                section=r.section,
                data=r.data or _get_default_section_data(sec),
                status=r.status or "pending",
                updated_at=r.updated_at,
            )
        else:
            sections_res[sec] = FactFindSectionResponse(
                id=f"ff_{uuid.uuid4().hex[:8]}",
                case_id=case_id,
                section=sec,
                data=_get_default_section_data(sec),
                status="pending",
                updated_at=None,
            )

    return FactFindAllResponse(ok=True, case_id=case_id, sections=sections_res)


@router.put("/{section}", response_model=FactFindSectionResponse)
def update_fact_find_section(
    case_id: str,
    section: str,
    req: FactFindUpdateRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> FactFindSectionResponse:
    """更新指定 section 的 Fact Find 结构化数据（未确认）。"""
    _get_case_or_404(case_id, db)
    if section not in VALID_FACT_FIND_SECTIONS:
        raise HTTPException(
            status_code=422,
            detail=f"非法 Fact Find section: '{section}'，有效值为 {sorted(VALID_FACT_FIND_SECTIONS)}",
        )

    row = (
        db.query(CaseFactFind)
        .filter(CaseFactFind.case_id == case_id, CaseFactFind.section == section)
        .first()
    )
    now_dt = datetime.now(UTC).replace(tzinfo=None)
    if not row:
        row = CaseFactFind(
            id=f"ff_{uuid.uuid4().hex[:8]}",
            case_id=case_id,
            section=section,
            data=req.data,
            status="pending",
            updated_at=now_dt,
        )
        db.add(row)
    else:
        row.data = req.data
        row.updated_at = now_dt

    db.commit()
    db.refresh(row)
    mark_case_summary_dirty(case_id, db)

    return FactFindSectionResponse(
        id=row.id,
        case_id=row.case_id,
        section=row.section,
        data=row.data,
        status=row.status,
        updated_at=row.updated_at,
    )


@router.post("/{section}/confirm", response_model=FactFindConfirmResponse)
def confirm_fact_find_section(
    case_id: str,
    section: str,
    db: Session = Depends(get_db),  # noqa: B008
) -> FactFindConfirmResponse:
    """确认指定 section 的 Fact Find 数据：标记 confirmed + 写事件 + 联动清单 info 项。"""
    _get_case_or_404(case_id, db)
    if section not in VALID_FACT_FIND_SECTIONS:
        raise HTTPException(
            status_code=422,
            detail=f"非法 Fact Find section: '{section}'，有效值为 {sorted(VALID_FACT_FIND_SECTIONS)}",
        )

    row = (
        db.query(CaseFactFind)
        .filter(CaseFactFind.case_id == case_id, CaseFactFind.section == section)
        .first()
    )
    now_dt = datetime.now(UTC).replace(tzinfo=None)
    if not row:
        row = CaseFactFind(
            id=f"ff_{uuid.uuid4().hex[:8]}",
            case_id=case_id,
            section=section,
            data=_get_default_section_data(section),
            status="confirmed",
            updated_at=now_dt,
        )
        db.add(row)
    else:
        row.status = "confirmed"
        row.updated_at = now_dt

    # 1. 写入 CaseContextEvent (source_type="fact_find")
    section_titles = {
        "employment_history": "雇主与工作履历",
        "living_history": "过往居住历史",
        "solicitor_info": "律师/过户师联系信息",
        "vehicle_asset": "车辆资产与估值",
        "super_balance": "Super 养老金余额",
    }
    title = section_titles.get(section, section)
    content = f"已确认客户 Fact Find [{title}]：{json.dumps(row.data, ensure_ascii=False)}"
    evt = append_context_event(
        case_id=case_id,
        source_type="fact_find",
        content=content,
        track="internal",
        db=db,
    )
    if evt:
        evt.status = "confirmed"

    # 2. 联动清单 info 项 (phase="initial", item_kind="info", master_id=section)
    checklist_updated = False
    chk_items = (
        db.query(CaseChecklist)
        .filter(
            CaseChecklist.case_id == case_id,
            CaseChecklist.phase == "initial",
            CaseChecklist.item_kind == "info",
        )
        .all()
    )
    for it in chk_items:
        if it.master_id == section or it.item_name == section or it.category == section:
            it.status = "received"
            checklist_updated = True

    db.commit()
    db.refresh(row)
    mark_case_summary_dirty(case_id, db)

    return FactFindConfirmResponse(
        ok=True,
        section=section,
        status="confirmed",
        event_id=evt.id if evt else None,
        checklist_updated=checklist_updated,
    )
