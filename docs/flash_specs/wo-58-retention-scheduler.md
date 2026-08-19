# WO-58 二次经营时钟引擎与主动商机雷达 — 执行规范（OpenCode 执行）

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / `pathlib.Path`（禁止 `os.path.join`）
- 禁止：引入任何新的 pip 依赖
- 禁止：创建"改动范围"表以外的文件；禁止修改表以外任何文件
- 禁止：重构、重命名、移动任何既有文件/函数（除非本表明确要求）
- 禁止：访问/读取真实客户文件夹（`D:\EverStones_Test_Clients\...`），测试一律用 `tmp_path` 构造虚拟测试数据
- 所有日期计算统一基于 UTC，测试隔离

## 背景（为什么要做）

在澳洲贷款行业中，房贷经纪人有近 50% 的新增贷款来自于已放款历史客户的**转贷（Refinance）、向银行申请降息（Repricing）与二次置业（Next Purchase）**。
通过 WO-57 将历史结案数据入库后，本单（WO-58）需要构建**四大二次经营时钟调度引擎与商机雷达**：
1. **🔴 固定利率到期时钟（Fixed Rate Expiry Watch）**：
   - 距固定期结束 ≤90 天 ➔ 触发“锁定低息转贷方案”预警（Red Alert）；
2. **🟡 满年降息体检时钟（Annual Repricing Review）**：
   - 放款每满 1 周年（365天 / 730天） ➔ 触发“向原银行申请降息”商机（Yellow Alert）；
3. **🟢 增值套现与再置业时钟（Equity Cash-out & Next Purchase）**：
   - 放款满 2 年以上 ➔ 触发“资产增值套现/再置业意向咨询”商机（Green Alert）；
4. **🔵 放款周期关怀时钟（Settlement Care）**：
   - 放款后 30 天 / 180 天 ➔ 触发“扣款核对与关怀问候”时钟（Blue Care）。

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `core/archive/retention.py` | **新建** | 四大时钟计算引擎与商机雷达生成（≤260 行） |
| `server/api/schemas.py` | 修改 | 文件末尾追加 `RetentionOpportunityItem` 与 `RetentionRadarResponse` |
| `server/api/archive.py` | 修改 | 追加 `GET /api/archive/retention-radar` 端点（约 20 行） |
| `tests/test_api/test_retention_radar.py` | **新建** | 4 种时钟触发条件、天数推算与 API 端点全量测试（≤200 行） |

⚠️ 严禁修改上表以外的任何文件。

---

## 接口契约（一字不改）

### 1. `core/archive/retention.py`
```python
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from core.logger import get_logger
from core.models.orm import Case

logger = get_logger(__name__)


def compute_case_retention_opportunities(
    case: Case,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    """针对单个已归档案件，计算当前触发的所有二次经营商机。

    规则：
    1. 仅对 stage == 'closed' 或 close_reason == 'settled' 的案件生效；
    2. 计算放款已过天数 days_since_settlement = (now - case.closed_at).days；
    3. 🔴 fixed_rate_expiry (Red):
       - 若设置了 fixed_expiry_date，且 0 <= (fixed_expiry_date - now).days <= 90；
       - 或无显式日期但 days_since_settlement 处于 300~365 / 665~730 天且 rate_type 标记为 fixed；
       - title: "固定利率即将在 {N} 天内到期", action: "联系客户锁定新转贷方案";
    4. 🟡 annual_repricing (Yellow):
       - 放款满 330~400 天 (1年) 或 690~760 天 (2年)；
       - title: "放款已满 {N} 周年降息体检", action: "向原银行发起降息申请(Repricing)或比价转贷";
    5. 🟢 equity_cashout (Green):
       - 放款超过 700 天；
       - title: "资产增值套现与再置业机会", action: "咨询增值套现与第二套投资房置业意向";
    6. 🔵 settlement_care (Blue):
       - 放款后 20~45 天 或 170~195 天；
       - title: "放款后账单核对与关怀", action: "确认首次扣款正常与对账单服务";
    """


def get_all_retention_radar(db: Session, now: datetime | None = None) -> dict[str, Any]:
    """遍历所有归档案件，汇总全局商机雷达指标。

    返回：
    {
        "ok": True,
        "summary": {
            "total_opportunities": int,
            "red_count": int,     # 固定利率到期
            "yellow_count": int,  # 满年降息体检
            "green_count": int,   # 增值套现
            "blue_count": int     # 关怀问候
        },
        "opportunities": list[dict]
    }
    """
```

### 2. `server/api/schemas.py`（追加到文件末尾）
```python
class RetentionOpportunityItem(BaseModel):
    case_id: str
    client_name: str
    property_address: str | None = None
    lender: str | None = None
    loan_amount: float | None = None
    interest_rate: str | None = None
    settlement_date: str | None = None
    level: str  # red / yellow / green / blue
    opp_type: str  # fixed_rate_expiry / annual_repricing / equity_cashout / settlement_care
    title: str
    action_suggest: str
    days_relevant: int = 0


class RetentionRadarSummary(BaseModel):
    total_opportunities: int = 0
    red_count: int = 0
    yellow_count: int = 0
    green_count: int = 0
    blue_count: int = 0


class RetentionRadarResponse(BaseModel):
    ok: bool
    summary: RetentionRadarSummary
    opportunities: list[RetentionOpportunityItem] = Field(default_factory=list)
```

### 3. `server/api/archive.py` 追加端点
```python
from core.archive.retention import get_all_retention_radar
from server.api.schemas import RetentionRadarResponse


@router.get("/retention-radar", response_model=RetentionRadarResponse)
def get_retention_radar_endpoint(
    db: Session = Depends(get_db),  # noqa: B008
) -> RetentionRadarResponse:
    """获取档案中心二次经营商机雷达（红黄绿四大时钟统计与客户列表）。"""
    res = get_all_retention_radar(db)
    return RetentionRadarResponse(**res)
```

---

## 自动化测试与门禁（`tests/test_api/test_retention_radar.py`）

1. `test_fixed_rate_expiry_red_alert`:
   - 插入放款 330 天（距 1 年固定期还剩 35 天）的 Case，验证触发 `level="red"`, `opp_type="fixed_rate_expiry"`。
2. `test_annual_repricing_yellow_alert`:
   - 插入放款 365 天的浮动利率 Case，验证触发 `level="yellow"`, `opp_type="annual_repricing"`。
3. `test_equity_cashout_green_alert`:
   - 插入放款 750 天的 Case，验证触发 `level="green"`, `opp_type="equity_cashout"`。
4. `test_active_cases_excluded`:
   - 插入 stage="gathering" 在办 Case，验证不会触发任何二次经营商机（严格隔离）。
5. `test_retention_radar_endpoint`:
   - TestClient 调用 `GET /api/archive/retention-radar` 验证 HTTP 200 及 summary 字段统计。

---

## 验收检查命令
```powershell
$env:PYTHONPATH="D:\vera-workbench\.venv\Lib\site-packages"
$env:TESSDATA_PREFIX="C:\Users\Yaruo\AppData\Local\Temp\py311embed\tessdata"
python -m pytest tests/test_api/test_retention_radar.py -v
python -m ruff check core/archive/retention.py server/api/archive.py server/api/schemas.py tests/test_api/test_retention_radar.py
```
- 测试 100% 通过（0 failed）
- ruff 检查 0 errors / 0 warnings
