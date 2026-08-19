# WO-59 AI 知识萃取与审批官/先例图谱 — 执行规范（OpenCode 执行）

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / `pathlib.Path`（禁止 `os.path.join`）
- 禁止：引入任何新的 pip 依赖
- 禁止：创建"改动范围"表以外的文件；禁止修改表以外任何文件
- 禁止：重构、重命名、移动任何既有文件/函数（除非本表明确要求）
- 禁止：访问/读取真实客户文件夹（`D:\EverStones_Test_Clients\...`），测试一律用 `tmp_path` 构造虚拟测试数据
- 严格遵循安全纪律：测试隔离，不向测试目录外写文件

## 背景（为什么要做）

在信贷业务中，经纪人面对复杂疑难案件（如自雇 Alt Doc、估价偏低、特定行政策卡点）时，最需要的是**历史相似先例经验（Precedents）**与**银行审批官沟通画像（Assessor Profile）**：
1. **审批官画像聚合（Assessor Insights）**：
   - 从邮件时序（`CaseContextEvent`）中聚合所有已知审批官（如 `Rachel Fonseka (ORDE)`），统计其案件数、常见卡点类型、平均审批节奏与注意事项；
2. **实战先例检索（Case Precedent Search）**：
   - 允许按银行（`ORDE/CBA`）、方案类型（`Alt Doc/Full Doc`）、物业类型、金额多维检索历史已结案的成功与破局先例；
3. **经验复盘卡片提炼（Knowledge Card Extraction）**：
   - 从案卷 Broker Notes、邮件关键事件与放款事实中，提炼结构化经验卡（背景痛点、破局策略、获批条件）。

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `core/archive/knowledge_mining.py` | **新建** | 审批官画像聚合、实战先例检索与复盘卡提炼（≤260 行） |
| `server/api/schemas.py` | 修改 | 文件末尾追加 `AssessorInsightItem`、`AssessorListResponse`、`CasePrecedentItem`、`CasePrecedentSearchResponse`、`KnowledgeCardResponse` |
| `server/api/archive.py` | 修改 | 追加 3 个端点：`GET /assessors`, `GET /precedents`, `GET /cases/{case_id}/knowledge-card`（约 40 行） |
| `tests/test_api/test_knowledge_mining.py` | **新建** | 审批官画像统计、先例多维检索、复盘卡生成与端点测试（≤220 行） |

⚠️ 严禁修改上表以外的任何文件。

---

## 接口契约（一字不改）

### 1. `core/archive/knowledge_mining.py`
```python
from __future__ import annotations

from typing import Any

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from core.logger import get_logger
from core.models.orm import Case, CaseContextEvent

logger = get_logger(__name__)


def get_all_assessor_insights(db: Session) -> list[dict[str, Any]]:
    """从 CaseContextEvent 与 Case 聚合所有审批官画像与统计数据。

    返回列表项：
    {
        "assessor_name": str,
        "lender": str | None,
        "case_count": int,
        "latest_case_id": str | None,
        "latest_case_ref": str | None,
        "common_blockers": list[str],
        "communication_tips": str,
    }
    """


def search_case_precedents(
    db: Session,
    lender: str | None = None,
    doc_type: str | None = None,
    keyword: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """从归档案件中按机构、方案类型、关键词检索实战先例。"""


def generate_case_knowledge_card(case_id: str, db: Session) -> dict[str, Any] | None:
    """提取单个归档案件的结构化复盘知识卡片。

    返回：
    {
        "case_id": case_id,
        "client_name": str,
        "lender": str,
        "loan_amount": float,
        "strategy_summary": str,
        "key_challenges": list[str],
        "approved_conditions": str,
        "takeaway": str,
    }
    """
```

### 2. `server/api/schemas.py`（追加到文件末尾）
```python
class AssessorInsightItem(BaseModel):
    assessor_name: str
    lender: str | None = None
    case_count: int = 0
    latest_case_id: str | None = None
    latest_case_ref: str | None = None
    common_blockers: list[str] = Field(default_factory=list)
    communication_tips: str = "建议邮件提供清晰材料清单并一次性补齐"


class AssessorListResponse(BaseModel):
    ok: bool
    total_assessors: int = 0
    assessors: list[AssessorInsightItem] = Field(default_factory=list)


class CasePrecedentItem(BaseModel):
    case_id: str
    client_name: str
    property_address: str | None = None
    lender: str | None = None
    loan_amount: float | None = None
    doc_type: str | None = None
    interest_rate: str | None = None
    settlement_date: str | None = None
    summary_highlight: str | None = None


class CasePrecedentSearchResponse(BaseModel):
    ok: bool
    total_found: int = 0
    precedents: list[CasePrecedentItem] = Field(default_factory=list)


class KnowledgeCardResponse(BaseModel):
    ok: bool
    card: dict[str, Any] | None = None
    message: str | None = None
```

### 3. `server/api/archive.py` 追加端点
```python
from core.archive.knowledge_mining import (
    generate_case_knowledge_card,
    get_all_assessor_insights,
    search_case_precedents,
)
from server.api.schemas import (
    AssessorListResponse,
    CasePrecedentSearchResponse,
    KnowledgeCardResponse,
)


@router.get("/assessors", response_model=AssessorListResponse)
def get_assessors_endpoint(
    db: Session = Depends(get_db),  # noqa: B008
) -> AssessorListResponse:
    """获取所有已知审批官画像与统计数据。"""
    items = get_all_assessor_insights(db)
    return AssessorListResponse(ok=True, total_assessors=len(items), assessors=items)


@router.get("/precedents", response_model=CasePrecedentSearchResponse)
def search_precedents_endpoint(
    lender: str | None = None,
    doc_type: str | None = None,
    keyword: str | None = None,
    limit: int = 20,
    db: Session = Depends(get_db),  # noqa: B008
) -> CasePrecedentSearchResponse:
    """多维检索历史结案实战先例。"""
    items = search_case_precedents(
        db, lender=lender, doc_type=doc_type, keyword=keyword, limit=limit
    )
    return CasePrecedentSearchResponse(
        ok=True, total_found=len(items), precedents=items
    )


@router.get("/cases/{case_id}/knowledge-card", response_model=KnowledgeCardResponse)
def get_case_knowledge_card_endpoint(
    case_id: str,
    db: Session = Depends(get_db),  # noqa: B008
) -> KnowledgeCardResponse:
    """获取单个已结案案卷的经验复盘卡片。"""
    card = generate_case_knowledge_card(case_id, db)
    if not card:
        return KnowledgeCardResponse(ok=False, message="案卷不存在或尚未结案")
    return KnowledgeCardResponse(ok=True, card=card)
```

---

## 自动化测试与门禁（`tests/test_api/test_knowledge_mining.py`）

1. `test_get_assessor_insights_aggregation`:
   - 插入 2 个 Case 及关联的 CaseContextEvent（包含 `Rachel Fonseka` 审批官与卡点）；
   - 验证 `get_all_assessor_insights` 准确聚合出审批官姓名、机构、案件数及卡点。
2. `test_search_case_precedents_filtering`:
   - 插入不同 lender（ORDE、CBA）及 doc_type 的归档案件；
   - 验证按 `lender="ORDE"` 准确过滤出对应先例。
3. `test_generate_case_knowledge_card`:
   - 插入已结案 Case，验证生成包含 `strategy_summary`、`key_challenges` 的复盘卡。
4. `test_archive_knowledge_endpoints`:
   - TestClient 验证 `/api/archive/assessors`, `/api/archive/precedents`, `/api/archive/cases/{id}/knowledge-card` 200 响应。

---

## 验收检查命令
```powershell
$env:PYTHONPATH="D:\vera-workbench\.venv\Lib\site-packages"
$env:TESSDATA_PREFIX="C:\Users\Yaruo\AppData\Local\Temp\py311embed\tessdata"
python -m pytest tests/test_api/test_knowledge_mining.py -v
python -m ruff check core/archive/knowledge_mining.py server/api/archive.py server/api/schemas.py tests/test_api/test_knowledge_mining.py
```
- 测试 100% 通过（0 failed）
- ruff 检查 0 errors / 0 warnings
