# 任务：执行 WO-35 会话压缩施工单（Gemini 实施）

你是 Vera Workbench 的实施工程师（Gemini 3.5）。严格按施工单执行，**禁止超范围改动**，遇到歧义停下报告。

## 前置信息
- 仓库：D:\vera-workbench（Windows）
- Python：D:\vera-workbench\.venv\Scripts\python.exe（测试/ruff 都用它）
- 施工单：docs\flash_specs\wo-35-session-compression.md（**唯一契约**，接口签名/字段名一字不改）
- 背景：对话层（core/chat/context.py）目前只保留最近 10 条消息、超出直接从头部丢弃，docstring 声称"已蒸馏进摘要"但实际无该机制；本单补齐"窗口外消息 → 压缩摘要事件 → 对话层前置注入"（参考 DeepSeek Harness compaction）
- 当前基线：`pytest tests/ -q` = 915 passed, 0 failed, 0 skipped

## 硬性纪律（违反即返工）
1. 只改施工单「改动范围」表内文件，共 5 个：
   - `config/settings.yaml`（ai 段 routing 之后新增 session_compression 节点）
   - `core/config.py`（新增 SessionCompressionConfig + AiConfig 追加字段）
   - `core/chat/compression.py`（新建，≤200 行）
   - `core/chat/context.py`（最小改动：L47 传 track / L51 签名加 track / _build_dialogue 内接摘要）
   - `tests/test_core/test_session_compression.py`（新建，8 用例）
2. 严禁修改：`core/models/orm.py`、`core/agents/*`、`config/agent_flows/*.yaml`、`server/*`、前端 `ui/`；严禁新增数据库迁移；严禁引入任何新 pip 依赖；严禁创建表外文件/目录
3. **PII 红线**：LLM 出站文本必须 `desensitize(text, case_id, db)`（core.pii.gateway），入站结果必须 `rehydrate(text, case_id, db)`；摘要正文只存本地 SQLite
4. **幂等 + 懒压缩**：`source_ref=f"session_compression:{last_msg_id}:{count}"` 兼作去重锚点；压缩不删除任何 CaseChatMessage（不可变审计，仅不再注入）
5. 压缩失败/LLM 失败只 `logger.warning`，**绝不抛异常、绝不阻断对话**
6. 不改 `LAYER_ORDER` / `DIALOGUE_WINDOW_ROUNDS` / `DIALOGUE_TOKEN_BUDGET`

## 接口契约速览（完整签名见施工单「二、接口契约」，一字不改）

- `config/settings.yaml` ai 段 routing 之后：
  ```yaml
  session_compression:
    enabled: true
    trigger_messages: 30
    keep_messages: 20
    summary_max_chars: 600
  ```
- `core/config.py`：`SessionCompressionConfig(BaseModel)`（enabled/trigger_messages/keep_messages/summary_max_chars，默认值见施工单）；`AiConfig` 末尾 `session_compression: SessionCompressionConfig = Field(default_factory=SessionCompressionConfig)`
- `core/chat/compression.py`（新建）：
  - `SESSION_COMPRESSION_SOURCE_TYPE = "session_compression"`、`_SOURCE_REF_PREFIX = "session_compression:"`
  - `ensure_session_compression(case_id: str, db: Session, track: str = "internal") -> str`
  - `_last_compressed_msg_id(case_id: str, db: Session) -> int`
  - `_should_compress(case_id: str, db: Session, trigger_messages: int) -> bool`
  - `_compress(case_id, db, track, trigger_messages, keep_messages, summary_max_chars) -> str | None`
  - `_summarize(case_id: str, blocks: list[str], db: Session, max_chars: int) -> str`
- 事件写入：`CaseContextEvent(source_type=SESSION_COMPRESSION_SOURCE_TYPE, content=摘要, track=track, status="confirmed", source_ref=f"session_compression:{last_msg_id}:{count}")` + `db.commit()`
- `core/chat/context.py`：`_build_dialogue(case_id, db, track)`；窗口查询前 `summary = ensure_session_compression(case_id, db, track)`；返回前 `text = f"【历史对话摘要】\n{summary}\n\n{text}"`（summary 非空时）

## 参考代码（先读再写）
- `core/chat/context.py`（五层注入 + 现有窗口逻辑，本单唯一接线点）
- `core/chat/loop.py` 的 `_log_usage`（ApiGateway 用法：`gw.call_llm(text=DesensitizedText(prompt), prompt_template=..., system_prompt=..., tools=None, tool_choice=None)`）
- `core/context/accumulator.py` 的 `append_context_event`（CaseContextEvent 字段/轨道语义）
- `core/pii/gateway.py`（desensitize / rehydrate 签名）
- 测试风格参考 `tests/test_core/test_injection.py`（现有 build_chat_layers 测试，不得破坏）

## 实施步骤
1. 读施工单全文 + 上述参考代码
2. Step 1 配置：settings.yaml + core/config.py；验证 `python -c "from core.config import get_config; print(get_config().ai.session_compression)"`
3. Step 2 压缩模块：新建 core/chat/compression.py；`_summarize` 内 prompt 要求中文、保留关键事实（客户目标/数字/决定/待办）、不编造、纯文本无 markdown；LLM 失败回退 `blocks 拼接[:max_chars]`；验证 `ruff check core/chat/compression.py`
4. Step 3 接线：core/chat/context.py 三处最小改动；验证 `pytest tests/test_core/test_injection.py -q` 零回归
5. Step 4 测试：新建 8 用例（施工单列名，含：disabled 不压缩 / 低于阈值返回空 / 写事件字段断言 / 幂等 / 最近 20 条不压缩 / LLM 失败回退 / dialogue 含【历史对话摘要】/ PII rehydrate）；验证 `pytest tests/test_core/test_session_compression.py -q`
6. Step 5 全量门禁 + 提交

## 门禁（全绿才算完成）
- 专项：`pytest tests/test_core/test_session_compression.py -q` → 8 项全绿
- 回归：`pytest tests/test_core/test_injection.py -q` → 全绿
- 全量：`pytest tests/ -q` → ≥915 全绿，0 failed / 0 skipped
- `ruff check core/chat/compression.py core/chat/context.py core/config.py tests/test_core/test_session_compression.py` → All checks passed
- `python -c "import core.chat.compression, core.chat.context"` → 无循环导入
- `git diff` 核对：除「改动范围」表内 5 文件外零改动（前端 ui/ 一律不碰）

## 提交
- 只 stage 本单 5 个文件；提交信息：`feat: WO-35 会话压缩 — 窗口外消息蒸馏为 CaseContextEvent 摘要（对话层前置注入）`
- 提交后输出交付报告：改动文件清单 + 行数、专项/全量测试数、ruff 结果、遗留 TODO（如有）

## 失败标准（对照施工单「验收标准」）
任何一项不满足 → 停下报告，不要自行扩大范围。
