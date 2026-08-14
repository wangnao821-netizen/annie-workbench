"""文件操作 + 清单路由（接通 core.checklist）。"""
from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
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


def _to_checklist_item(it: CaseChecklist) -> ChecklistItemResponse:
    return ChecklistItemResponse(
        id=it.id,
        case_id=it.case_id,
        item_name=it.item_name,
        category=it.category,
        is_required=it.is_required,
        status=it.status,
        ai_suggestion=it.ai_suggestion,
        updated_at=it.updated_at,
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
    return [_to_checklist_item(it) for it in items]


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
    req: ChecklistConfirmRequest,
    db: Session = Depends(get_db),  # noqa: B008
):
    """确认清单项为已收到。"""
    _get_case_or_404(case_id, db)
    item = _get_checklist_item_or_404(item_id, case_id, db)
    item.status = "received"
    item.received_file_id = req.received_file_id
    db.commit()
    db.refresh(item)
    mark_case_summary_dirty(case_id, db)
    return _to_checklist_item(item)


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
    return _to_checklist_item(item)


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
        )
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        return _to_checklist_item(new_item)
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