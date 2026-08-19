# WO-61 知识中心与档案库全景双向打通与工作台先例智库联动 — 执行规范（OpenCode 执行）

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / `pathlib.Path`（禁止 `os.path.join`）
- 禁止：引入任何新的 pip 依赖
- 禁止：创建"改动范围"表以外的文件；禁止修改表以外任何文件
- 禁止：重构、重命名、移动任何既有文件/函数（除非本表明确要求）
- 禁止：访问/读取真实客户文件夹（`D:\EverStones_Test_Clients\...`），测试一律用 `tmp_path` 构造虚拟测试数据
- 严格遵循安全纪律：测试隔离，不向测试目录外写文件

## 背景（为什么要做）

系统目前在「档案库」具备了历史案卷与先例提炼能力，在「知识中心」具备了三层经验架构（`KnowledgeEntry`），但两者存在数据割裂：
1. **归档自动沉淀入知识库（Archive ➔ Knowledge Sync）**：
   - 历史案卷归档入库或新案结案时，AI 提炼的《实战复盘知识卡》与审批官习惯应自动写入 `KnowledgeEntry`（`layer="global_experience"`, `source="archive_precedent"`）；
2. **知识中心双向溯源（Knowledge ➔ Archive Traceability）**：
   - 知识中心的先例条目支持反向关联 `case_id`，供 Vera 一键穿透至档案库查看原始案卷；
3. **工作台在办案件先例智库推荐（Workbench Precedent Recommender）**：
   - 当 Vera 在工作台处理案件时，根据当前案卷的目标机构（如 `ORDE`）、方案（`Alt Doc`）与当前卡点（如 `valuation_shortfall`），自动从知识中心推荐最相关的 1~3 个历史相似破局先例与审批官沟通锦囊！

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `core/archive/knowledge_bridge.py` | **新建** | 档案先例沉淀同步入知识库、反向溯源与工作台先例推荐匹配引擎（≤260 行） |
| `server/api/schemas.py` | 修改 | 文件末尾追加 `KnowledgeSyncResponse`、`RecommendedPrecedentItem`、`CaseRecommendedPrecedentsResponse` |
| `server/api/archive.py` | 修改 | 追加 `POST /api/archive/sync-knowledge` 端点（约 20 行） |
| `server/api/cases.py` | 修改 | 追加 `GET /api/cases/{case_id}/recommended-precedents` 端点（约 25 行） |
| `tests/test_api/test_knowledge_bridge.py` | **新建** | 知识同步写入、反向溯源字段、工作台精准推荐算法与 2 个 API 端点测试（≤220 行） |

⚠️ 严禁修改上表以外的任何文件。

---

## 接口契约（一字不改）

### 1. `core/archive/knowledge_bridge.py`
```python
from __future__ import annotations

import json
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from core.archive.knowledge_mining import generate_case_knowledge_card
from core.logger import get_logger
from core.models.orm import Case, KnowledgeEntry

logger = get_logger(__name__)


def sync_archive_to_knowledge_base(db: Session) -> dict[str, Any]:
    """遍历所有已结档案件，为尚未生成 KnowledgeEntry 的案卷提炼复盘卡并落库。

    落库规则：
    1. 仅针对 stage == 'closed' 或 close_reason == 'settled' 的 Case；
    2. 检查是否已存在 source == 'archive_precedent' 且 case_id == case.id 的条目（幂等）；
    3. 调用 generate_case_knowledge_card(case.id, db)；
    4. 写入 KnowledgeEntry:
       - layer = "global_experience"
       - category = "precedent_insight"
       - source = "archive_precedent"
       - lender = case.lender
       - case_id = case.id
       - title = f"【实战先例】{case.lender} · {case.client_name} · ${case.loan_amount:,.0f}"
       - content = json.dumps(card, ensure_ascii=False)
       - vera_confirmed = True
    5. 返回 {"ok": True, "synced_count": int, "total_precedents": int}。
    """


def get_recommended_precedents_for_case(
    case_id: str,
    db: Session,
    limit: int = 3,
) -> list[dict[str, Any]]:
    """根据当前在办案件的机构、方案类型与卡点，智能匹配历史最相似的先例。

    匹配打分规则：
    1. 获取当前 case 的 lender, doc_type, 以及最新的 blocker（来自 CaseContextEvent）；
    2. 检索所有 source == 'archive_precedent' 且 case_id != case_id 的 KnowledgeEntry；
    3. 相似度打分：
       - 同机构 (lender 相同) +30 分
       - 相同卡点关键词 (blocker 相关) +40 分
       - 相同方案 (doc_type 相同) +20 分
    4. 按得分倒序返回前 limit 个最相关的先例与策略。
    """
```

### 2. `server/api/schemas.py`（追加到文件末尾）
```python
class KnowledgeSyncResponse(BaseModel):
    ok: bool
    synced_count: int = 0
    total_precedents: int = 0
    message: str | None = None


class RecommendedPrecedentItem(BaseModel):
    precedent_id: str
    case_id: str
    title: str
    lender: str | None = None
    client_name: str | None = None
    strategy_summary: str | None = None
    takeaway: str | None = None
    relevance_score: int = 0
    match_reasons: list[str] = Field(default_factory=list)


class CaseRecommendedPrecedentsResponse(BaseModel):
    ok: bool
    case_id: str
    total_recommended: int = 0
    precedents: list[RecommendedPrecedentItem] = Field(default_factory=list)
```

### 3. `server/api/archive.py` 追加端点
```python
from core.archive.knowledge_bridge import sync_archive_to_knowledge_base
from server.api.schemas import KnowledgeSyncResponse


@router.post("/sync-knowledge", response_model=KnowledgeSyncResponse)
def sync_archive_knowledge_endpoint(
    db: Session = Depends(get_db),  # noqa: B008
) -> KnowledgeSyncResponse:
    """一键将档案库历史结案先例同步蒸馏入知识中心（KnowledgeEntry）。"""
    res = sync_archive_to_knowledge_base(db)
    return KnowledgeSyncResponse(**res)
```

### 4. `server/api/cases.py` 追加端点
```python
from core.archive.knowledge_bridge import get_recommended_precedents_for_case
from server.api.schemas import CaseRecommendedPrecedentsResponse


@router.get("/{case_id}/recommended-precedents", response_model=CaseRecommendedPrecedentsResponse)
def get_case_precedents_endpoint(
    case_id: str,
    limit: int = 3,
    db: Session = Depends(get_db),  # noqa: B008
) -> CaseRecommendedPrecedentsResponse:
    """获取与当前在办案件最匹配的历史实战先例与破局策略。"""
    items = get_recommended_precedents_for_case(case_id, db=db, limit=limit)
    return CaseRecommendedPrecedentsResponse(
        ok=True,
        case_id=case_id,
        total_recommended=len(items),
        precedents=items,
    )
```

---

## 自动化测试与门禁（`tests/test_api/test_knowledge_bridge.py`）

1. `test_sync_archive_to_knowledge_base`:
   - 插入 2 个结案 Case，调用 `sync_archive_to_knowledge_base`；
   - 验证 `KnowledgeEntry` 表生成了 `source="archive_precedent"` 的记录，再次调用验证幂等性。
2. `test_get_recommended_precedents_matching`:
   - 插入 ORDE 估价卡点的先例 KnowledgeEntry；
   - 创建一个新的 ORDE 活跃 Case，验证推荐引擎精准匹配并给出最高评分与匹配理由。
3. `test_archive_and_cases_endpoints`:
   - TestClient 验证 `POST /api/archive/sync-knowledge` 与 `GET /api/cases/{case_id}/recommended-precedents` 端点 200 响应。

---

## 验收检查命令
```powershell
$env:PYTHONPATH="D:\vera-workbench\.venv\Lib\site-packages"
$env:TESSDATA_PREFIX="C:\Users\Yaruo\AppData\Local\Temp\py311embed\tessdata"
python -m pytest tests/test_api/test_knowledge_bridge.py -v
python -m ruff check core/archive/knowledge_bridge.py server/api/archive.py server/api/cases.py server/api/schemas.py tests/test_api/test_knowledge_bridge.py
```
- 测试 100% 通过（0 failed）
- ruff 检查 0 errors / 0 warnings
