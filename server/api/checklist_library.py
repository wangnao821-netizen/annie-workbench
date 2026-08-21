"""server/api/checklist_library.py — 清单总库查询接口 (WO-68)。

提供 GET /api/checklist/library 返回合并库（内置 master + 自定义 custom），支持前端新增清单时从库选择。
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core.checklist.master_picker import _load_master
from server.api.schemas import ChecklistLibraryItem, ChecklistLibraryResponse
from server.deps import get_db

router = APIRouter(prefix="/api/checklist", tags=["checklist"])


@router.get("/library", response_model=ChecklistLibraryResponse)
def get_checklist_library(db: Session = Depends(get_db)) -> ChecklistLibraryResponse:
    """获取清单全量总库（内置 + 自定义合并，按使用频率与名称排序）。"""
    raw_items = _load_master(db)
    custom_map: dict[str, int] = {}
    try:
        from core.models.orm import ChecklistLibraryCustom

        for row in db.query(ChecklistLibraryCustom).all():
            custom_map[str(row.id)] = getattr(row, "use_count", 0) or 0
    except Exception:  # noqa: BLE001
        pass

    item_dict: dict[str, ChecklistLibraryItem] = {}
    for it in raw_items:
        raw_id = str(it.get("id", ""))
        name_zh = (it.get("name_zh") or "").strip()
        if not name_zh:
            continue
        is_custom = raw_id in custom_map or raw_id.startswith("custom:")
        prefix_id = raw_id if (raw_id.startswith("master:") or raw_id.startswith("custom:")) else f"{'custom' if is_custom else 'master'}:{raw_id}"
        use_count = custom_map.get(raw_id, 0) if is_custom else int(it.get("use_count", 0) or 0)

        lib_item = ChecklistLibraryItem(
            id=prefix_id,
            name_zh=name_zh,
            name_en=it.get("name_en"),
            category=it.get("category") or "other",
            applicable_when=it.get("applicable_when"),
            bank_specific=it.get("bank_specific"),
            use_count=use_count,
            is_custom=is_custom,
        )
        # custom 项覆盖同名 master 项
        if name_zh not in item_dict or is_custom:
            item_dict[name_zh] = lib_item

    # 按使用频次优先，随后按自定义优先，最后名称字母排序
    sorted_items = sorted(
        item_dict.values(),
        key=lambda x: (-x.use_count, not x.is_custom, x.name_zh),
    )
    return ChecklistLibraryResponse(items=sorted_items)
