"""银行/平台主数据只读端点（WO-22）。直接读 registry，不查库。"""

from __future__ import annotations

from fastapi import APIRouter

from core.bank_registry import all_lenders, all_platforms, has_calculator
from server.api.schemas import BankItem, BanksResponse, PlatformItem, PlatformsResponse

router = APIRouter(prefix="/api", tags=["banks"])


@router.get("/banks/", response_model=BanksResponse)
def list_banks() -> BanksResponse:
    """全部 22 家银行（registry 已按 sort_order 排序：full 置顶）。"""
    banks = [
        BankItem(
            key=l["key"],
            display_name=l["display_name"],
            name_zh=l["name_zh"],
            type=l["type"],
            adi=l["adi"],
            tier=l["tier"],
            has_calculator=has_calculator(l["key"]),
            platforms=list(l.get("platforms") or []),
            vera_confirmed=bool(l.get("vera_confirmed")),
        )
        for l in all_lenders()
    ]
    return BanksResponse(banks=banks)


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