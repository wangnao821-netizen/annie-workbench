# WO-30：意图路由升级（LLM 选流程包 + 规则兜底）

> 来源：Pydantic AI 能力对照 #2（Vera 拍板 2026-08-13）——流程包已 6 个，正则触发开始撞车；
> 采用"LLM 从候选流程包选一个 + 规则保底"（ToolSearch 思路），触发更准、规则兜底。
> 执行方：Codex。检查方：Codex 自检。

## 技术约束

- **成本闸门**：只有**规则撞车（≥2 命中）**才调 LLM；唯一命中直接走规则（零 LLM）；零命中不调 LLM（避免闲聊浪费）
- 红线：出站前 desensitize、入站 rehydrate；LLM 失败/超时/未知 key → **规则保底**，绝不阻断对话
- 缓存纪律：候选 prompt 纯函数、无时间戳；路由调用写 AiUsageLog（layer_names=["router"]）
- 配置开关：`ai.routing.intent_routing_enabled`（默认 true；false = 纯规则）
- 新代码文件 ≤200 行；chat/loop.py 仅允许改路由调用一处
- 无新依赖；不碰前端

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
| --- | --- | --- |
| `core/agents/flows.py` | 修改 | +`match_flows()`（返回全部命中，保持 load_flows 顺序）；`match_flow` 委托 |
| `core/agents/router.py` | **新建** | `route_flow` / `_llm_pick` / `_candidate_prompt` / `_log_usage` |
| `core/chat/loop.py` | 修改 | `match_flow` → `route_flow(message, db, case_id=case_id)`（一处） |
| `core/config.py` | 修改 | `AiRoutingConfig` + `intent_routing_enabled: bool = True` |
| `config/settings.yaml` | 修改 | routing 段 + `intent_routing_enabled: true` |
| `tests/test_core/test_intent_router.py` | **新建** | ≥10 用例 |
| `docs/flash_specs/wo-30-intent-router.md` | 新建 | 本单 |

⚠️ 严禁修改：config/agent_flows/*.yaml、core/agents/runner.py、core/agents/pai.py、server/api/*、前端 ui/。

## 设计

### route_flow(message, db, case_id=None) -> dict | None

1. `match_flows(message)`（规则，保持 load_flows 顺序）
2. len==1 → 返回该 flow（**不调 LLM**）
3. len>1 → `intent_routing_enabled` 为真 → `_llm_pick` 返回合法 flow_key → 返回对应 flow；否则 → 返回规则首个命中（保底）
4. len==0 → None（走普通对话，不调 LLM）

### _llm_pick(message, flows, db, case_id) -> str | None

- prompt = 稳定候选清单（key/name/description）+ 脱敏后的用户消息；只输出 `{"flow_key": "<key>"|"none"}`
- `ApiGateway.call_llm`（DeepSeek 默认）；rehydrate → JSON 解析 → key 存在返回 key；否则 None
- 任何异常 → None（调用方规则保底）；成功后写 AiUsageLog（layer=["router"]）

## 测试（tests/test_core/test_intent_router.py，≥10）

1. 唯一命中 → 返回 flow，且 `_llm_pick` 不被调用
2. 撞车消息（"跟进邮件和催件有什么区别"）→ `_llm_pick` 返回 followup → 返回 followup flow
3. 撞车 + LLM 未知 key → 规则首个命中（chaser，按文件名序）
4. 撞车 + `_llm_pick` 抛错 → 规则首个命中
5. 零命中（"今天天气怎么样"）→ None，`_llm_pick` 不被调用
6. PII：`_llm_pick` 出站 prompt 不含手机号（monkeypatch call_llm 捕获）
7. `_llm_pick` 合法 JSON → 返回 key
8. `_llm_pick` 非法 JSON → None
9. `intent_routing_enabled=false` → 撞车不调 LLM，规则保底
10. route_flow 返回 WO-26 flow dict（key/name/presentation）
11. 候选 prompt 稳定（两次一致、无时间戳）
12. chat/loop 集成：route_flow 命中 → run_chat_with_tools 返回 flow 卡

## 验收标准（全量门禁）

- 专项 12 用例全绿；`pytest tests/ -q` → 855 基线 + 新增，0 failed / 0 skipped
- ruff（本单文件）→ All checks passed
- 三触发语（跟进/催件/OS 回复）仍各自命中（规则回归）；"跟进邮件和催件"撞车由 LLM 路由（mock 断言）
- 前端零改动（git diff 核对）

## 提交建议（一次）

```
git add core/agents/flows.py core/agents/router.py core/chat/loop.py core/config.py config/settings.yaml tests/test_core/test_intent_router.py docs/flash_specs/wo-30-intent-router.md
git commit -m "feat: WO-30 意图路由升级 — 撞车走 LLM 选流程包 + 规则保底（成本闸门：唯一命中零 LLM）"
```

⚠️ 执行纪律：只改表内文件；成本闸门不可省（零命中不调 LLM）；每步验证。