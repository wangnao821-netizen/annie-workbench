# WO-60 档案中心全景重构与最终交付 — 执行规范（OpenCode 执行）

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / `pathlib.Path`（禁止 `os.path.join`）
- 禁止：引入任何新的 pip 依赖
- 禁止：创建"改动范围"表以外的文件；禁止修改表以外任何文件
- 禁止：重构、重命名、移动任何既有文件/函数（除非本表明确要求）
- 禁止：访问/读取真实客户文件夹（`D:\EverStones_Test_Clients\...`），测试一律用 `tmp_path` 构造虚拟测试数据
- 严格遵循安全纪律：测试隔离，不向测试目录外写文件

## 背景（为什么要做）

经过 WO-57（归档管道与放款事实）、WO-58（二次经营商机雷达）与 WO-59（AI 先例智库与审批官画像）的建设，系统已具备了完整的档案资产与知识大脑能力。
本单（WO-60）作为第二阶段的**最终全景收口与体验定稿**：
1. **客户终生资产视图聚合（Client Portfolio Aggregation）**：
   - 建立 `core/archive/portfolio.py`，按借款人客户主体（如 `Yingkun CHEN`）聚合其名下所有房产、贷款总额、当前利率、活跃/结案状态与最新跟进商机；
2. **档案大盘全局指标（Archive Hub Stats）**：
   - 计算管理资产总规模（Total Managed Loan Portfolio, $）、归档客户总数、高危/常规商机总数与先例收录总数；
3. **接口收口**：
   - 提供 `GET /api/archive/portfolio` 与 `GET /api/archive/stats` 端点。

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `core/archive/portfolio.py` | **新建** | 客户资产聚合与档案大盘指标计算（≤260 行） |
| `server/api/schemas.py` | 修改 | 文件末尾追加 `ClientPortfolioItem`、`ArchiveHubStats`、`ArchivePortfolioResponse` |
| `server/api/archive.py` | 修改 | 追加 `GET /api/archive/portfolio` 与 `GET /api/archive/stats`（约 35 行） |
| `tests/test_api/test_archive_portfolio.py` | **新建** | 客户资产多房产聚合、大盘总额计算与 API 端点全量测试（≤200 行） |

⚠️ 严禁修改上表以外的任何文件。

---

## 接口契约（一字不改）

### 1. `core/archive/portfolio.py`
```python
from __future__ import annotations

from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from core.archive.retention import compute_case_retention_opportunities
from core.logger import get_logger
from core.models.orm import Case

logger = get_logger(__name__)


def get_archive_hub_stats(db: Session) -> dict[str, Any]:
    """计算档案中心全局资产大盘指标。

    返回：
    {
        "total_archived_clients": int,
        "total_cases_count": int,
        "total_loan_volume": float,
        "total_opportunities_count": int,
        "total_precedents_count": int,
    }
    """


def get_client_portfolios(
    db: Session,
    query: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """按客户姓名聚合所有房产案卷，生成客户终生资产卡片列表。

    返回列表项：
    {
        "client_name": str,
        "total_properties_count": int,
        "total_loan_amount": float,
        "primary_lender": str | None,
        "latest_settlement_date": str | None,
        "cases_summary": list[dict],
        "active_opportunities_count": int,
        "latest_opportunity_title": str | None,
    }
    """
```

### 2. `server/api/schemas.py`（追加到文件末尾）
```python
class ArchiveHubStats(BaseModel):
    total_archived_clients: int = 0
    total_cases_count: int = 0
    total_loan_volume: float = 0.0
    total_opportunities_count: int = 0
    total_precedents_count: int = 0


class ClientPortfolioItem(BaseModel):
    client_name: str
    total_properties_count: int = 0
    total_loan_amount: float = 0.0
    primary_lender: str | None = None
    latest_settlement_date: str | None = None
    cases_summary: list[dict] = Field(default_factory=list)
    active_opportunities_count: int = 0
    latest_opportunity_title: str | None = None


class ArchivePortfolioResponse(BaseModel):
    ok: bool
    stats: ArchiveHubStats
    clients: list[ClientPortfolioItem] = Field(default_factory=list)
```

### 3. `server/api/archive.py` 追加端点
```python
from core.archive.portfolio import get_archive_hub_stats, get_client_portfolios
from server.api.schemas import ArchiveHubStats, ArchivePortfolioResponse


@router.get("/stats", response_model=ArchiveHubStats)
def get_archive_stats_endpoint(
    db: Session = Depends(get_db),  # noqa: B008
) -> ArchiveHubStats:
    """获取档案中心全局大盘统计指标。"""
    res = get_archive_hub_stats(db)
    return ArchiveHubStats(**res)


@router.get("/portfolio", response_model=ArchivePortfolioResponse)
def get_portfolio_endpoint(
    query: str | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),  # noqa: B008
) -> ArchivePortfolioResponse:
    """获取按客户主体聚合的终生资产全景列表。"""
    stats = get_archive_hub_stats(db)
    clients = get_client_portfolios(db, query=query, limit=limit)
    return ArchivePortfolioResponse(
        ok=True,
        stats=ArchiveHubStats(**stats),
        clients=clients,
    )
```

---

## 自动化测试与门禁（`tests/test_api/test_archive_portfolio.py`）

1. `test_get_client_portfolios_multi_properties`:
   - 插入同一客户名下 2 套房产的归档案件；
   - 验证 `get_client_portfolios` 准确聚合为 1 个客户项，`total_properties_count == 2` 且贷款总额正确相加。
2. `test_get_archive_hub_stats`:
   - 验证 `get_archive_hub_stats` 准确计算总归档客户数与贷款资产总规模。
3. `test_archive_portfolio_endpoints`:
   - TestClient 验证 `/api/archive/stats` 与 `/api/archive/portfolio` 200 响应。

---

## 验收检查命令
```powershell
$env:PYTHONPATH="D:\vera-workbench\.venv\Lib\site-packages"
$env:TESSDATA_PREFIX="C:\Users\Yaruo\AppData\Local\Temp\py311embed\tessdata"
python -m pytest tests/test_api/test_archive_portfolio.py -v
python -m ruff check core/archive/portfolio.py server/api/archive.py server/api/schemas.py tests/test_api/test_archive_portfolio.py
```
- 测试 100% 通过（0 failed）
- ruff 检查 0 errors / 0 warnings
