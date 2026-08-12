# 施工单 11：微信通道升级 + 草稿双模式

> 执行者：DeepSeek  
> 依赖：WO-08（任务引擎）、WO-09（摘要服务）  
> 预估：2 天

---

## 技术约束

- 新增文件放 `core/wechat/`、`core/drafts/`
- Python 文件行数 ≤ 200
- 不引入新的 pip 依赖（微信 API 用 httpx）
- 草稿版本上限 10，超过自动清理最旧
- AI 调用必须经过脱敏

---

## 目标

1. 微信案件级查询（"李明的案件进度"）
2. 每日早报（案件摘要 + 今日待办）
3. 紧急推送（escalation 触发）
4. 草稿版本管理（max 10）
5. AI 对话修正模式（"改成更客气的语气"）
6. 双文体系（中英文同步生成）

---

## 改动范围

| 文件 | 操作 | 说明 |
|------|------|------|
| `core/wechat/__init__.py` | 已有 | — |
| `core/wechat/ilink.py` | 新建 | 从旧项目 `server/services/wechat_ilink.py` 复制并适配 import（httpx 接口层） |
| `core/wechat/handler.py` | 新建 | 微信消息分发 |
| `core/wechat/case_query.py` | 新建 | 案件查询响应 |
| `core/wechat/morning_report.py` | 新建 | 每日早报 |
| `core/wechat/push.py` | 新建 | 紧急推送 |
| `core/drafts/version_manager.py` | 新建 | 版本管理 |
| `core/drafts/conversation_refine.py` | 新建 | AI 对话修正 |
| `core/drafts/generator.py` | 修改 | 支持双文 |
| `tests/test_wechat.py` | 新建 | 微信测试 |
| `tests/test_draft_versions.py` | 新建 | 版本管理测试 |

---

## 接口契约

### wechat/handler.py

```python
def handle_wechat_message(
    sender: str,
    content: str,
    msg_type: str = "text",
    db: Session = ...,
) -> str:
    """分发微信消息到对应处理器。

    路由规则：
    - 包含案件名/客户名 → case_query
    - "早报" / "今日" → morning_report
    - "紧急" / "urgent" → escalation 查询
    - 其他 → 通用 AI 对话
    """
    ...
```

### wechat/case_query.py

```python
def query_case_by_keyword(
    keyword: str,
    db: Session,
) -> str:
    """根据关键词（客户名/案件号）查询并返回中文摘要。

    Returns:
        格式化的微信回复文本（≤ 500 字）
    """
    ...
```

### wechat/morning_report.py

```python
def generate_morning_report(db: Session) -> str:
    """生成今日早报。

    内容：
    1. 今日待处理任务数
    2. 各案件一句话状态
    3. 超期预警
    4. 昨日完成统计
    """
    ...
```

### drafts/version_manager.py

```python
class DraftVersionManager:
    """草稿版本管理（每个 action_id 维护版本栈）。"""

    def save_version(
        self, action_id: int, content_zh: str, content_en: str,
        source: str = "ai",  # ai / manual / refine
        db: Session = ...,
    ) -> int:
        """保存新版本，返回版本号。超 10 版自动清理。"""
        ...

    def rollback(self, action_id: int, version: int, db: Session) -> dict:
        """回退到指定版本。"""
        ...

    def get_history(self, action_id: int, db: Session) -> list[dict]:
        """获取版本历史。"""
        ...
```

### drafts/conversation_refine.py

```python
def refine_draft(
    action_id: int,
    instruction: str,  # "改成更客气的语气" / "加上deadline提醒"
    db: Session,
) -> dict:
    """AI 对话修正当前草稿。

    Returns:
        {"version": 3, "content_zh": "...", "content_en": "...", "changes_summary": "..."}
    """
    ...
```

---

## 验证步骤

### Step 1：import 验证
```python
python -c "
from core.wechat.handler import handle_wechat_message
from core.wechat.case_query import query_case_by_keyword
from core.wechat.morning_report import generate_morning_report
from core.wechat.push import push_urgent
from core.drafts.version_manager import DraftVersionManager
from core.drafts.conversation_refine import refine_draft
print('All WO-11 imports OK')
"
```

### Step 2：版本管理测试
```python
python -c "
from core.drafts.version_manager import DraftVersionManager
vm = DraftVersionManager()
# 模拟 12 次保存
for i in range(12):
    vm.save_version(1, f'中文v{i}', f'EnV{i}', db=test_db)
history = vm.get_history(1, db=test_db)
assert len(history) <= 10, f'Version overflow: {len(history)}'
print('Version cap OK')
"
```

### Step 3：测试
```bash
python -m pytest tests/test_wechat.py tests/test_draft_versions.py -v
```

---

## 失败标准

- `handle_wechat_message("vera", "李明的案件")` 未路由到 case_query → **FAIL**
- 早报 > 1000 字 → **FAIL**
- 版本数 > 10 后未清理最旧版本 → **FAIL**
- `rollback(action_id=1, version=3)` 后 current != v3 内容 → **FAIL**
- `refine_draft` 未调用 desensitize → **FAIL**（安全红线）
- 任何文件 > 200 行 → **FAIL**

---

⚠️ 执行纪律：
1. 微信 API 调用走 httpx，超时 10s
2. 所有对外文本经过脱敏
3. 早报用 APScheduler 定时触发（注册在 WO-10 的 jobs.py）
4. 版本存储复用 CaseKnowledge 表（type="draft_version"）
5. 草稿回退是"复制旧版本为新版本"，不是真删除
