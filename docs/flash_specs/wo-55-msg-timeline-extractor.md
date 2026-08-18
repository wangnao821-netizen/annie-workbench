# WO-55 邮件时序提取与审批官/案号/卡点落库 — 执行规范（OpenCode 执行）

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / `pathlib.Path`（禁止 `os.path.join`）
- 禁止：引入任何新的 pip 依赖（使用内置/已装的 `extract_msg` 库）
- 禁止：创建"改动范围"表以外的文件；禁止修改表以外任何文件
- 禁止：重构、重命名、移动任何既有文件/函数（除非本表明确要求）
- 禁止：访问/读取真实客户文件夹（`D:\EverStones_Test_Clients\...`），测试一律用 `tmp_path` 构造虚拟测试数据或 Mock
- 所有路径操作必须 `pathlib.Path`，不硬编码分隔符
- 严格遵循安全纪律：测试隔离，不向测试目录外写文件

## 背景（为什么要做）

在澳洲真实信贷案卷中，客户案卷子目录内（如 `8. Refi & cash - ORDE小号...`）通常散落着 1~N 封 Outlook `.msg` 往来邮件（例如：递交确认函、审批官指派通知、估价报告及估价过低通知、复议申诉 Argument Letter 往来等）。
目前系统缺乏对这些关键沟通邮件的时序重构能力，无法直观展示案件经历了哪些流转、当前审批官（Assessor）是谁、银行系统案号是多少、以及因何原因卡点（如估价过低 $1.9M vs 期望 $2.3M）。

本单目标：
1. 实现 **`core/pipeline/msg_timeline.py`**（邮件时序提取与智能定性引擎）：
   - 遍历案卷内所有 `.msg` 邮件；
   - 提取邮件发送时间、发件人、收件人、主题、正文摘要；
   - **智能正则萃取**：
     - 审批官：从 `assigned to Rachel Fonseka for assessment` 等提取 `Rachel Fonseka`；
     - 银行案号：从 `23174 (EX 11199)` 或 `App ID: 23174` 提取案号；
     - 事件定性：`submission_lodged`（递交）、`assessor_assigned`（分单）、`mir_requested`（补件）、`valuation_shortfall`（估价低阻断）、`reassessment_submitted`（复议）、`approval_issued`（批复）；
   - 构建正序时间线图谱；
   - 同步写入 `CaseContextEvent`（`source_type="email_timeline"`），确保案件大脑实时感知；
2. 提供查询端点：`GET /api/cases/{case_id}/timeline`；
3. 提供主动重扫端点：`POST /api/cases/{case_id}/timeline/extract-emails`。

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `core/pipeline/msg_timeline.py` | **新建** | `.msg` 解析、正则提取、时序重构与事件落库（≤260 行） |
| `server/api/schemas.py` | 修改 | 文件末尾追加时间线响应模型 `TimelineEventItem`、`CaseTimelineResponse`、`TimelineExtractResponse` |
| `server/api/cases.py` | 修改 | 文件末尾追加 2 个 API 端点（`GET /{case_id}/timeline` 与 `POST /{case_id}/timeline/extract-emails`） |
| `tests/test_api/test_msg_timeline.py` | **新建** | 邮件时序提取、审批官识别、卡点定性与端点全量测试（≤240 行） |

⚠️ 严禁修改上表以外的任何文件。

---

## 接口契约（一字不改）

### 1. `core/pipeline/msg_timeline.py`
```python
from __future__ import annotations

import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from core.logger import get_logger
from core.models.orm import Case, CaseContextEvent

logger = get_logger(__name__)

_ASSESSOR_PATTERNS = (
    re.compile(r"assigned to\s+([A-Za-z\s]+?)\s+for assessment", re.IGNORECASE),
    re.compile(r"assessor\s*[:：]\s*([A-Za-z\s]+?)(?=\r|\n|$)", re.IGNORECASE),
    re.compile(r"credit analyst\s*[:：]\s*([A-Za-z\s]+?)(?=\r|\n|$)", re.IGNORECASE),
)

_REF_PATTERNS = (
    re.compile(r"\b(\d{5,8}\s*\([A-Za-z0-9\s]+\))\b"),
    re.compile(r"(?:app(?:lication)?\s*(?:id|ref|no|#)?\s*[:：#]?\s*)([A-Za-z0-9\-_]{5,20})", re.IGNORECASE),
    re.compile(r"(?:orde|cba|anz|nab|westpac|zank|brighten)\s*(?:ref|id)?\s*[:：#]?\s*([A-Za-z0-9\-_]{5,20})", re.IGNORECASE),
)


def extract_timeline_from_folder(folder_path: Path) -> list[dict[str, Any]]:
    """扫描目录下的所有 .msg 邮件并返回正序时间线事件列表。"""


def sync_timeline_for_case(case_id: str, db: Session) -> dict[str, Any]:
    """对指定案件执行邮件时间线扫描、解析审批官/案号并落库 CaseContextEvent。"""


def get_timeline_for_case(case_id: str, db: Session) -> list[dict[str, Any]]:
    """查询指定案件的时序事件（优先读取已落库事件，无则尝试即时扫描）。"""
```

### 2. `server/api/schemas.py`（追加到文件末尾）
```python
class TimelineEventItem(BaseModel):
    id: str | None = None
    event_time: str
    event_type: str  # submission_lodged / assessor_assigned / mir_requested / valuation_shortfall / reassessment_submitted / approval_issued / note
    title: str
    summary: str
    sender: str | None = None
    assessor: str | None = None
    lender_ref: str | None = None
    source_file: str | None = None
    is_blocker: bool = False
    blocker_reason: str | None = None


class CaseTimelineResponse(BaseModel):
    ok: bool
    case_id: str
    assessor_name: str | None = None
    lender_ref: str | None = None
    active_blocker: str | None = None
    events: list[TimelineEventItem] = Field(default_factory=list)


class TimelineExtractResponse(BaseModel):
    ok: bool
    case_id: str
    extracted_count: int
    assessor_name: str | None = None
    lender_ref: str | None = None
    active_blocker: str | None = None
```

### 3. `server/api/cases.py`（追加到文件末尾）
```python
from core.pipeline.msg_timeline import get_timeline_for_case, sync_timeline_for_case
from server.api.schemas import CaseTimelineResponse, TimelineExtractResponse


@router.get("/{case_id}/timeline", response_model=CaseTimelineResponse)
def get_case_timeline(
    case_id: str,
    db: Session = Depends(get_db),  # noqa: B008
) -> CaseTimelineResponse:
    """获取案件的沟通邮件时序脉络、审批官与关键卡点。"""
    events = get_timeline_for_case(case_id, db)
    case = db.query(Case).filter(Case.id == case_id).first()
    assessor = None
    lender_ref = None
    active_blocker = None
    for ev in reversed(events):
        if not assessor and ev.get("assessor"):
            assessor = ev["assessor"]
        if not lender_ref and ev.get("lender_ref"):
            lender_ref = ev["lender_ref"]
        if not active_blocker and ev.get("is_blocker"):
            active_blocker = ev.get("blocker_reason") or ev.get("title")

    return CaseTimelineResponse(
        ok=True,
        case_id=case_id,
        assessor_name=assessor,
        lender_ref=lender_ref,
        active_blocker=active_blocker,
        events=[TimelineEventItem(**e) for e in events],
    )


@router.post("/{case_id}/timeline/extract-emails", response_model=TimelineExtractResponse)
def extract_case_emails_timeline(
    case_id: str,
    db: Session = Depends(get_db),  # noqa: B008
) -> TimelineExtractResponse:
    """重新扫描案件关联目录中的 .msg 邮件，提取时序图谱并落库。"""
    res = sync_timeline_for_case(case_id, db)
    return TimelineExtractResponse(
        ok=True,
        case_id=case_id,
        extracted_count=res.get("extracted_count", 0),
        assessor_name=res.get("assessor_name"),
        lender_ref=res.get("lender_ref"),
        active_blocker=res.get("active_blocker"),
    )
```

---

## 自动化测试与门禁（`tests/test_api/test_msg_timeline.py`）

1. `test_extract_assessor_and_ref`:
   - 验证从包含 `assigned to Rachel Fonseka for assessment` 及 `23174 (EX 11199)` 的文本中精准提取审批官与案号。
2. `test_event_classification_valuation_shortfall`:
   - 验证估价低邮件被正确分类为 `valuation_shortfall`，标记 `is_blocker = True`，提取卡点说明。
3. `test_sync_timeline_for_case_with_mock`:
   - Mock 邮件解析器，验证 `sync_timeline_for_case` 成功写入 `CaseContextEvent`，且时间线正序排序。
4. `test_timeline_endpoints`:
   - 通过 FastAPI TestClient 调用 `GET /api/cases/{case_id}/timeline` 与 `POST /api/cases/{case_id}/timeline/extract-emails`，验证 HTTP 200 及返回结构。

---

## 验收检查命令
```powershell
$env:PYTHONPATH="D:\vera-workbench\.venv\Lib\site-packages"
$env:TESSDATA_PREFIX="C:\Users\Yaruo\AppData\Local\Temp\py311embed\tessdata"
python -m pytest tests/test_api/test_msg_timeline.py -v
python -m ruff check core/pipeline/msg_timeline.py server/api/cases.py server/api/schemas.py tests/test_api/test_msg_timeline.py
```
- 测试 100% 通过（0 failed）
- ruff 检查 0 errors / 0 warnings
