# WO-35 会话压缩 — 执行规范

> 状态：待执行（2026-08-14 起草）
> 背景：`core/chat/context.py` 对话层只保留最近 10 条消息，超出直接从头部丢弃；docstring 声称"已蒸馏进摘要"但实际无该机制。本单补齐：窗口外消息压缩为摘要事件，写 `CaseContextEvent`（`source_type=session_compression`），对话层前置注入。设计参考 DeepSeek Harness 的 compaction（事后压缩）。

## 一、技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / Pydantic v2
- 禁止：引入任何新的 pip 依赖
- 禁止：创建计划外的新文件/新目录
- 禁止：修改 `core/models/orm.py`、`core/agents/*`、`config/agent_flows/*.yaml`、`server/*`、前端 `ui/`
- 禁止：新增数据库迁移（复用现有 `case_context_events` 表，无新列）
- 只允许修改/新建：
  - `core/chat/compression.py`（新建，≤200 行）
  - `core/chat/context.py`（修改，最小改动）
  - `core/config.py`（修改，新增配置类 + AiConfig 字段）
  - `config/settings.yaml`（修改，ai 段新增节点）
  - `tests/test_core/test_session_compression.py`（新建）
- PII 红线：LLM 出站文本必须经 `desensitize()`（`core.pii.gateway`），入站结果必须 `rehydrate()`；摘要正文只存本地 SQLite

## 二、接口契约（变量名/函数名/字段名写死，一字不改）

### 配置（config/settings.yaml → `ai:` 段末尾，`routing:` 之后）

```yaml
  session_compression:
    enabled: true
    trigger_messages: 30   # 未压缩消息数 ≥ 该值触发压缩
    keep_messages: 20      # 压缩后保留的最近消息数（对话窗口外才压缩）
    summary_max_chars: 600 # 摘要文本上限
```

### 配置类（core/config.py）

```python
class SessionCompressionConfig(BaseModel):
    """会话压缩（WO-35）：长对话窗口外消息蒸馏为摘要事件。"""

    enabled: bool = True
    trigger_messages: int = Field(default=30, ge=10, le=200)
    keep_messages: int = Field(default=20, ge=10, le=100)
    summary_max_chars: int = Field(default=600, ge=200, le=2000)


class AiConfig(BaseModel):
    """AI API configuration."""

    primary: AiProviderConfig
    fallback: AiProviderConfig | None = None
    max_retries: int = Field(ge=0, le=10)
    timeout_seconds: int = Field(gt=0)
    confidence_threshold: float = Field(ge=0.0, le=1.0)
    routing: AiRoutingConfig = Field(default_factory=AiRoutingConfig)
    session_compression: SessionCompressionConfig = Field(default_factory=SessionCompressionConfig)
```

### 核心模块（core/chat/compression.py，新建）

```python
"""会话压缩 — 对话窗口外消息蒸馏为 CaseContextEvent 摘要（WO-35）。"""

from __future__ import annotations

from sqlalchemy.orm import Session

from core.logger import get_logger
from core.models.orm import CaseChatMessage, CaseContextEvent

logger = get_logger(__name__)

SESSION_COMPRESSION_SOURCE_TYPE = "session_compression"
_SOURCE_REF_PREFIX = "session_compression:"


def ensure_session_compression(case_id: str, db: Session, track: str = "internal") -> str:
    """懒压缩入口（幂等）：未压缩消息 ≥ trigger_messages → 压缩并写事件；返回最新摘要文本。

    Args:
        case_id: 案件 ID
        db: SQLAlchemy session
        track: 压缩事件归属轨道（internal | external，对话层本身不区分轨道）

    Returns:
        最新压缩摘要文本；无压缩/被禁用/失败时返回 ""（失败仅 logger.warning，不抛异常）。
    """


def _last_compressed_msg_id(case_id: str, db: Session) -> int:
    """最新 session_compression 事件 source_ref 中解析的 last_msg_id；无则 0。"""


def _should_compress(case_id: str, db: Session, trigger_messages: int) -> bool:
    """未压缩消息数（id > 上次压缩最后消息 id）≥ trigger_messages。"""


def _compress(
    case_id: str, db: Session, track: str,
    trigger_messages: int, keep_messages: int, summary_max_chars: int,
) -> str | None:
    """取未压缩消息（按 id 升序，最多 500 条）→ 保留最近 keep_messages 条 →
    其余脱敏摘要 → 写事件。返回摘要文本；失败返回 None。"""


def _summarize(case_id: str, blocks: list[str], db: Session, max_chars: int) -> str:
    """脱敏 → LLM 摘要 → rehydrate。LLM 失败回退文本尾部截断（仍返回非空，不抛异常）。"""
```

### 事件写入契约

- `CaseContextEvent(source_type=SESSION_COMPRESSION_SOURCE_TYPE, content=摘要, track=track, status="confirmed", source_ref=f"session_compression:{last_msg_id}:{count}")`
- `last_msg_id` = 被压缩消息的最大 id；`count` = 被压缩消息条数 → `source_ref` 兼作去重键（幂等锚点）
- 新事件写入后 `db.commit()`；压缩不删除任何 `CaseChatMessage`（不可变审计，仅不再注入）

### 对话层接线（core/chat/context.py）

- L47 `build_chat_layers`：`{"layer": "dialogue", "text": _build_dialogue(case_id, db)}` → 加 `track` 实参
- L51 `_build_dialogue(case_id: str, db: Session)` → `_build_dialogue(case_id: str, db: Session, track: str)`
- `_build_dialogue` 内、现有窗口查询之前：`from core.chat.compression import ensure_session_compression; summary = ensure_session_compression(case_id, db, track)`
- 返回文本前，若 `summary` 非空：`text = f"【历史对话摘要】\n{summary}\n\n{text}"`（窗口逻辑/预算截断保持不变，摘要计入文本）

## 三、实施步骤（每步完成即运行验证命令）

### Step 1：配置落地
- [ ] `config/settings.yaml`：`ai:` 段 `routing:` 之后新增 `session_compression:` 节点（含 enabled/trigger_messages/keep_messages/summary_max_chars）
- [ ] `core/config.py`：新增 `SessionCompressionConfig` 类；`AiConfig` 末尾追加 `session_compression` 字段
- [ ] 验证：`.venv\Scripts\python.exe -c "from core.config import get_config; c=get_config(); print(c.ai.session_compression)"` 输出默认配置且不报错

### Step 2：压缩模块
- [ ] 新建 `core/chat/compression.py`，按"接口契约"逐函数实现（`_last_compressed_msg_id` / `_should_compress` / `_compress` / `_summarize` / `ensure_session_compression`）
- [ ] `_summarize`：`desensitize(blocks 拼接文本, case_id, db)` → `ApiGateway(get_config()).call_llm(text=DesensitizedText(...), prompt_template="Session compression summary.")` → `rehydrate(...)`；JSON 输出解析失败/空结果 → 回退 `blocks 拼接[:max_chars]`；异常只 `logger.warning` 不抛出
- [ ] 摘要 prompt 要求：中文、保留关键事实（客户目标/数字/决定/待办）、不编造；输出纯文本（无 markdown）
- [ ] 验证：`ruff check core/chat/compression.py` → All checks passed

### Step 3：对话层接线
- [ ] `core/chat/context.py`：`build_chat_layers` 的 dialogue 行传 `track`；`_build_dialogue` 签名加 `track: str`；窗口查询前调 `ensure_session_compression` 并在返回前前置摘要
- [ ] 不改 `LAYER_ORDER` / `DIALOGUE_WINDOW_ROUNDS` / `DIALOGUE_TOKEN_BUDGET`；摘要计入 dialogue 文本后若超预算仍按现有头部截断逻辑处理
- [ ] 验证：`pytest tests/test_core/test_injection.py -q` → 全绿（既有 5 层注入测试不回归）

### Step 4：测试
- [ ] 新建 `tests/test_core/test_session_compression.py`，用例（每个用例一行注释说明断言）：
  1. `test_disabled_does_not_compress` — `enabled=False` 时插入 40 条消息 → 无 session_compression 事件
  2. `test_below_threshold_returns_empty` — 15 条消息 → `ensure_session_compression` 返回 `""`
  3. `test_compress_writes_event` — 40 条消息 → 事件存在，`source_type=="session_compression"`、`status=="confirmed"`、`source_ref` 前缀 `session_compression:`、`content` 非空、`track=="internal"`
  4. `test_compress_idempotent` — 再次调用 → 事件总数不变（source_ref 去重生效）
  5. `test_keep_recent_messages_not_compressed` — 摘要 content 不含最近 20 条内的标记词（构造消息时用唯一标记词验证）
  6. `test_llm_failure_fallback_truncation` — monkeypatch `ApiGateway.call_llm` 抛异常 → 事件仍写入、content 为截断文本非空
  7. `test_summary_injected_into_dialogue` — 压缩后 `build_chat_layers(case_id, "你好", "internal", db)` 的 dialogue 层文本含 `【历史对话摘要】`
  8. `test_pii_rehydrated_in_summary` — 消息含 `PERSON_1` 占位符 → 摘要经 rehydrate 后不含原始占位符形态的泄漏标记（或含还原值）
- [ ] 验证：`pytest tests/test_core/test_session_compression.py -q` → 全部通过

### Step 5：全量门禁
- [ ] `pytest tests/ -q` → 915 基线 + 新增全绿，0 failed / 0 skipped
- [ ] `ruff check core/chat/compression.py core/chat/context.py core/config.py tests/test_core/test_session_compression.py` → All checks passed
- [ ] `python -c "import core.chat.compression, core.chat.context"` → 无循环导入

## 四、本次改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `config/settings.yaml` | 修改 | ai 段 routing 之后 |
| `core/config.py` | 修改 | AiConfig 类（L122 附近）+ 前新增 SessionCompressionConfig |
| `core/chat/compression.py` | 新建 | — |
| `core/chat/context.py` | 修改 | L47 + L51 签名 + _build_dialogue 内 |
| `tests/test_core/test_session_compression.py` | 新建 | — |

⚠️ 严禁修改上表以外的任何文件。
⚠️ 严禁重命名、移动或删除任何现有文件。
⚠️ 严禁修改 import 以外的现有代码逻辑（context.py 仅允许上述三处最小改动）。

## 五、验收标准

### 自动验证（必须全部通过）
- `pytest tests/test_core/test_session_compression.py -q` → 8 项全绿
- `pytest tests/test_core/test_injection.py -q` → 既有注入测试零回归
- `pytest tests/ -q` → ≥915 全绿，0 failed / 0 skipped
- `ruff check`（上表 4 个 py 文件）→ All checks passed

### 手动验证
1. 单测已覆盖：40 条消息后压缩事件落库，`source_type=session_compression`、`status=confirmed`
2. 二次调用幂等：事件数不增加
3. `build_chat_layers` 输出 dialogue 层含"【历史对话摘要】"前缀
4. 关闭 `enabled` 后行为恢复现状（窗口外消息不再压缩）

---
⚠️ 执行纪律（每一条都必须遵守）：
1. 只修改"改动范围"表中列出的文件，绝不碰其他文件
2. 所有变量名/函数名/字段名严格按照"接口契约"章节的定义，一个字符都不能改
3. 每完成一个 Step 立即运行该 Step 的验证命令
4. 如果验证失败，停下来报告错误内容，不要自己尝试修复计划外的代码
5. 不要引入任何"技术约束"章节中未列出的依赖库
6. 不要创建任何"改动范围"表中未列出的新文件
7. 不要重构、优化、美化任何计划外的代码
