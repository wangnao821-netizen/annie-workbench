# WO-16：对话协议 — 非流式 + 服务端工具循环 + 结构化卡片（#12 定稿落地）

> 来源：CASE 大脑 V1 收口 #12（V1 非流式：POST /api/chat 一次请求一次完整回复；工具循环在服务端；结构化卡片：低置信确认卡 / 草稿卡+披露清单 / 流程卡，前端只渲染；流式 V2 协议预留 text_chunk/tool_call/tool_result/record_confirm/done）+ #2（全局对话只读：无 case_id 时不启用工具）+ #6（record_fact 高置信 confirmed / 低置信 pending 走确认卡）。执行方：opencode。检查方：Codex。
> 前置：WO-14 确认闸门（已交付）、WO-15 BrainFact（已交付）。#8 五层注入 + 对话窗口 + 缓存命中率归 **WO-17**；draft_email 工具 + 草稿卡落库归 **WO-18**——本单只做协议骨架 + 2 个 V1 工具（record_fact / suggest_submission）。

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / Pydantic v2
- 禁止：引入任何新的 pip 依赖；禁止创建本表以外的文件；禁止修改本表以外的文件
- 禁止：改数据库迁移（本单无表结构变更）
- 允许：复用现有 `ApiGateway.call_llm`（已支持 `tools` / `tool_choice`，`ApiCallResult.tool_calls` 已就绪）
- 脱敏红线：工具参数与回注结果必须走 desensitize/rehydrate 边界；全局对话（无 case_id）**不启用工具**

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `server/api/schemas.py` | 修改 | `ChatRequest` 加 track；`ChatResponse` 扩展；新增 `ToolCard` |
| `core/chat/__init__.py` | **新建** | 空文件（或一行 docstring） |
| `core/chat/tools.py` | **新建** | TOOL_SCHEMAS + execute_tool（≤200 行） |
| `core/chat/loop.py` | **新建** | run_chat_with_tools 服务端工具循环（≤200 行） |
| `server/api/chat.py` | 修改 | chat 端点改调 run_chat_with_tools；响应含 tool_cards/recorded_facts |
| `tests/test_api/test_chat_protocol.py` | **新建** | 协议测试（≤200 行） |

⚠️ 严禁修改上表以外的文件（含 core/ai/gateway.py、core/drafts/、前端）。严禁改动迁移。

---

## 一、Schemas（`server/api/schemas.py`）

### ChatRequest（现有字段不变，追加）

```python
class ChatRequest(BaseModel):
    # ...现有 case_id / message 字段保留...
    track: Literal["internal", "external"] = "internal"  # 对话轨道（递交模式=external）
```

### ToolCard + ChatResponse

```python
class ToolCard(BaseModel):
    """结构化工具卡（前端只渲染，不执行）。"""
    type: Literal["record_confirm", "draft", "submission_suggest", "flow"]
    title: str
    payload: dict  # 结构见契约说明


class ChatResponse(BaseModel):
    reply: str
    tool_cards: list[ToolCard] = []
    recorded_facts: list[dict] = []        # [{event_id, content, status:"confirmed"}]
    suggested_actions: list[str] = []
```

payload 契约（V1）：
- `record_confirm`：`{ "event_id": int, "content": str, "source_type": str, "track": "internal"|"external", "status": "pending" }`
- `submission_suggest`：`{ "message": "检测到递交/写银行内容意图，要进入递交模式吗？" }`
- `draft` / `flow`：类型预留，本单不产出（payload 可为 `{}`）

---

## 二、core/chat/tools.py（工具白名单，≤200 行）

```python
"""对话工具白名单 — V1 两个工具：record_fact / suggest_submission。"""

from __future__ import annotations

from sqlalchemy.orm import Session

from core.context.accumulator import append_context_event
from core.logger import get_logger

logger = get_logger(__name__)

TOOL_SCHEMAS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "record_fact",
            "description": (
                "把用户确认的事实记录进案件账本。"
                "金额/日期/银行名/明确姓名等无歧义信息 confidence=high 直接记录；"
                "判断性、模糊或需要 VERA 确认的信息 confidence=low 进入待确认。"
                "只在案件对话中使用。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "content": {"type": "string", "description": "要记录的事实原文（中文）"},
                    "confidence": {"type": "string", "enum": ["high", "low"]},
                },
                "required": ["content", "confidence"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "suggest_submission",
            "description": "检测到用户要写银行邮件/递交材料/翻译外线内容时调用，提示进入递交模式。",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
]


def execute_tool(
    name: str,
    arguments: dict,
    case_id: str,
    track: str,
    db: Session,
) -> dict:
    """白名单工具执行（V1 只允许 TOOL_SCHEMAS 内名称）。

    Args:
        name: 工具名（record_fact | suggest_submission）。
        arguments: 工具参数（LLM 生成，已处脱敏环境）。
        case_id: 案件 ID（全局对话为空串）。
        track: internal | external。
        db: SQLAlchemy session。

    Returns:
        结构化结果（回注给 LLM / 生成卡片）。
    """
    if name == "record_fact":
        return _record_fact(arguments, case_id, track, db)
    if name == "suggest_submission":
        return {"suggest": True}
    return {"ok": False, "error": f"unknown tool: {name}"}


def _record_fact(arguments: dict, case_id: str, track: str, db: Session) -> dict:
    """record_fact 实现：高置信直接 confirmed，低置信 pending（#6）。"""
    if not case_id:
        return {"ok": False, "error": "全局对话禁止写事实"}
    content = str(arguments.get("content", "")).strip()
    if not content:
        return {"ok": False, "error": "content 不能为空"}
    confidence = arguments.get("confidence", "low")
    status = "confirmed" if confidence == "high" else "pending"
    try:
        event = append_context_event(
            case_id=case_id,
            source_type="manual_note",
            content=content,
            db=db,
            trigger_distill=status == "confirmed",
            track=track,
            status=status,
        )
        return {"ok": True, "event_id": event.id, "status": event.status}
    except Exception as exc:  # noqa: BLE001 — 工具失败不阻断对话
        logger.warning("record_fact failed: %s", exc)
        return {"ok": False, "error": str(exc)}
```

> `append_context_event` 的 `status` 参数为 WO-14 已加（keyword-only，默认 confirmed）——直接复用。

---

## 三、core/chat/loop.py（服务端工具循环，≤200 行）

```python
"""服务端工具循环 — 非流式对话协议（#12）。"""

from __future__ import annotations

from sqlalchemy.orm import Session

from core.ai.context_builder import assemble_context
from core.ai.gateway import ApiGateway, ApiCallResult
from core.chat.tools import TOOL_SCHEMAS, execute_tool
from core.config import get_config
from core.logger import get_logger
from core.models.types import DesensitizedText
from core.pii.gateway import desensitize, rehydrate

logger = get_logger(__name__)

MAX_TOOL_ROUNDS = 3

_SYSTEM_PROMPT = "你是澳洲贷款经纪团队的 AI 助手。回答要具体到这个客户，不要给通用建议。"


def run_chat_with_tools(
    case_id: str | None,
    message: str,
    track: str,
    db: Session,
) -> dict:
    """组装上下文 → 脱敏 → LLM（带工具）→ 白名单执行 → 回注 → 最终回复。

    全局对话（case_id 为空）→ tool_choice="none"（只读，#2 协议）。
    工具循环最多 MAX_TOOL_ROUNDS 轮，超限截断并提示。

    Returns:
        {"reply": str, "tool_cards": list[dict], "recorded_facts": list[dict]}
    """
    scope = case_id or "system"
    safe_message = desensitize(message, scope, db)
    if case_id:
        ctx = assemble_context(case_id, "case_chat", db, extra_data=safe_message)
        base_prompt = (
            f"{ctx.role_prompt}\n\n【团队经验】\n{ctx.team_experience}\n\n"
            f"【案件大脑】\n{ctx.case_brain}\n\n【实时数据】\n{ctx.live_data}"
        )
    else:
        base_prompt = _SYSTEM_PROMPT

    tool_choice = "auto" if case_id else "none"
    messages: list[dict] = []          # 追加轮次的对话消息（tool 回注）
    tool_cards: list[dict] = []
    recorded_facts: list[dict] = []
    gw = ApiGateway(get_config())

    for _round in range(MAX_TOOL_ROUNDS):
        prompt = base_prompt + "\n\n" + _format_tool_round(messages)
        result = gw.call_llm(
            text=DesensitizedText(prompt),
            prompt_template=prompt,
            system_prompt=_SYSTEM_PROMPT,
            tools=TOOL_SCHEMAS if case_id else None,
            tool_choice=tool_choice,
        )
        if not result.tool_calls:
            reply = rehydrate(result.response_text, scope, db)
            return {"reply": reply, "tool_cards": tool_cards, "recorded_facts": recorded_facts}
        for call in result.tool_calls:
            out = execute_tool(call.get("name", ""), call.get("arguments") or {}, case_id or "", track, db)
            messages.append({"role": "tool", "name": call.get("name"), "content": _tool_result_text(out)})
            _collect_cards(out, tool_cards, recorded_facts)
        if _round == MAX_TOOL_ROUNDS - 1:
            break

    return {
        "reply": "本轮工具调用过多，已截断。请再说一次你的需求，或直接在右栏手动记录。",
        "tool_cards": tool_cards,
        "recorded_facts": recorded_facts,
    }
```

> 私有助手（模块内）：
> - `_format_tool_round(messages)`：把 tool 回注消息序列化为文本块（无 PII：只含 event_id/status/ok 等结构化字段）；
> - `_tool_result_text(out)`：把 execute_tool 结果序列化为 JSON 字符串（**不包含用户原文 content**，只含结构化字段）；
> - `_collect_cards(out, tool_cards, recorded_facts)`：record_fact low → record_confirm 卡；high → recorded_facts；suggest_submission → submission_suggest 卡。
>
> 工具结果不回注 content 原文（防 PII 二次暴露）；事件原文已按 WO-14 语义入库。

---

## 四、server/api/chat.py 改造

`chat()` 端点改为：

```python
@router.post("/", response_model=ChatResponse)
def chat(
    req: ChatRequest,
    db: Session = Depends(get_db),  # noqa: B008
):
    """发送消息给 AI — 服务端工具循环（#12）。"""
    case_id = req.case_id or ""
    try:
        result = run_chat_with_tools(
            case_id=req.case_id,
            message=req.message,
            track=req.track,
            db=db,
        )
    except Exception:
        logger.exception("AI chat failed for scope=%s", case_id or "system")
        raise HTTPException(status_code=502, detail="AI 服务暂时不可用，请稍后重试")

    reply = result["reply"]
    if case_id:
        db.add_all([
            CaseChatMessage(case_id=case_id, session_id=case_id, role="user", content=req.message),
            CaseChatMessage(case_id=case_id, session_id=case_id, role="assistant", content=reply),
        ])
        mark_case_summary_dirty(case_id, db)
    else:
        db.add_all([
            GlobalChatMessage(session_id="global", role="user", content=req.message),
            GlobalChatMessage(session_id="global", role="assistant", content=reply),
        ])
    db.commit()
    return ChatResponse(
        reply=reply,
        tool_cards=[ToolCard(**c) for c in result["tool_cards"]],
        recorded_facts=result["recorded_facts"],
        suggested_actions=[],
    )
```

> `chat_history` 端点零改动。import 调整：移除不再直接使用的 assemble_context/desensitize/rehydrate（若 chat.py 无其他调用），改从 core.chat.loop 导入 run_chat_with_tools；ToolCard 从 schemas 导入。

---

## 五、测试（`tests/test_api/test_chat_protocol.py` 新建，≤200 行）

```python
"""对话协议测试 — 服务端工具循环 + 卡片（#12）。"""

class TestRecordFact:
    def test_high_confidence_confirmed(self, client, test_db, monkeypatch):
        # mock call_llm：第 1 次返回 record_fact(high) 工具调用，第 2 次返回纯文本
        # → 响应 recorded_facts 含 {status: confirmed}；事件落库 status=confirmed；context_summary 含内容
    def test_low_confidence_pending_card(self, client, test_db, monkeypatch):
        # low → tool_cards 含 record_confirm 卡（event_id/status=pending）；事件落库 pending
    def test_global_chat_no_tools(self, client, test_db, monkeypatch):
        # 无 case_id → 断言 call_llm 收到 tool_choice="none" 且 tools=None；响应无 tool_cards
    def test_global_chat_record_fact_rejected(self, client, test_db, monkeypatch):
        # 即使 LLM 返回 record_fact 调用，execute_tool 返回 ok=False（全局只读）

class TestSubmissionSuggest:
    def test_suggest_card(self, client, test_db, monkeypatch):
        # suggest_submission → tool_cards 含 submission_suggest 卡

class TestToolLoop:
    def test_max_rounds_truncated(self, client, test_db, monkeypatch):
        # call_llm 连续 4 次返回工具调用 → 截断于 3 轮，回复含"截断"提示
    def test_tool_result_no_pii_echo(self, client, test_db, monkeypatch):
        # record_fact 后断言回注文本不含事件 content 原文（防 PII 二次暴露）
    def test_chat_persists_messages(self, client, test_db, monkeypatch):
        # 案件对话 → CaseChatMessage user/assistant 各一条
```

> mock 方式：`monkeypatch.setattr(ApiGateway, "call_llm", fake)`，fake 按调用序号返回 `ApiCallResult(response_text=..., tool_calls=[{"name":"record_fact","arguments":{"content":"...","confidence":"high"}}], ...)` 或纯文本结果。断言语料用脱敏样本（PERSON_1 / $850,000 等），不用真实客户数据。

---

## 验收标准（全量门禁）

```bash
python -m pytest tests/test_api/test_chat_protocol.py -v                     # 专项
python -m pytest tests/ -q                                                   # 全量（基线 479，不得回归）
ruff check core/chat/ server/api/chat.py server/api/schemas.py tests/test_api/test_chat_protocol.py
```

手动验证：
1. `POST /api/chat`（有 case_id）→ 响应含 `tool_cards` / `recorded_facts` 字段（可为空数组）。
2. 对话中让 AI"记一下：客户月收入 8500" → 若返回 record_fact(high) → recorded_facts 含该条；再查 `GET /api/cases/{id}/context-events?status=confirmed` 可见。
3. 全局对话（无 case_id）→ 回复正常，tool_cards 恒空；让 AI 记事实 → 不产生事件。
4. 流式 V2 未实现：前端仍走非流式（无 SSE），本单不改前端协议。

---

⚠️ 执行纪律（每一条都必须遵守）：
1. 只修改"改动范围"表中列出的 6 个文件，绝不碰其他文件
2. 所有函数名/变量名/字段名/断言严格按"接口契约"定义，一个字符都不能改
3. 每完成一节立即运行该节验证命令；失败先报告，不自作主张修计划外代码
4. 不引入新依赖；不创建改动范围表以外的新文件
5. 工具结果回注**不得包含事件 content 原文**（PII 二次暴露红线）
6. 不改 gateway.py / drafts / 迁移；不要重构、优化、美化任何计划外的代码
