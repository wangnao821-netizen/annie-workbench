# WO-26b：Pydantic AI 编排内核（替换 WO-26 轻量执行层；接口契约不变）

> 来源（Vera 定稿 2026-08-13）：WO-26 验收通过后，由 Codex 直接实施——Pydantic AI 作为流程包执行内核；**接口契约、流程包 YAML、对话路由、前端全部不变**；同时落地模型路由修订（主文档 §十 #10）。
> 执行方：Codex（直接实施）。检查方：Codex 自检。
> 前置：WO-26 已交付（match_flow/run_flow/3 流程包，pytest 783）；pydantic-ai **2.29.0**（版本锁定，2026-08-13 探测）；主文档 §十 #10 路由修订已入档。

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / **pydantic-ai>=2.29.0,<3**（唯一新依赖，版本锁定）
- 红线：进 Agent 的文本必须先 desensitize、出结果 rehydrate、pii_map 不出内网（新增 PII 红线测试）；工具白名单沿用 WO-26；**pydantic-ai 不可用/超时/异常 → 回退 WO-26 轻量执行器**，绝不阻断对话
- 模型路由（§十 #10 修订落地）：DeepSeek 默认主力；Gemini 仅英文写作任务优先（短超时 5-8s）+ 连续失败 N 次健康探测自动跳过 + Gemini key 留空 = 纯 DeepSeek
- 新代码文件全部 ≤200 行；不碰前端、不碰 flow YAML、不碰 chat.py 路由逻辑
- 能力边界（Vera 定稿 2026-08-13）：V1 只吃 Pydantic AI 核心能力——结构化输出、依赖注入、工具注册、降级回退；**不碰 Harness / MCP / Logfire 等重件**；依赖面 = pydantic-ai 本体（唯一新依赖，版本锁定）
- 缓存纪律（清单确认，Pi 启示）：系统提示词与工具定义**字节级稳定**、对话只向后追加不重排、不注入时间戳/随机等易变前缀——DeepSeek 前缀缓存命中的前提

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `pyproject.toml` | 修改 | dependencies + `"pydantic-ai>=2.29.0,<3"` |
| `config/settings.yaml` | 修改 | ai 段 + routing 配置（english_task_prefixes / gemini_timeout_seconds / gemini_health_threshold / gemini_skip_after_failures） |
| `core/config.py` | 修改 | AiConfig + routing 字段（默认值内置） |
| `core/agents/pai.py` | **新建** | Pydantic AI 内核（≤200 行） |
| `core/agents/runner.py` | 修改 | run_flow 执行层优先走 pai；失败回退轻量执行器 |
| `tests/test_core/test_pai_orchestration.py` | **新建** | ≥10 用例 |
| `tests/test_safety/test_pai_pii.py` | **新建** | ≥4 用例（红线） |

⚠️ 严禁修改：config/agent_flows/*.yaml、core/chat/loop.py、server/api/schemas.py、前端、core/agents/declaration_check.py、core/calculator/。

## 一、依赖与版本锁定

```toml
    "pydantic-ai>=2.29.0,<3",
```

- 安装：`python -m pip install "pydantic-ai>=2.29.0,<3"`
- 验证：`python -c "import pydantic_ai; print(pydantic_ai.__version__)"` → 2.29.x
- 锁版本：pyproject 约束 + uv.lock 重新生成（uv 可用时）

## 二、配置（settings.yaml ai 段 + AiConfig）

```yaml
ai:
  primary: { provider: deepseek, model: deepseek-v4-flash, api_key_env: DEEPSEEK_API_KEY, base_url: "https://api.deepseek.com/v1" }
  fallback: { provider: gemini, model: gemini-2.0-flash, api_key_env: GEMINI_API_KEY, base_url: "https://generativelanguage.googleapis.com/v1beta/openai" }
  routing:
    default_provider: deepseek
    english_task_prefixes: ["写一封", "写英文", "draft an email", "broker note", "翻译", "translate"]
    gemini_timeout_seconds: 8          # 短超时：Gemini 仅英文任务且 8s 内未响应 → 降级 DeepSeek
    gemini_skip_after_failures: 3      # 连续失败 3 次 → 本进程内跳过 Gemini（健康探测）
    gemini_skip_seconds: 600           # 跳过持续 10 分钟后重置探测
```

- AiConfig 增加 `routing: AiRoutingConfig`（default_factory），字段默认值如上述；Gemini key 为空 → routing 自动纯 DeepSeek

## 三、Pydantic AI 内核（`core/agents/pai.py`，≤200 行）

```python
"""Pydantic AI 编排内核 — 流程包执行 + 模型路由（WO-26b）。"""

_AGENT: Any | None = None
_gemini_failures: int = 0
_gemini_skipped_until: float = 0.0

def _pick_provider(task_text: str, cfg) -> str:
    """路由：英文写作任务且 Gemini 可用 → gemini；否则 deepseek。
    Gemini 可用 = key 非空 且 未在跳过期 且 连续失败 < 阈值。"""

def build_agent() -> Any:
    """构建 Pydantic AI Agent（OpenAI 兼容 provider，tools 白名单注册）。"""

def run_flow_with_pai(flow: dict, case_id: str, args: dict, db: Session, track: str) -> dict | None:
    """用 Pydantic AI 执行流程包；失败返回 None（调用方回退轻量执行器）。
    输入脱敏 → Agent.run（超时 30s）→ 输出 rehydrate → 写事件 → 返回 WO-26 契约 dict。"""

def reset_health() -> None:  # 测试用
```

- tools 注册：declaration_check / calculator_assess / policy_check / context_event_write（与 WO-26 白名单一致，函数惰性 import）
- 超时：Agent.run 用 anyio/timeout 30s；Gemini 英文任务用 8s
- 降级：pydantic_ai import 失败 / Agent 构建失败 / run 抛错 / 超时 → 记 gemini_failures（如 provider=gemini）→ 返回 None
- **工具参数校验（新增验收项）**：流程包工具入参必须先经 Pydantic/JSON Schema 校验再执行；非法参数 → 不执行工具、返回可读错误并写事件
- **确认钩子（新增验收项）**：工具执行前确认钩子——confirm_required / 出站类步骤先过权限/PII/路径闸门；**扫描/读文件类工具默认拒绝，必须由 Vera 显式指定路径**；不满足 → 阻断并返回原因（对应 flow YAML confirm_required 字段）
- **用量闭环（新增验收项）**：run_flow_with_pai 成功路径写 AiUsageLog（provider/model/tokens/prompt_cache_hit_tokens/prompt_cache_miss_tokens/cost_usd/latency_ms）；失败/降级路径记 fallback 日志——与 chat 路径口径一致

## 四、runner 接入（`core/agents/runner.py` 修改）

`run_flow` 内，在原逐 step 轻量执行之前插入：

```python
    # WO-26b：优先 Pydantic AI 内核；失败/不可用回退轻量执行器
    try:
        from core.agents.pai import run_flow_with_pai
        result = run_flow_with_pai(flow, case_id, args, db, track=track)
        if result is not None:
            return result
    except Exception as exc:  # noqa: BLE001 — PAI 失败回退，不阻断
        logger.warning("pai runner failed, fallback to lightweight: %s", exc)
```

原轻量执行逻辑整体保留（回退路径）。

## 五、测试

### tests/test_core/test_pai_orchestration.py（≥14）
1. _pick_provider 默认 deepseek（普通任务）
2. 英文任务 + Gemini key 存在 + 未跳过 → gemini
3. 英文任务 + Gemini key 空 → deepseek（纯 DeepSeek 模式）
4. 英文任务 + 跳过期内 → deepseek
5. 连续失败 3 次 → gemini_skipped_until 设置；第 4 次走 deepseek
6. run_flow_with_pai 失败（monkeypatch Agent.run 抛错）→ 返回 None
7. runner.run_flow：PAI 返回 None 时回退轻量执行器（结果与 WO-26 一致）
8. PAI 成功时返回 WO-26 契约（reply/tool_cards/recorded_facts/presentation）
9. 工具白名单与 WO-26 一致（4 个）
10. 超时（monkeypatch time）→ None（降级）
11. 工具参数校验：非法入参（如 calculator 缺 bank / 类型错误）→ 工具不执行、返回可读错误
12. 确认钩子：confirm_required 步骤闸门不满足（如 PII 出站未脱敏 / 扫描类未显式指定路径）→ 阻断并返回原因
13. 用量闭环：PAI 执行成功后写 AiUsageLog（含 prompt_cache_hit_tokens）；降级路径不写成功用量
14. 缓存纪律：build_agent 两次构建的 system prompt / 工具定义字节级一致；动态时间戳不注入前缀（等价断言）

### tests/test_safety/test_pai_pii.py（≥4，红线）
1. 进 Agent 的输入必先 desensitize（monkeypatch 记录：构造含中文名/手机号的 flow 输入）
2. 输出 rehydrate（含 PERSON_1 → 还原真实值）
3. pii_map 不进入 provider 调用 payload（构造断言）
4. Gemini 英文任务降级 DeepSeek 后，脱敏链不变（provider 切换不影响脱敏）

### 回归
- WO-26 的 22 个测试必须原样通过（接口契约不变）；全量 783 + 新增

## 六、验收标准（全量门禁）

- 专项 2 文件全绿；`pytest tests/ -q` → 783 基线 + 新增，0 failed / 0 skipped
- ruff（本单文件）→ All checks passed
- `python -c "import pydantic_ai; print(pydantic_ai.__version__)"` → 2.29.x；uv.lock（若生成）含 pydantic-ai
- TestClient：三条触发语仍返回对应 flow 卡（result_card/dialog）——**回归 WO-26 行为**
- 主文档 §八「Pydantic AI 版本锁定」待拍板 → 已锁定（2.29.x）标注
- 能力边界核对：无 Harness / MCP / Logfire 引入（import 扫描 + pyproject 依赖面 = pydantic-ai 本体）
- 新增验收项通过：工具参数校验 + 确认钩子（专项用例 11/12）
- 缓存纪律与用量闭环通过（专项用例 13/14）；flow 路径 AiUsageLog 有记录

## 提交建议（一次）

```
git add pyproject.toml config/settings.yaml core/config.py core/agents/pai.py core/agents/runner.py [uv.lock]
git add tests/test_core/test_pai_orchestration.py tests/test_safety/test_pai_pii.py
git commit -m "feat: WO-26b Pydantic AI 编排内核 — 模型路由落地（DeepSeek 默认/Gemini 英文可选）+ 脱敏红线 + 参数校验/确认钩子 + 缓存纪律/用量闭环 + 版本锁定"
```

⚠️ 执行纪律：只改表内文件；flow YAML / chat 路由 / schemas 零改动；PAI 任何失败回退轻量执行器；每步验证。
