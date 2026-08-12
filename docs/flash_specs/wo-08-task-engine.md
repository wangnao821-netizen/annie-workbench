# 施工单 08：V5 任务引擎 + 数据模型扩展

> 执行者：Antigravity（高优先级，核心架构）  
> 依赖：WO-01+02 完成  
> 预估：2 天

---

## 技术约束

- 所有新增文件放 `core/task_engine/` 和 `core/models/`
- Python 文件行数 ≤ 200
- 所有新增函数必须有 type annotation + docstring
- 数据库变更必须附迁移脚本
- 测试覆盖率 ≥ 80%
- 不引入新的 pip 依赖

---

## 目标

实现 V5 的"灵魂"——任务引擎，替代旧的 `proactive_suggestions.py` + `action_factory.py`，提供：
1. ActionItem 数据模型扩展
2. 任务分发器（dispatcher）
3. 委派 + 催办机制
4. 老板决策融入
5. SSE 事件推送基础

---

## 改动范围

| 文件 | 操作 | 说明 |
|------|------|------|
| `core/models/orm.py` | 修改 | Action 表新增 7 个字段 |
| `core/models/orm.py` | 修改 | CaseChecklist 新增 `received_file_ids` |
| `core/task_engine/__init__.py` | 已有 | — |
| `core/task_engine/dispatcher.py` | 新建 | 任务分发（替代 proactive_suggestions） |
| `core/task_engine/delegation.py` | 新建 | 委派 + deadline + 催办 + 收回 |
| `core/task_engine/boss_decision.py` | 新建 | 老板决策处理 |
| `core/events/sse.py` | 新建 | SSE 推送基础类 |
| `core/ai/knowledge_base.py` | 新建 | CaseKnowledgeBase 迁移（来自旧 modules/strategy_engine/） |
| `tools/migrate_v2_action_fields.py` | 新建 | 字段迁移脚本 |
| `tests/test_task_engine.py` | 新建 | 核心测试 |
| `tests/test_safety/test_action_model.py` | 新建 | 模型安全测试 |

### WO-01/02 遗留降级项（本单必须补齐）

以下 3 处在 WO-01/02 迁移时被有意延后（带 `TODO(WO-08)` + try/except 兜底），本单需实现真实逻辑：

| 位置 | 当前状态 | 需要做 |
|------|---------|--------|
| `onboarding.py` L501 `append_context_event` | stub：只打日志，深度扫描结构化摘要不再落库 | 实现 `core/ai/context_accumulator.py`，恢复"扫描→案件上下文"写入 |
| `onboarding.py` L563 `StrategyEngine` | `raise NotImplementedError` + fallback 预估版报告 | 迁移 `modules/strategy_engine/` → `core/ai/strategy_engine.py`，恢复 AI 策略报告生成；同时清理 L565 不可达死代码 |
| `state_machine.py` L334 `CaseKnowledgeBase` | `except ImportError` 跳过（`core/ai/knowledge_base.py` 不存在） | 新建 `core/ai/knowledge_base.py`，迁移 `modules/strategy_engine/knowledge_base.py`；去掉 ImportError 反模式 |

---

## 接口契约

### Action 表新增字段（core/models/orm.py）

```python
# 在 Action class 中新增以下列：
source_channel = Column(String, default="email")  # email/file/wechat/manual
routing_options = Column(JSON, nullable=True)       # 可执行建议元数据
delegated_to = Column(String, nullable=True)        # 委派对象
delegated_at = Column(DateTime, nullable=True)
delegation_deadline = Column(DateTime, nullable=True)
delegation_feedback = Column(String, nullable=True)  # 同事反馈
boss_decision = Column(String, nullable=True)        # approve/reject/defer + 备注
```

### CaseChecklist 新增字段

```python
received_file_ids = Column(JSON, default=list)  # [file_id, ...] 支持多文件
```

### dispatcher.py 核心 API

```python
def create_task(
    case_id: str,
    task_type: str,      # "email_draft" | "file_confirm" | "os_review" | ...
    source_channel: str,  # "email" | "file" | "wechat" | "manual"
    title: str,
    context: dict,        # 结构化上下文
    routing_options: list[dict] | None = None,  # [{action: "approve", label: "批准"}, ...]
    db: Session = ...,
) -> Action:
    """创建一个任务到 Vera 的 Action Inbox。"""
    ...

def dispatch_task(
    task_id: int,
    action: str,  # "approve" | "reject" | "defer" | "delegate"
    operator: str = "vera",
    note: str = "",
    db: Session = ...,
) -> Action:
    """派单三键 + 委派。"""
    ...
```

### delegation.py 核心 API

```python
def delegate_to(
    task_id: int,
    delegate_name: str,
    deadline: datetime | None = None,
    message: str = "",
    db: Session = ...,
) -> Action:
    """委派任务给同事，可选 deadline。"""
    ...

def record_feedback(
    task_id: int,
    feedback: str,
    db: Session = ...,
) -> Action:
    """同事提交反馈，闭环委派流程。"""
    ...

def recall_delegation(task_id: int, db: Session) -> Action:
    """收回委派（Vera 反悔时调用）。"""
    ...

def check_overdue(db: Session) -> list[Action]:
    """检查超期未反馈的委派任务，返回需催办列表。"""
    ...
```

### boss_decision.py 核心 API

```python
def record_boss_reply(
    task_id: int,
    decision: str,  # "approve" | "reject" | "defer"
    note: str = "",
    db: Session = ...,
) -> Action:
    """记录老板决策并推进案件。"""
    ...
```

### sse.py 事件推送

```python
class SseManager:
    """SSE 事件管理器（内存队列，单进程适用）。"""
    
    def publish(self, event_type: str, data: dict) -> None:
        """发布事件到所有订阅者。"""
        ...
    
    async def subscribe(self) -> AsyncGenerator[str, None]:
        """订阅事件流（用于 SSE 端点）。"""
        ...

# 全局单例
sse_manager = SseManager()
```

---

## 迁移脚本（tools/migrate_v2_action_fields.py）

```python
"""给 actions 和 case_checklists 表添加 V2 字段。

Usage: python tools/migrate_v2_action_fields.py
"""
# ALTER TABLE actions ADD COLUMN source_channel TEXT DEFAULT 'email';
# ALTER TABLE actions ADD COLUMN routing_options TEXT;  -- JSON
# ALTER TABLE actions ADD COLUMN delegated_to TEXT;
# ALTER TABLE actions ADD COLUMN delegated_at TEXT;
# ALTER TABLE actions ADD COLUMN delegation_deadline TEXT;
# ALTER TABLE actions ADD COLUMN delegation_feedback TEXT;
# ALTER TABLE actions ADD COLUMN boss_decision TEXT;
# ALTER TABLE case_checklists ADD COLUMN received_file_ids TEXT DEFAULT '[]';
```

---

## 验证步骤

### Step 1：迁移脚本
```bash
python tools/migrate_v2_action_fields.py
sqlite3 data/assistant.db ".schema actions" | grep source_channel
sqlite3 data/assistant.db ".schema actions" | grep boss_decision
sqlite3 data/assistant.db ".schema case_checklists" | grep received_file_ids
```

### Step 2：import 验证
```python
python -c "
from core.task_engine.dispatcher import create_task, dispatch_task
from core.task_engine.delegation import delegate_to, recall_delegation, check_overdue
from core.task_engine.boss_decision import record_boss_reply
from core.events.sse import sse_manager
print('All task engine imports OK')
"
```

### Step 3：测试
```bash
python -m pytest tests/test_task_engine.py tests/test_safety/test_action_model.py -v
```

---

## 失败标准

- 迁移脚本执行后 `.schema actions` 缺任何新字段 → **FAIL**
- `create_task()` 创建的 Action 缺 `source_channel` 默认值 → **FAIL**
- `delegate_to()` 后 `delegated_at` 为 None → **FAIL**
- `recall_delegation()` 后 `delegated_to` 不为 None → **FAIL**
- `check_overdue()` 对未过期任务返回非空 → **FAIL**
- SSE publish 后 subscribe 未收到事件 → **FAIL**
- 任何文件 > 200 行 → **FAIL**

---

⚠️ 执行纪律：
1. 先写测试，再写实现（TDD）
2. ORM 变更和迁移脚本必须同步
3. 所有 datetime 使用 UTC
4. 委派流程必须闭环：委派 → 反馈/收回 → 完成
5. SSE 用内存队列，不引入 Redis
