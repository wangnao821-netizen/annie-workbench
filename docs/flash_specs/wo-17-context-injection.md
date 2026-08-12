# WO-17：上下文注入 — 五层缓存友好协议 + 用量测量 + 模型路由（#8/#10 定稿落地）

> 来源：CASE 大脑 V1 收口 #8（五层缓存友好排序：角色→案件大脑/摘要→经验/政策→实时数据→对话追加区；追加式+折叠式替代滑动窗口；ai_usage_log 用量+费用+缓存命中率，只预警不限额）+ #10（DeepSeek 日常 + Gemini 写英文：external 递交模式 Gemini 优先，失败→DeepSeek）+ #2（全局对话不注入案件上下文）。执行方：opencode。检查方：Codex。
> 前置：WO-16 对话协议（已交付）。本单无前端改动。

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / Alembic（唯一建表路径）
- 禁止：引入任何新的 pip 依赖；禁止创建本表以外的文件；禁止修改本表以外的文件
- 禁止：改动既有迁移 revision（只允许**新建**一个，down_revision = `354973fd6c37`）
- 脱敏红线：五层注入内容出站前必须 desensitize（沿用现有边界）；对话追加区只取已入库的 CaseChatMessage（本地）
- 缓存友好层序是**协议参数**（#8 决策 2），改排序 = 改施工单，不得静默调整

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `core/migrations/versions/xxxx_add_ai_usage_log.py` | **新建** | down_revision=`354973fd6c37`，建 `ai_usage_log` 表 |
| `core/models/orm.py` | 修改 | 文件末尾新增 `class AiUsageLog` |
| `core/ai/gateway.py` | 修改 | `ApiCallResult` +2 缓存字段；`call_llm` 加 `prefer_provider`；`__init__` 建 provider map |
| `core/chat/context.py` | **新建** | 五层注入组装（≤200 行） |
| `core/chat/loop.py` | 修改 | 改用五层注入 + 写 ai_usage_log + external→prefer gemini |
| `core/analytics/usage.py` | **新建** | 用量聚合（≤200 行） |
| `server/api/analytics.py` | 修改 | 新增 `GET /api/analytics/usage` |
| `server/api/schemas.py` | 修改 | 新增 `AnalyticsUsageResponse` |
| `tests/test_core/test_injection.py` | **新建** | 五层注入测试（≤200 行） |
| `tests/test_api/test_usage.py` | **新建** | 用量端点测试（≤200 行） |

⚠️ 严禁修改上表以外的文件（含 core/chat/tools.py、core/context/、前端）。严禁改动既有 revision。

---

## 一、ai_usage_log 表 + ORM

### 迁移（新建 revision）

```python
def upgrade() -> None:
    op.create_table(
        "ai_usage_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("case_id", sa.String(), nullable=True),
        sa.Column("scope", sa.String(), nullable=False, server_default="case"),
        sa.Column("track", sa.String(), nullable=False, server_default="internal"),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("model", sa.String(), nullable=True),
        sa.Column("prompt_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completion_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("prompt_cache_hit_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("prompt_cache_miss_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cost_usd", sa.Float(), nullable=False, server_default="0"),
        sa.Column("latency_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("layer_names", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_ai_usage_log_case_id", "ai_usage_log", ["case_id"])
    op.create_index("ix_ai_usage_log_created_at", "ai_usage_log", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_ai_usage_log_created_at", table_name="ai_usage_log")
    op.drop_index("ix_ai_usage_log_case_id", table_name="ai_usage_log")
    op.drop_table("ai_usage_log")
```

### ORM（`core/models/orm.py` 文件末尾新增）

```python
class AiUsageLog(Base):  # type: ignore[misc]
    """AI 调用用量日志（#8 测量工具：token/费用/延迟/缓存命中率）。"""

    __tablename__ = "ai_usage_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(String, nullable=True, index=True)   # 全局对话为 NULL
    scope = Column(String, nullable=False, default="case")  # case | global
    track = Column(String, nullable=False, default="internal")  # internal | external
    provider = Column(String, nullable=False)               # deepseek | gemini | ...
    model = Column(String, nullable=True)
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)
    prompt_cache_hit_tokens = Column(Integer, default=0)    # DeepSeek usage.prompt_cache_hit_tokens
    prompt_cache_miss_tokens = Column(Integer, default=0)
    cost_usd = Column(Float, default=0.0)
    latency_ms = Column(Integer, default=0)
    layer_names = Column(Text, nullable=True)               # JSON 数组，如 ["role","case_brain","team","live","dialogue"]
    created_at = Column(DateTime, default=datetime.utcnow)
```

### 验证
- `.venv\Scripts\python.exe -m alembic upgrade head` 成功；`alembic current` 显示新 revision。

---

## 二、gateway：缓存字段 + prefer_provider（`core/ai/gateway.py`）

### ApiCallResult 追加 2 字段（在 tool_calls 之后）

```python
    tool_calls: list[dict] | None = None    # 新增：LLM 返回的 function calls
    prompt_cache_hit_tokens: int = 0        # 新增：DeepSeek 缓存命中输入 token
    prompt_cache_miss_tokens: int = 0       # 新增：未命中输入 token
```

### `_do_call` 内 usage 解析（在 p_tokens/c_tokens 之后追加）

```python
        p_cache_hit = int(getattr(usage, "prompt_cache_hit_tokens", 0) or 0)
        p_cache_miss = int(getattr(usage, "prompt_cache_miss_tokens", 0) or 0)
```

返回 ApiCallResult 时带上 `prompt_cache_hit_tokens=p_cache_hit, prompt_cache_miss_tokens=p_cache_miss`。

### `__init__` 建 provider map + `call_llm` 加 prefer_provider

```python
        # 在 __init__ 构建 primary/fallback 之后追加：
        self._providers: dict[str, tuple] = {
            self._primary_name: (self._primary_client, self._primary_model, self._primary_name),
        }
        if self._fallback_client:
            self._providers[self._fallback_name] = (
                self._fallback_client, self._fallback_model, self._fallback_name,
            )
```

`call_llm` 签名追加 `prefer_provider: str | None = None`（在 tool_choice 之后）；providers 列表改为：

```python
        providers = self._ordered_providers(prefer_provider)
```

新增私有方法：

```python
    def _ordered_providers(self, prefer_provider: str | None) -> list[tuple]:
        """模型路由（#10）：prefer 的 provider 排最前，其余按原序作 fallback。"""
        if not prefer_provider or prefer_provider not in self._providers:
            return list(self._providers.values())
        preferred = self._providers[prefer_provider]
        others = [v for k, v in self._providers.items() if k != prefer_provider]
        return [preferred, *others]
```

> 现有 retriable 失败 fallback 逻辑不变：首选失败自动切下一个 provider（#10：external 时 gemini 失败 → deepseek 接手）。

---

## 三、五层注入协议（`core/chat/context.py` 新建，≤200 行）

```python
"""对话五层注入协议 — 缓存友好排序（#8 决策 2）。"""

from __future__ import annotations

from sqlalchemy.orm import Session

from core.ai.context_builder import assemble_context, _build_role_prompt
from core.logger import get_logger
from core.models.orm import CaseChatMessage

logger = get_logger(__name__)

# 缓存友好层序（#8 决策 2）：改排序 = 改施工单，不得静默调整
LAYER_ORDER = ["role", "case_brain", "team", "live", "dialogue"]

DIALOGUE_WINDOW_ROUNDS = 10    # 对话追加区：最近 10 轮
DIALOGUE_TOKEN_BUDGET = 500    # 超出预算从头部截断（折叠语义：#8）


def build_chat_layers(
    case_id: str | None,
    message: str,
    track: str,
    db: Session,
) -> list[dict]:
    """组装五层注入内容（按 LAYER_ORDER 缓存友好排序）。

    全局对话（case_id 为空）→ 只返回 role 层 + 用户消息（#2：不注入案件上下文）。
    对话追加区 = 最近 DIALOGUE_WINDOW_ROUNDS 轮 CaseChatMessage（追加式，旧→新）；
    超预算从头部截断——已确认内容已蒸馏进摘要（折叠），窗口外不注入原话。

    Returns:
        [{"layer": "role", "text": str}, ...]（按 LAYER_ORDER 排序）
    """
    ...
```

实现要点：
1. role 层：`_build_role_prompt()`（复用现有）；
2. case_brain 层：`assemble_context(case_id, "case_chat", db).case_brain`（案件大脑/摘要，含 context_summary 语义）；
3. team 层：`assemble_context(...).team_experience`；
4. live 层：`assemble_context(...).live_data`；
5. dialogue 层：`db.query(CaseChatMessage).filter(case_id==...).order_by(id.desc()).limit(DIALOGUE_WINDOW_ROUNDS)` 后反转（旧→新），格式 `[user] 内容 / [assistant] 内容`；超过 DIALOGUE_TOKEN_BUDGET（按字符估算：1 token≈2 字符，预算 500 → 1000 字符）从头部丢弃，直到 ≤ 预算；
6. 全局对话：只返回 `[{"layer": "role", "text": _build_role_prompt()}, {"layer": "live", "text": message}]`（live 层承载用户消息，无案件上下文）。

---

## 四、loop 改造：五层注入 + 用量记录 + 模型路由（`core/chat/loop.py`）

### 改动点

1. 删除 chat.py 旧的四层 prompt 组装逻辑（已在 WO-16 移到 loop，这里把 `base_prompt` 组装替换为）：

```python
from core.chat.context import build_chat_layers, LAYER_ORDER

layers = build_chat_layers(case_id, message, track, db)
base_prompt = "\n\n".join(f"【{layer}】\n{text}" for layer, text in ((l["layer"], l["text"]) for l in layers))
```

2. 模型路由（#10）：`gw = ApiGateway(get_config())` 后：

```python
prefer_provider = "gemini" if track == "external" else None   # 递交模式英文草稿 Gemini 优先
```

`call_llm(..., prefer_provider=prefer_provider)`。

3. 用量记录：每次 `call_llm` 成功后（含工具轮次），调用私有助手：

```python
def _log_usage(db, case_id, track, result: ApiCallResult, layer_names: list[str]) -> None:
    """写 ai_usage_log（token/费用/延迟/缓存命中率）。失败仅 warning，不阻断对话。"""
    db.add(AiUsageLog(
        case_id=case_id,
        scope="case" if case_id else "global",
        track=track,
        provider=result.provider_used,
        model=getattr(result, "model_used", None),
        prompt_tokens=result.prompt_tokens,
        completion_tokens=result.completion_tokens,
        prompt_cache_hit_tokens=result.prompt_cache_hit_tokens,
        prompt_cache_miss_tokens=result.prompt_cache_miss_tokens,
        cost_usd=result.cost_usd,
        latency_ms=result.latency_ms,
        layer_names=json.dumps(layer_names, ensure_ascii=False),
    ))
    db.commit()
```

> `layer_names` 用 `[l["layer"] for l in layers]`（即 LAYER_ORDER，全局对话为 `["role","live"]`）。`model_used` 若 ApiCallResult 无该字段则省略（不新增字段）。

---

## 五、用量测量端点（`core/analytics/usage.py` 新建 + `server/api/analytics.py` + schemas）

### core/analytics/usage.py（≤200 行）

```python
"""AI 用量聚合（#8 测量工具：token/费用/延迟/缓存命中率 + 纠正次数）。"""

from __future__ import annotations

from sqlalchemy.orm import Session

from core.analytics.bucketing import buckets_since
from core.models.orm import AiUsageLog, CaseContextEvent


def get_usage(db: Session, granularity: str) -> dict:
    """当前 vs 上期两桶用量聚合（#21 质量信号：corrected_count = superseded 事件数）。"""
    a, b = buckets_since(granularity, 2)
    return {
        "current": _period(db, b),    # buckets_since 返回旧→新，末尾=当前周期
        "previous": _period(db, a),
    }


def _period(db: Session, bucket: tuple) -> dict:
    start, end, _ = bucket
    rows = db.query(AiUsageLog).filter(
        AiUsageLog.created_at >= start, AiUsageLog.created_at < end
    ).all()
    calls = len(rows)
    prompt_tokens = sum(r.prompt_tokens for r in rows)
    completion_tokens = sum(r.completion_tokens for r in rows)
    cache_hit = sum(r.prompt_cache_hit_tokens for r in rows)
    cache_miss = sum(r.prompt_cache_miss_tokens for r in rows)
    corrected = db.query(CaseContextEvent).filter(
        CaseContextEvent.status == "superseded",
        CaseContextEvent.created_at >= start,
        CaseContextEvent.created_at < end,
    ).count()
    return {
        "calls": calls,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "prompt_cache_hit_tokens": cache_hit,
        "prompt_cache_miss_tokens": cache_miss,
        "cache_hit_rate": round(cache_hit / (cache_hit + cache_miss), 4) if (cache_hit + cache_miss) else None,
        "cost_usd": round(sum(r.cost_usd for r in rows), 4),
        "avg_latency_ms": round(sum(r.latency_ms for r in rows) / calls, 1) if calls else None,
        "corrected_count": corrected,
    }
```

### schemas.py 新增

```python
class UsagePeriod(BaseModel):
    calls: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    prompt_cache_hit_tokens: int = 0
    prompt_cache_miss_tokens: int = 0
    cache_hit_rate: float | None = None
    cost_usd: float = 0.0
    avg_latency_ms: float | None = None
    corrected_count: int = 0


class AnalyticsUsageResponse(BaseModel):
    current: UsagePeriod
    previous: UsagePeriod
```

### server/api/analytics.py 新增端点

```python
@router.get("/usage", response_model=AnalyticsUsageResponse)
def analytics_usage(
    granularity: Literal["day", "week", "month"] = "day",
    db: Session = Depends(get_db),  # noqa: B008
) -> AnalyticsUsageResponse:
    """AI 用量测量（当前 vs 上期；含缓存命中率与纠正次数）。"""
    data = get_usage(db, granularity)
    return AnalyticsUsageResponse(**data)
```

---

## 六、测试

### `tests/test_core/test_injection.py`（新建，≤200 行）

```python
class TestLayerOrder:
    def test_cache_friendly_order(self, test_db):
        # build_chat_layers 返回 layer 序列 == ["role","case_brain","team","live","dialogue"]
    def test_global_chat_no_case_layers(self, test_db):
        # case_id=None → 只含 role + live（用户消息），无 case_brain/team/dialogue

class TestDialogueWindow:
    def test_recent_rounds_appended(self, test_db):
        # 造 12 条对话 → dialogue 层只含最近 10 轮且旧→新顺序
    def test_over_budget_truncated_from_head(self, test_db):
        # 超预算 → 从头部丢弃，长度 ≤ 预算

class TestModelRouting:
    def test_external_prefers_gemini(self, test_db, monkeypatch):
        # track=external → 断言 ApiGateway.call_llm 收到 prefer_provider="gemini"
    def test_internal_no_prefer(self, test_db, monkeypatch):
        # track=internal → prefer_provider=None
```

### `tests/test_api/test_usage.py`（新建，≤200 行）

```python
class TestUsageEndpoint:
    def test_empty_usage(self, client):
        # GET /api/analytics/usage → current/previous 全 0 / None，200
    def test_usage_aggregation(self, client, test_db):
        # 造 2 条 AiUsageLog（不同 created_at 桶）+ 1 条 superseded 事件
        # → current/previous 计数、cache_hit_rate、corrected_count 正确
    def test_invalid_granularity(self, client):
        # granularity=year → 422
```

### 附加断言（现有 `tests/test_api/test_chat_protocol.py` 追加 1 个用例）

```python
def test_chat_writes_usage_log(self, client, test_db, monkeypatch):
    # 案件对话成功后 ai_usage_log 有 1 条（含 provider / cache 字段 / layer_names）
```

---

## 验收标准（全量门禁）

```bash
python -m pytest tests/test_core/test_injection.py tests/test_api/test_usage.py tests/test_api/test_chat_protocol.py -v
python -m pytest tests/ -q                      # 全量（基线 487，不得回归）
ruff check core/chat/ core/ai/gateway.py core/analytics/usage.py server/api/analytics.py server/api/schemas.py core/models/orm.py tests/test_core/test_injection.py tests/test_api/test_usage.py tests/test_api/test_chat_protocol.py
```

手动验证：
1. 案件对话 → `ai_usage_log` 新增记录，`layer_names` = `["role","case_brain","team","live","dialogue"]`；DeepSeek 有缓存命中时 `prompt_cache_hit_tokens` > 0。
2. `GET /api/analytics/usage?granularity=day` → current/previous 结构正确、cache_hit_rate 计算正确。
3. 递交模式对话（track=external）→ `provider` 首选 gemini（配置了 key 时）；失败自动回退 deepseek。
4. 全局对话 → 注入不含案件大脑；ai_usage_log.scope="global"。

---

⚠️ 执行纪律（每一条都必须遵守）：
1. 只修改"改动范围"表中列出的 10 个文件，绝不碰其他文件
2. 所有函数名/变量名/字段名/断言严格按"接口契约"定义，一个字符都不能改
3. 每完成一节立即运行该节验证命令；失败先报告，不自作主张修计划外代码
4. 不引入新依赖；新文件全部 ≤200 行；不改动既有迁移 revision（只新建一个）
5. 缓存友好层序 `["role","case_brain","team","live","dialogue"]` 是协议参数，不得自行调整
6. 全局对话禁止注入案件上下文（#2 红线）；五层注入出站前保持既有脱敏边界
