"""银行/平台主数据只读与运行时覆盖 PATCH 端点（WO-22 / WO-25）。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.bank_platform_states import merged_bank_item, set_override
from core.bank_registry import all_lenders, all_platforms, has_calculator
from server.api.schemas import (
    BankItem,
    BankPlatformUpdateRequest,
    BanksResponse,
    PlatformItem,
    PlatformsResponse,
)
from server.deps import get_db

router = APIRouter(prefix="/api", tags=["banks"])


@router.get("/banks/", response_model=BanksResponse)
def list_banks(db: Session = Depends(get_db)) -> BanksResponse:  # noqa: B008
    """全部 22 家银行（registry 已按 sort_order 排序：full 置顶，合并 DB 运行时覆盖）。"""
    banks = []
    for l in all_lenders():
        merged = merged_bank_item(db, l)
        banks.append(
            BankItem(
                key=merged["key"],
                display_name=merged["display_name"],
                name_zh=merged["name_zh"],
                type=merged["type"],
                adi=merged["adi"],
                tier=merged["tier"],
                has_calculator=has_calculator(merged["key"]),
                platforms=merged["platforms"],
                vera_confirmed=merged["vera_confirmed"],
            )
        )
    return BanksResponse(banks=banks)


@router.patch("/banks/{key}", response_model=BankItem)
def update_bank_platforms(
    key: str,
    req: BankPlatformUpdateRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> BankItem:
    """更新银行的对接平台与确认状态（写入 DB 覆盖，不改 YAML 真源）。"""
    target = None
    for l in all_lenders():
        if l["key"] == key:
            target = l
            break
    if not target:
        raise HTTPException(status_code=404, detail=f"银行 key '{key}' 不存在")

    if not req.platforms:
        raise HTTPException(status_code=422, detail="platforms 不能为空")

    valid_keys = {p["key"] for p in all_platforms()}
    invalid = [p for p in req.platforms if p not in valid_keys]
    if invalid:
        raise HTTPException(status_code=422, detail=f"包含非白名单平台 key: {invalid}")

    set_override(db, key, req.platforms, req.vera_confirmed)
    merged = merged_bank_item(db, target)
    return BankItem(
        key=merged["key"],
        display_name=merged["display_name"],
        name_zh=merged["name_zh"],
        type=merged["type"],
        adi=merged["adi"],
        tier=merged["tier"],
        has_calculator=has_calculator(merged["key"]),
        platforms=merged["platforms"],
        vera_confirmed=merged["vera_confirmed"],
    )


@router.get("/platforms/", response_model=PlatformsResponse)
def list_platforms() -> PlatformsResponse:
    """全部 5 家平台（yaml 顺序）。"""
    platforms = [
        PlatformItem(
            key=p["key"],
            display_name=p["display_name"],
            name_zh=p["name_zh"],
            type=p["type"],
            vera_confirmed=bool(p.get("vera_confirmed")),
        )
        for p in all_platforms()
    ]
    return PlatformsResponse(platforms=platforms)