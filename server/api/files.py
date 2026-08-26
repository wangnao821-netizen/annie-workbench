"""文件操作 + 清单路由（接通 core.checklist）。"""
from __future__ import annotations

import json
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.ai.case_summary import mark_case_summary_dirty
from core.checklist.generator import generate_checklist_draft
from core.models.orm import Case, CaseChecklist, CaseFile, ChecklistLibraryCustom
from server.api.schemas import (
    ChecklistAddRequest,
    ChecklistConfirmRequest,
    ChecklistItemResponse,
    FileItemResponse,
)
from server.deps import get_db, get_settings

router = APIRouter(prefix="/api", tags=["files"])

_CATEGORY_LABELS = {
    "identity": "身份",
    "income_payg": "收入（PAYG）",
    "income_self_employed": "收入（自雇）",
    "bank_specific": "银行特定",
    "special": "特殊情况",
    "property": "房产",
    "settlement": "结算",
    "other": "其他",
}

_TEMPLATE_SECTION_MAP: dict[str, str] | None = None

_CATEGORY_TO_SECTION: dict[str, str] = {
    "identity": "id",
    "income_payg": "income",
    "income_self_employed": "income",
    "special": "asset",
    "property": "asset",
    "settlement": "asset",
    "bank_specific": "liability",
}


def _resolve_item_section(it: CaseChecklist) -> str:
    """根据 master_id / category / 名称智能解析 8 大板块或 other 兜底。"""
    template_sec = _template_section_map().get(it.master_id or "")
    if template_sec:
        return template_sec
    cat = (it.category or "").lower()
    if cat in _CATEGORY_TO_SECTION:
        return _CATEGORY_TO_SECTION[cat]
    name = (it.item_name or "").lower()
    if any(k in name for k in ("护照", "驾照", "身份", "passport", "licence")):
        return "id"
    if any(k in name for k in ("工资", "收入", "税", "payslip", "salary", "tax", "financial")):
        return "income"
    if any(k in name for k in ("雇主", "employment")):
        return "employment_history"
    if any(k in name for k in ("开支", "expense")):
        return "living_expense"
    if any(k in name for k in ("贷款", "信用卡", "负债", "loan", "liability", "credit")):
        return "liability"
    if any(k in name for k in ("居住", "living")):
        return "living_history"
    if any(k in name for k in ("资产", "房产", "市政", "合同", "定金", "存款", "rates", "asset", "super")):
        return "asset"
    if any(k in name for k in ("律师", "过户", "solicitor")):
        return "solicitor"
    return "other"



def _template_section_map() -> dict[str, str]:
    """首次模板 {master_id → section_id}，供清单按 8 大板块分组。"""
    global _TEMPLATE_SECTION_MAP
    if _TEMPLATE_SECTION_MAP is None:
        from core.checklist.email_draft import _load_template

        mapping: dict[str, str] = {}
        try:
            template = _load_template()
            for sec in template.get("sections", []):
                for raw in sec.get("items", []):
                    ref = raw["ref"] if isinstance(raw, dict) else raw
                    mapping[ref] = sec["id"]
        except Exception:  # noqa: BLE001, S110 — 模板缺失时分组为空
            pass
        _TEMPLATE_SECTION_MAP = mapping
    return _TEMPLATE_SECTION_MAP


def _get_case_or_404(case_id: str, db: Session) -> Case:
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail=f"案件 {case_id} 不存在")
    return case


def _to_file_item(f: CaseFile) -> FileItemResponse:
    return FileItemResponse(
        id=f.id,
        case_id=f.case_id,
        original_name=f.original_name,
        assigned_type=f.assigned_type,
        confidence=f.confidence,
        nas_path=f.nas_path,
        status=f.status or "discovered",
        file_extension=f.file_extension,
        file_size=f.file_size,
        created_at=f.created_at,
    )


def _to_checklist_item(it: CaseChecklist, db: Session | None = None) -> ChecklistItemResponse:
    """序列化清单项（WO-74：补齐 phase/deadline/source_ref/item_kind 与已匹配文件信息）。"""
    master_meta: dict = {}
    if it.master_id:
        try:
            from core.checklist.master_picker import _load_master

            for row in _load_master(db):
                if row.get("id") == it.master_id:
                    master_meta = row
                    break
        except Exception:  # noqa: BLE001, S110 — 主库查询失败不阻断
            pass

    file_ids = list(it.received_file_ids or [])
    if it.received_file_id and it.received_file_id not in file_ids:
        file_ids.insert(0, it.received_file_id)
    matched_file_id = file_ids[0] if file_ids else None
    matched_file_name = None
    if matched_file_id and db is not None:
        f = db.query(CaseFile).filter(CaseFile.id == matched_file_id).first()
        if f:
            matched_file_name = f.original_name

    aw = master_meta.get("applicable_when")
    aw_str: str | None = None
    if isinstance(aw, dict):
        aw_str = json.dumps(aw, ensure_ascii=False)
    elif aw:
        aw_str = str(aw)

    category = it.category or "other"
    label = _CATEGORY_LABELS.get(category)
    if not label:
        label = _CATEGORY_LABELS.get(master_meta.get("category", ""), "其他")

    return ChecklistItemResponse(
        id=it.id,
        case_id=it.case_id,
        master_id=it.master_id,
        item_name=it.item_name,
        category=category,
        is_required=it.is_required,
        status=it.status,
        ai_suggestion=it.ai_suggestion,
        updated_at=it.updated_at,
        phase=it.phase or "initial",
        deadline=it.deadline,
        source_ref=it.source_ref,
        item_kind=it.item_kind or "document",
        master_category=label,
        section=_resolve_item_section(it),
        bank_specific=master_meta.get("bank_specific"),
        applicable_when=aw_str,
        matched_file_id=matched_file_id,
        matched_file_name=matched_file_name,
        file_ids=file_ids,
    )


@router.get("/cases/{case_id}/files", response_model=list[FileItemResponse])
def list_files(
    case_id: str,
    db: Session = Depends(get_db),  # noqa: B008
):
    """案件文件列表。空库返回 []。"""
    _get_case_or_404(case_id, db)
    files = (
        db.query(CaseFile)
        .filter(CaseFile.case_id == case_id)
        .order_by(CaseFile.created_at.desc())
        .all()
    )
    return [_to_file_item(f) for f in files]


@router.post("/cases/{case_id}/files/upload", response_model=FileItemResponse)
async def upload_file(
    case_id: str,
    file: UploadFile = File(...),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
):
    """上传文件到本地数据目录（data/uploads/{case_id}/）并登记。"""
    _get_case_or_404(case_id, db)
    uploads_root = get_settings().data_dir / "uploads" / case_id
    uploads_root.mkdir(parents=True, exist_ok=True)

    safe_name = Path(file.filename or "unnamed").name
    target = uploads_root / safe_name
    content = await file.read()
    target.write_bytes(content)

    file_id = f"file_{uuid.uuid4().hex[:12]}"
    record = CaseFile(
        id=file_id,
        case_id=case_id,
        original_name=safe_name,
        nas_path=str(target),
        status="discovered",
        file_extension=target.suffix.lstrip(".") or None,
        file_size=len(content),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return _to_file_item(record)


@router.get("/cases/{case_id}/checklist", response_model=list[ChecklistItemResponse])
def get_checklist(
    case_id: str,
    generate: bool = False,
    db: Session = Depends(get_db),  # noqa: B008
):
    """清单状态。generate=true 且无现存项时调用 core.checklist 生成草稿。"""
    _get_case_or_404(case_id, db)
    items = (
        db.query(CaseChecklist)
        .filter(CaseChecklist.case_id == case_id)
        .order_by(CaseChecklist.id)
        .all()
    )
    if not items and generate:
        try:
            draft = generate_checklist_draft(case_id, db)
        except Exception:  # noqa: BLE001 - 降级为空清单
            # 生成失败（如 AI key 未配置）时降级为空清单，不阻断查询
            return []
        return [
            ChecklistItemResponse(
                id=0,
                case_id=case_id,
                item_name=it.get("item_name", ""),
                category=it.get("category", "other"),
                is_required=bool(it.get("is_required", True)),
                status="pending",
                ai_suggestion=it.get("ai_suggestion"),
                updated_at=None,
            )
            for it in draft
        ]
    return [_to_checklist_item(it, db) for it in items]


def _get_checklist_item_or_404(item_id: int, case_id: str, db: Session) -> CaseChecklist:
    item = (
        db.query(CaseChecklist)
        .filter(CaseChecklist.id == item_id, CaseChecklist.case_id == case_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail=f"清单项 {item_id} 不存在")
    return item


@router.post("/cases/{case_id}/checklist/{item_id}/confirm", response_model=ChecklistItemResponse)
def confirm_checklist_item(
    case_id: str,
    item_id: int,
    req: ChecklistConfirmRequest | None = None,
    db: Session = Depends(get_db),  # noqa: B008
):
    """确认清单项为已收到。"""
    _get_case_or_404(case_id, db)
    item = _get_checklist_item_or_404(item_id, case_id, db)
    item.status = "received"
    item.received_file_id = req.received_file_id if req else None
    db.commit()
    db.refresh(item)
    mark_case_summary_dirty(case_id, db)
    return _to_checklist_item(item, db)


@router.post("/cases/{case_id}/checklist/{item_id}/revoke", response_model=ChecklistItemResponse)
def revoke_checklist_item(
    case_id: str,
    item_id: int,
    db: Session = Depends(get_db),  # noqa: B008
):
    """撤销确认。"""
    _get_case_or_404(case_id, db)
    item = _get_checklist_item_or_404(item_id, case_id, db)
    item.status = "pending"
    item.received_file_id = None
    db.commit()
    db.refresh(item)
    mark_case_summary_dirty(case_id, db)
    return _to_checklist_item(item, db)


class AdjustInitialChecklistRequest(BaseModel):
    selected_master_ids: list[str]


@router.put("/cases/{case_id}/checklist/initial", response_model=list[ChecklistItemResponse])
def adjust_initial_checklist(
    case_id: str,
    req: AdjustInitialChecklistRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> list[ChecklistItemResponse]:
    """原子化重设首次材料清单（phase='initial'）：按勾选的 master_id 列表重建，杜绝叠加重名。"""
    _get_case_or_404(case_id, db)
    from core.checklist.email_draft import _load_master_index

    master_index = _load_master_index()

    # 查出已有 received 或已关联文件的 initial 项
    existing_initial = (
        db.query(CaseChecklist)
        .filter(CaseChecklist.case_id == case_id, CaseChecklist.phase == "initial")
        .all()
    )
    existing_by_master = {it.master_id: it for it in existing_initial if it.master_id}

    # 原子清空旧 initial 项
    db.query(CaseChecklist).filter(
        CaseChecklist.case_id == case_id,
        CaseChecklist.phase == "initial",
    ).delete(synchronize_session=False)
    db.flush()

    # 插入选定的 master 项
    new_rows: list[CaseChecklist] = []
    for mid in req.selected_master_ids:
        master = master_index.get(mid, {})
        old_item = existing_by_master.get(mid)
        new_rows.append(
            CaseChecklist(
                case_id=case_id,
                item_name=master.get("name_zh", mid),
                category=master.get("category", "special"),
                is_required=True,
                status=old_item.status if old_item else "pending",
                master_id=mid,
                phase="initial",
                item_kind=master.get("kind", "document"),
                received_file_id=old_item.received_file_id if old_item else None,
            )
        )

    db.add_all(new_rows)
    db.commit()

    all_items = (
        db.query(CaseChecklist)
        .filter(CaseChecklist.case_id == case_id)
        .order_by(CaseChecklist.id)
        .all()
    )
    return [_to_checklist_item(it, db) for it in all_items]


@router.post("/cases/{case_id}/checklist", response_model=ChecklistItemResponse, status_code=201)
def add_checklist_item(
    case_id: str,
    req: ChecklistAddRequest,
    db: Session = Depends(get_db),  # noqa: B008
):
    """新增清单项：写案件清单 + 沉淀到自定义总项库（同名+同分类幂等，use_count+1）。"""
    _get_case_or_404(case_id, db)
    name = req.name_zh.strip()
    if not name:
        raise HTTPException(status_code=422, detail="清单项名称不能为空")
    allowed_categories = {
        "identity", "income_payg", "income_self_employed",
        "bank_specific", "special", "property", "settlement",
    }
    if req.category not in allowed_categories:
        raise HTTPException(status_code=422, detail=f"category 不合法，必须为 {sorted(allowed_categories)} 之一")
    if req.phase not in {"initial", "condition"}:
        raise HTTPException(status_code=422, detail="phase 必须为 initial 或 condition")
    try:
        norm = "".join(name.split()).lower()
        existing = None
        for row in db.query(ChecklistLibraryCustom).filter(ChecklistLibraryCustom.category == req.category).all():
            if "".join((row.name_zh or "").split()).lower() == norm:
                existing = row
                break
        if existing:
            existing.use_count = (existing.use_count or 0) + 1
            custom_id = existing.id
        else:
            custom_id = f"custom_{uuid.uuid4().hex[:8]}"
            db.add(ChecklistLibraryCustom(
                id=custom_id,
                name_zh=name,
                name_en=req.name_en,
                category=req.category,
                applicable_when=req.applicable_when,
                bank_specific=req.bank_specific,
                source_case_id=case_id,
                use_count=1,
            ))
        new_item = CaseChecklist(
            case_id=case_id,
            item_name=req.name_zh,
            category=req.category,
            is_required=req.is_required,
            status="pending",
            master_id=custom_id,
            phase=req.phase,
            deadline=req.deadline,
            source_ref=req.source_ref,
        )
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        return _to_checklist_item(new_item, db)
    except Exception:  # noqa: BLE001 — 事务失败回滚并报 500
        db.rollback()
        raise HTTPException(status_code=500, detail="新增清单项失败")


@router.get("/files/{file_id}/preview")
def preview_file(
    file_id: str,
    db: Session = Depends(get_db),  # noqa: B008
):
    """文件预览 — 仅服务 data 目录内的上传文件，防目录穿越。"""
    record = db.query(CaseFile).filter(CaseFile.id == file_id).first()
    if not record:
        raise HTTPException(status_code=404, detail=f"文件 {file_id} 不存在")

    data_root = get_settings().data_dir.resolve()
    path = Path(record.nas_path).resolve()
    if path.parent != (data_root / "uploads" / record.case_id).resolve():
        raise HTTPException(status_code=403, detail="不允许访问该文件")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")
    return FileResponse(str(path))


@router.post("/cases/{case_id}/folder-files/{file_id}/revoke")
def revoke_folder_file_match_endpoint(
    case_id: str,
    file_id: str,
    db: Session = Depends(get_db),  # noqa: B008
) -> dict:
    """撤销文件夹自动匹配（三档渐进第 1 档闭环）。"""
    _get_case_or_404(case_id, db)
    record = db.query(CaseFile).filter(CaseFile.id == file_id, CaseFile.case_id == case_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="file not found")
    from core.case_folder.discovery import revoke_folder_file_match
    reverted = revoke_folder_file_match(db, case_id, file_id)
    return {"case_id": case_id, "file_id": file_id, "reverted_items": reverted, "success": True, "message": f"已撤销 {reverted} 项自动匹配"}
