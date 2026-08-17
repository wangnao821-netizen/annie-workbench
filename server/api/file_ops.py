"""server/api/file_ops.py — 文件操作端点（WO-44）：案件文件夹浏览/预览/改名/移动/放入 + 命名建议。

红线：端点由前端确认弹窗后才调用（user_confirmed=True 为该语义的载体）；绝不自主移动/删除/改名；
目标已存在禁止覆盖（409）；跨案件禁止；路径穿越拒绝（422）。
"""

from __future__ import annotations

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Response,
    UploadFile,
)
from sqlalchemy.orm import Session

from core.file_ops import service
from core.models.orm import Case
from core.security.path_guard import WriteNotAllowedError
from server.api.schemas import (
    FileOpsListResponse,
    FileOpsResult,
    FilePreviewResponse,
    MoveRequest,
    NamingSuggestResponse,
    RenameRequest,
)
from server.deps import get_db

router = APIRouter(prefix="/api/cases", tags=["file_ops"])


def _case_or_404(case_id: str, db: Session) -> Case:
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail=f"案件 {case_id} 不存在")
    return case


def _as_http(exc: Exception) -> HTTPException:
    """统一错误映射：文件/案件不存在 → 404；已存在 → 409；其余 → 422。"""
    msg = str(exc)
    if "文件不存在" in msg or "未关联文件夹" in msg:
        return HTTPException(status_code=404, detail=msg)
    if isinstance(exc, WriteNotAllowedError):
        return HTTPException(status_code=409, detail=msg)
    if "文件过大" in msg:
        return HTTPException(status_code=413, detail=msg)
    return HTTPException(status_code=422, detail=msg)


@router.get("/{case_id}/folder/files", response_model=FileOpsListResponse)
def list_case_files(
    case_id: str,
    path: str = Query(""),
    db: Session = Depends(get_db),  # noqa: B008
) -> FileOpsListResponse:
    """一层列出案件文件夹（子目录在前；path 相对案件目录，空=根）。"""
    case = _case_or_404(case_id, db)
    try:
        return FileOpsListResponse(**service.list_files(case, path, db=db))
    except ValueError as exc:
        if "未关联文件夹" in str(exc):
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/{case_id}/folder/files/preview", response_model=FilePreviewResponse)
def preview_case_file(
    case_id: str,
    path: str = Query(""),
    db: Session = Depends(get_db),  # noqa: B008
) -> FilePreviewResponse:
    """预览文件（复用 parse_one；解析失败不 500，返回 parse_error）。"""
    case = _case_or_404(case_id, db)
    try:
        return FilePreviewResponse(**service.preview_file(case, path, db))
    except ValueError as exc:
        raise _as_http(exc) from exc


@router.get("/{case_id}/folder/files/raw")
def raw_case_file(
    case_id: str,
    path: str = Query(""),
    db: Session = Depends(get_db),  # noqa: B008
) -> Response:
    """只读原文件流（WO-46）：不写盘/不落库/无 FileEvent；白名单 pdf/jpg/jpeg/png/txt/md/csv，≤20MB。

    返回 200 + inline 流；文件不存在/未关联文件夹 404；越界/穿越/不支持扩展名 422；超 20MB 413。
    """
    case = _case_or_404(case_id, db)
    try:
        content, media_type, filename = service.raw_file(case, path)
    except ValueError as exc:
        raise _as_http(exc) from exc
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.post("/{case_id}/folder/files/rename", response_model=FileOpsResult)
def rename_case_file(
    case_id: str,
    req: RenameRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> FileOpsResult:
    """改名（Vera 确认）：PathGuard 同案件/禁穿越/目标存在 409 → os.rename → FileEvent。"""
    case = _case_or_404(case_id, db)
    try:
        return FileOpsResult(**service.rename_file(case, req.source, req.new_name, db))
    except Exception as exc:
        raise _as_http(exc) from exc


@router.post("/{case_id}/folder/files/move", response_model=FileOpsResult)
def move_case_file(
    case_id: str,
    req: MoveRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> FileOpsResult:
    """移动（Vera 确认）：目标=target_dir/原名，PathGuard + os.rename + FileEvent。"""
    case = _case_or_404(case_id, db)
    try:
        return FileOpsResult(**service.move_file(case, req.source, req.target_dir, db))
    except Exception as exc:
        raise _as_http(exc) from exc


@router.post("/{case_id}/folder/files/import", response_model=FileOpsResult)
async def import_case_file(
    case_id: str,
    file: UploadFile = File(...),  # noqa: B008
    target_dir: str = Form(""),
    db: Session = Depends(get_db),  # noqa: B008
) -> FileOpsResult:
    """放入（复制保留原文件）：扩展名白名单 + 重名 409 + shutil.copy2 + FileEvent。"""
    case = _case_or_404(case_id, db)
    content = await file.read()
    try:
        return FileOpsResult(**service.import_file(case, target_dir, file.filename or "", content, db))
    except Exception as exc:
        raise _as_http(exc) from exc


@router.get("/{case_id}/folder/naming-suggest", response_model=NamingSuggestResponse)
def naming_suggest(
    case_id: str,
    filename: str = Query(...),
    db: Session = Depends(get_db),  # noqa: B008
) -> NamingSuggestResponse:
    """规范命名建议（纯确定性规则，不调 LLM）。"""
    case = _case_or_404(case_id, db)
    return NamingSuggestResponse(**service.suggest_naming(case, filename))
