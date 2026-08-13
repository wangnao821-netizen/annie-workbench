# WO-25：能力中心注册表（Agent/Tool）+ 银行×平台确认 PATCH 端点

> 来源（实施计划 2026-08-13 Phase 1）：主文档 §二「能力中心 = Agent & 工具管理，可手动调整」落地——前端 AbilityCenter 目前是静态列表（INITIAL_AGENTS 5 + INITIAL_TOOLS 5），需要后端注册表支撑；银行×平台（WO-22）只读展示，需要 PATCH 确认闭环（F-13 面板标注 WO-25）。
> 执行方：opencode。检查方：Codex。
> 前置：WO-22（bank_registry.yaml 22 家 + 5 平台）、WO-20/21（申报一致性/计算器已交付）、AbilityCenter 静态列表内容已核（5 agent + 5 tool）、当前 alembic head = dccde7819389。

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / PyYAML
- 禁止：引入任何新 pip 依赖；禁止修改本表以外文件；禁止改前端
- 配置优于硬编码：种子数据放 `config/agents.yaml`；运行时开关/确认状态落 SQLite（普通表，走 Alembic）
- 红线：注册表只存能力元数据与开关（无 PII）；银行×平台 PATCH 只写平台 key 与确认标记，不碰 registry YAML 文件本身（YAML 只读）
- 新代码文件全部 ≤200 行；`config/agents.yaml` 数据文件不受限

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `config/agents.yaml` | **新建** | 11 项种子（5 agent + 5 tool + calculator Agent，见 §一） |
| `core/agents/registry.py` | **新建** | 种子+状态合并 / 开关读写（≤200 行，见 §二） |
| `core/bank_platform_states.py` | **新建** | 银行平台覆盖读写（≤100 行，见 §三） |
| `core/migrations/versions/<gen>_add_agent_bank_states.py` | **新建** | 2 张表（agent_states / bank_platform_states） |
| `core/models/orm.py` | 修改 | +AgentState / +BankPlatformState 两个 ORM 类 |
| `server/api/agents.py` | **新建** | GET /api/agents/ + PATCH /api/agents/{key}（≤200 行） |
| `server/api/banks.py` | 修改 | GET /api/banks/ 合并运行时覆盖；+PATCH /api/banks/{key} |
| `server/api/schemas.py` | 修改 | +AgentItem/AgentsResponse/AgentUpdateRequest/BankPlatformUpdateRequest |
| `server/main.py` | 修改 | 注册 agents router |
| `tests/test_core/test_agents_registry.py` | **新建** | ≥6 用例 |
| `tests/test_api/test_agents.py` | **新建** | ≥6 用例 |
| `tests/test_api/test_bank_platform_patch.py` | **新建** | ≥7 用例 |
| `tests/test_alembic.py` | 修改 | 断言新表存在（+2 断言） |

⚠️ 严禁修改上表以外文件。尤其不得改动：config/bank_registry.yaml（保持只读真源）、core/bank_registry.py、前端任何文件。

---

## 一、种子数据（`config/agents.yaml`）

统一 schema（字段名契约，实施时一字不改）：

```yaml
version: 1
items:
  - key: agent-intake
    name: "建档 Agent (Case Intake)"
    description: "一键完成新客户或存量壳立项、支持文件/文本识别自动提取与预填"
    category: agent          # agent | tool
    status: available        # available | pending
    triggers: ["帮我建个案件", "新建贷款案件"]
    capability: null         # tool 专用
    permission: null         # tool 专用
    enabled_default: true
```

**11 项完整种子（直接抄入；状态按已交付事实）**：

| key | name | category | status | enabled_default |
|---|---|---|---|---|
| agent-intake | 建档 Agent (Case Intake) | agent | available | true |
| agent-followup | 跟进 Agent (Follow-up) | agent | pending | true |
| agent-audit | 申报一致性检查 Agent (Audit & Cross-Check) | agent | **available**（WO-20 已交付） | true |
| agent-chaser | 催件 Agent (Chaser) | agent | pending | true |
| agent-os-reply | OS 回复 Agent (Condition Response) | agent | pending | true |
| agent-calculator | 服务能力计算器 Agent (Servicing Calculator) | agent | **available**（WO-21 已交付） | true |
| tool-memory | 记忆工具 (Case Memory) | tool | available | true |
| tool-ocr | 文件识别提取 (OCR & Parse) | tool | available | true |
| tool-policy | 政策库查询 (Policy Search) | tool | available | true |
| tool-email | 邮件进度同步 (Email Sync) | tool | pending | false |
| tool-calendar | 智能日历对接 (Calendar) | tool | pending | false |

- agent/tool 各自的 triggers / capability / permission 照抄前端 AbilityCenter 现值（agent 用 triggers；tool 用 capability+permission）
- calculator Agent triggers 建议：["帮我算贷款能力", "服务能力计算"]

## 二、注册表（`core/agents/registry.py`，≤200 行）

```python
"""能力中心注册表 — config/agents.yaml 种子 + agent_states 运行时开关（WO-25）。"""

def load_seed() -> list[dict]:
    """读取并校验 config/agents.yaml（key 唯一、category ∈ {agent, tool}、status ∈ {available, pending}）。"""

def ensure_seeded(db) -> None:
    """幂等：agent_states 空表时按 seed 的 enabled_default 全量插入。"""

def effective_agents(db) -> list[dict]:
    """种子 + 运行时状态合并（state 有则覆盖 enabled），返回完整字段列表（key/name/description/category/status/triggers/capability/permission/enabled）。"""

def set_agent_enabled(db, key: str, enabled: bool) -> dict | None:
    """更新开关；未知 key 返回 None；返回合并后的完整条目。"""
```

- 降级纪律：agents.yaml 缺失/损坏 → effective_agents 返回空列表并 logger.error（不阻断服务启动）

## 三、银行平台运行时状态（`core/bank_platform_states.py`，≤100 行）

```python
"""银行×平台运行时覆盖 — bank_platform_states 表（WO-25）。"""

def get_override(db, bank_key: str) -> dict | None:
    """返回 {platforms, vera_confirmed} 覆盖；无覆盖返回 None。"""

def set_override(db, bank_key: str, platforms: list[str], vera_confirmed: bool) -> None:
    """写入/更新覆盖（upsert）。"""

def merged_bank_item(db, lender: dict) -> dict:
    """registry 条目 + 覆盖合并：覆盖存在时 platforms/vera_confirmed 取覆盖值。"""
```

## 四、API 契约

### schemas.py 新增

```python
class AgentItem(BaseModel):
    key: str
    name: str
    description: str
    category: str            # agent | tool
    status: str              # available | pending
    enabled: bool
    triggers: list[str] = Field(default_factory=list)
    capability: str | None = None
    permission: str | None = None

class AgentsResponse(BaseModel):
    agents: list[AgentItem] = Field(default_factory=list)

class AgentUpdateRequest(BaseModel):
    enabled: bool

class BankPlatformUpdateRequest(BaseModel):
    platforms: list[str] = Field(default_factory=list)   # 至少一个，且必须是平台 key 白名单内
    vera_confirmed: bool = True
```

### server/api/agents.py（router prefix=`/api`）

```python
@router.get("/agents/", response_model=AgentsResponse)
def list_agents(db: Session = Depends(get_db)): ...   # 先 ensure_seeded 再 effective_agents

@router.patch("/agents/{key}", response_model=AgentItem)
def update_agent(key: str, req: AgentUpdateRequest, db: Session = Depends(get_db)): ...
    # 未知 key → 404；成功返回合并后完整条目
```

### server/api/banks.py 修改

- `GET /api/banks/`：platforms / vera_confirmed 改用 merged_bank_item（有覆盖用覆盖，无覆盖用 registry）
- 新增：

```python
@router.patch("/banks/{key}", response_model=BankItem)
def update_bank_platforms(key: str, req: BankPlatformUpdateRequest, db: Session = Depends(get_db)): ...
    # 未知 bank → 404；platforms 含非白名单 key → 422（列出非法值）；platforms 为空 → 422
    # 写入覆盖后返回合并后的 BankItem
```

### server/main.py：注册 agents_router

## 五、迁移（`<gen>_add_agent_bank_states.py`）

- down_revision = `dccde7819389`
- 普通表（非虚拟表），batch 创建：
  - `agent_states`：agent_key String PK、enabled Boolean nullable=False default=True、config Text nullable、updated_at DateTime
  - `bank_platform_states`：bank_key String PK、platforms Text nullable=False（JSON 数组）、vera_confirmed Boolean nullable=False default=False、updated_at DateTime
- upgrade/downgrade 对称；ORM 两个类与列一一对应

## 六、测试

### tests/test_core/test_agents_registry.py（≥6）
1. load_seed 11 项、key 唯一、category/status 枚举合法
2. ensure_seeded 幂等（跑两次不重复插入）
3. effective_agents 初始 enabled == enabled_default
4. set_agent_enabled 更新后 effective 反映新值
5. set_agent_enabled 未知 key → None
6. agents.yaml 缺失（monkeypatch 路径）→ effective_agents 空列表不抛

### tests/test_api/test_agents.py（≥6）
1. GET /api/agents/ → 200，11 项，含 agent-calculator
2. PATCH enabled=false → 200，GET 反映
3. PATCH 未知 key → 404
4. PATCH body 缺 enabled → 422
5. PATCH 后重启语义（新 session）状态保留
6. 前端契约：响应含 triggers/capability/permission 字段

### tests/test_api/test_bank_platform_patch.py（≥7）
1. GET /api/banks/ 无覆盖时 == registry 值（vera_confirmed=false）
2. PATCH cba {platforms:[mqg], vera_confirmed:true} → 200；GET cba 反映（platforms=[mqg]、confirmed=true）
3. PATCH 未知 bank → 404
4. PATCH 非法平台 key → 422（detail 含非法值）
5. PATCH platforms=[] → 422
6. 覆盖后改回（platforms 恢复原值）→ GET 反映（可逆）
7. 幂等：同值重复 PATCH → 200 不变

### tests/test_alembic.py（+2 断言）
- upgrade head 后 agent_states / bank_platform_states 存在

## 七、验收标准（全量门禁）

- 专项 3 文件全绿；`pytest tests/ -q` → 727 基线（WO-24 后）+ 新增，0 failed / 0 skipped
- `ruff check`（本单文件）→ All checks passed
- 临时 SQLite：alembic upgrade head 成功，含 2 新表；ORM 导入正常
- TestClient 实测：GET /api/agents/ 11 项；PATCH agent-calculator enabled=false → GET 反映；PATCH cba 平台+确认 → GET 反映
- 前端零改动；config/bank_registry.yaml 未改动

## 提交建议（一次）

```
git add config/agents.yaml core/agents/registry.py core/bank_platform_states.py
git add core/migrations/versions/*_add_agent_bank_states.py core/models/orm.py
git add server/api/agents.py server/api/banks.py server/api/schemas.py server/main.py
git add tests/test_core/test_agents_registry.py tests/test_api/test_agents.py tests/test_api/test_bank_platform_patch.py tests/test_alembic.py
git commit -m "feat: WO-25 能力中心注册表 + 银行×平台确认 PATCH（Agent/Tool 数据驱动 + 运行时状态）"
```

⚠️ 执行纪律：只改「改动范围」表内文件；bank_registry.yaml 只读；每步完成立即验证；失败停下报告。
