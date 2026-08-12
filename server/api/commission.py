"""佣金端点 — GET /api/commission（月度已结 + 在途预估 + 活跃案件数）。"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core.commission.calculator import get_commission_summary
from server.api.schemas import CommissionResponse
from server.deps import get_db

router = APIRouter(prefix="/api/commission", tags=["commission"])


@router.get("", response_model=CommissionResponse)
def get_commission(db: Session = Depends(get_db)) -> CommissionResponse:  # noqa: B008
    """佣金看板：本月已结佣、预估在途佣金、活跃案件数。

    复用 core.commission.calculator 纯查询逻辑，无副作用。
    """
    summary = get_commission_summary(db, period="month")
    totals = summary["totals"]
    settled = totals["settled"]
    approved = totals["approved"]
    potential = totals["potential"]
    return CommissionResponse(
        month_settled=settled["upfront"],
        pipeline_estimate=round(approved["upfront"] + potential["upfront"], 2),
        active_cases=approved["case_count"] + potential["case_count"],
        generated_at=summary["generated_at"],
    )
