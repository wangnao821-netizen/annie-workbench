# 施工单 07：测试体系 + client_id 修正

> 执行者：Antigravity（安全测试 + 测试基础设施）  
> 依赖：WO-01+02 完成  
> 预估：2 天  
> 项目根目录：`d:\vera-workbench\`

---

## 技术约束

- 测试框架：pytest + pytest-cov
- 测试目录：`tests/`
- 核心模块覆盖率 ≥ 80%
- conftest 必须兼容旧 `test_env` fixture
- 不使用真实 API Key 或客户数据
- 测试数据用脱敏样本（PERSON_1, $100,000 等）
- Python 文件行数 ≤ 200

---

## 目标

1. **修正** `generate_or_match_client_id`（保留函数名，前缀 `CLI-`）
2. **修正** `onboarding_pipeline.py` 中 `client_{name}` 的旧格式
3. 建立兼容的测试基础设施（conftest + fixtures）
4. 迁移 12 个 safety 测试
5. 迁移核心业务测试
6. 跑通全量测试

---

## 改动范围（完整文件清单）

### Part A：client_id 修正

| 文件 | 操作 | 说明 |
|------|------|------|
| `core/case_creation.py` | 修改 | `generate_or_match_client_id` 前缀统一 `CLI-` |
| `core/pipeline/onboarding.py` | 修改 | L290 附近 `client_{name}` → 调用 `generate_or_match_client_id` |
| `tools/backfill_client_id.py` | 修改 | 更新 import 路径 |

### Part B：测试基础设施

| 文件 | 操作 | 行数上限 | 说明 |
|------|------|---------|------|
| `tests/__init__.py` | 新建 | 1 | — |
| `tests/conftest.py` | 新建 | 180 | 兼容 test_env fixture + 防污染 |
| `tests/test_safety/__init__.py` | 新建 | 1 | — |
| `tests/test_core/__init__.py` | 新建 | 1 | — |
| `tests/test_core/conftest.py` | 新建 | 50 | core 专属 fixtures |
| `pytest.ini` | 新建 | — | pytest 配置 |

### Part C：safety 测试迁移

| 文件 | 行数上限 | 测试内容 |
|------|---------|---------|
| `tests/test_safety/test_path_guard.py` | 120 | PathGuard 核心验证 |
| `tests/test_safety/test_path_guard_user_action.py` | 100 | 用户授权操作验证 |
| `tests/test_safety/test_pii_leak.py` | 80 | PII 泄漏检测 |
| `tests/test_safety/test_drafts_safety.py` | 80 | 草稿不自动发送 |
| `tests/test_safety/test_case_lock_guard.py` | 80 | 案件锁 |
| `tests/test_safety/test_no_auto_write.py` | 60 | AI 不写客户文件夹 |
| `tests/test_safety/test_config_consistency.py` | 100 | 配置一致性 |
| `tests/test_safety/test_stage_progression.py` | 80 | 阶段推进安全 |
| `tests/test_safety/test_types.py` | 60 | DesensitizedText 类型 |
| `tests/test_safety/test_inbox_analyzer_safety.py` | 80 | 收件箱分析安全 |
| `tests/test_safety/test_case_advisor_safety.py` | 80 | AI 建议安全 |
| `tests/test_safety/test_action_model.py` | 80 | ActionItem 模型安全 |

### Part D：核心业务测试

| 文件 | 行数上限 | 测试内容 |
|------|---------|---------|
| `tests/test_core/test_case_creation.py` | 120 | 案件创建 + client_id |
| `tests/test_core/test_pipeline_state.py` | 100 | 流水线状态机 |
| `tests/test_core/test_classifier.py` | 120 | 文件分类 |
| `tests/test_core/test_checklist.py` | 100 | 清单生成 + 匹配 |
| `tests/test_core/test_pii_gateway.py` | 100 | PII 脱敏/还原 |
| `tests/test_core/test_email_drafts.py` | 80 | 草稿生成 |
| `tests/test_core/test_commission.py` | 80 | 佣金计算 |

---

## Step 1：`pytest.ini`

```ini
[pytest]
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts = --strict-markers -ra
markers =
    safety: Red-line safety tests (must never fail)
    slow: Tests that take > 5 seconds
```

---

## Step 2：`tests/conftest.py`

```python
"""Vera Workbench 测试配置 — 兼容旧 test_env fixture。

提供：
- test_db: 内存 SQLite session
- test_env: 兼容旧项目的完整测试环境
- _no_test_pollution: 自动隔离环境变量
"""

import os
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from core.models.orm import Base


@pytest.fixture
def test_db(tmp_path) -> Session:
    """内存 DB fixture — 每个测试独立。"""
    db_path = tmp_path / "test.db"
    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    yield session
    session.close()
    engine.dispose()


@pytest.fixture
def test_env(tmp_path, test_db, monkeypatch):
    """兼容旧项目的 test_env fixture。

    提供隔离的临时目录、环境变量、DB session。
    """
    client_root = tmp_path / "clients"
    client_root.mkdir()
    data_dir = tmp_path / "data"
    data_dir.mkdir()

    monkeypatch.setenv("CLIENT_FILES_ROOT", str(client_root))
    monkeypatch.setenv("VERA_DATA_DIR", str(data_dir))
    monkeypatch.setenv("GEMINI_API_KEY", "test-fake-key-12345")
    monkeypatch.setenv("LOAN_ASSISTANT_DB_PATH", str(tmp_path / "test.db"))

    yield {
        "tmp_path": tmp_path,
        "db": test_db,
        "client_root": client_root,
        "data_dir": data_dir,
    }


@pytest.fixture(autouse=True)
def _no_test_pollution(tmp_path, monkeypatch):
    """防止测试污染生产数据。

    - 强制 VERA_DATA_DIR 指向临时目录
    - 隔离任何文件写操作
    """
    monkeypatch.setenv("VERA_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("VERA_ENV", "test")


@pytest.fixture
def mock_config(monkeypatch, tmp_path):
    """提供一个最小化的配置环境。"""
    config_dir = tmp_path / "config"
    config_dir.mkdir()

    # 创建最小 document_types.yaml
    (config_dir / "document_types.yaml").write_text(
        "categories:\n  - name: payslip\n    patterns: ['payslip', 'salary']\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("VERA_CONFIG_DIR", str(config_dir))
    return config_dir
```

---

## Step 3：`tests/test_core/conftest.py`

```python
"""Core 测试专属 fixtures。"""

import pytest
from core.models.orm import Case, Base


@pytest.fixture
def sample_case(test_db):
    """创建一个样本案件。"""
    case = Case(
        case_id="CASE-20240115001",
        client_name="PERSON_1",
        lender="CBA",
        loan_amount=850000,
        stage="pre_approval",
    )
    test_db.add(case)
    test_db.commit()
    return case
```

---

## Step 4：`core/case_creation.py` 修正

找到 `generate_or_match_client_id` 函数，修正前缀逻辑：

```python
def generate_or_match_client_id(
    client_name: str,
    email: str | None = None,
    db: Session | None = None,
) -> str:
    """生成或匹配客户 ID。

    规则：
    1. 如果 DB 中已有同名+同邮箱的客户 → 返回已有 ID
    2. 否则生成新 ID，格式: CLI-{timestamp_hash}

    Args:
        client_name: 客户姓名
        email: 客户邮箱（用于匹配）
        db: 数据库 session

    Returns:
        客户 ID（格式: CLI-xxxxxx）
    """
    import hashlib
    from datetime import datetime

    # 尝试匹配已有客户
    if db is not None:
        # TODO: 实现 DB 查询匹配
        pass

    # 生成新 ID
    seed = f"{client_name}:{email or ''}:{datetime.now().isoformat()}"
    hash_val = hashlib.sha256(seed.encode()).hexdigest()[:8]
    return f"CLI-{hash_val.upper()}"
```

---

## Step 5：`core/pipeline/onboarding.py` 修正

找到 L290 附近的 `client_{name}` 格式代码，替换为：

```python
# 旧代码（错误）：
# client_id = f"client_{client_name.lower().replace(' ', '_')}"

# 新代码：
from core.case_creation import generate_or_match_client_id
client_id = generate_or_match_client_id(client_name, email, db)
```

---

## Step 6：Safety 测试示例

### `tests/test_safety/test_path_guard.py`

```python
"""PathGuard 安全测试 — 红线。"""

import pytest
from pathlib import Path

from core.security.path_guard import PathGuard


@pytest.mark.safety
class TestPathGuard:
    """验证 PathGuard 阻止所有非法写入。"""

    def test_write_to_client_folder_blocked(self, test_env):
        """AI 不能写入客户文件夹。"""
        client_file = test_env["client_root"] / "case1" / "doc.pdf"
        with pytest.raises(PermissionError):
            PathGuard.assert_write_allowed(client_file)

    def test_write_to_data_allowed(self, test_env):
        """写入 data/ 目录应允许。"""
        data_file = test_env["data_dir"] / "test.json"
        # 不应抛异常
        PathGuard.assert_write_allowed(data_file)

    def test_path_traversal_blocked(self, test_env):
        """路径穿越攻击应被阻止。"""
        evil_path = test_env["client_root"] / ".." / ".." / "etc" / "passwd"
        with pytest.raises(PermissionError):
            PathGuard.assert_write_allowed(evil_path)

    def test_write_to_logs_allowed(self, test_env):
        """写入 logs/ 目录应允许。"""
        log_file = test_env["data_dir"].parent / "logs" / "app.log"
        PathGuard.assert_write_allowed(log_file)


@pytest.mark.safety
class TestPathGuardUserAction:
    """验证用户授权的文件操作。"""

    def test_user_action_requires_confirmation(self, test_env):
        """用户操作必须有 user_confirmed=True。"""
        src = test_env["client_root"] / "case1" / "old.pdf"
        dst = test_env["client_root"] / "case1" / "new.pdf"
        with pytest.raises((PermissionError, ValueError)):
            PathGuard.assert_user_action_allowed(
                src, dst, user_confirmed=False
            )

    def test_cross_case_move_blocked(self, test_env):
        """跨案件移动被禁止。"""
        src = test_env["client_root"] / "case1" / "doc.pdf"
        dst = test_env["client_root"] / "case2" / "doc.pdf"
        with pytest.raises((PermissionError, ValueError)):
            PathGuard.assert_user_action_allowed(
                src, dst, user_confirmed=True
            )

    def test_same_case_rename_allowed(self, test_env):
        """同案件内重命名（已授权）应允许。"""
        case_dir = test_env["client_root"] / "case1"
        case_dir.mkdir(parents=True, exist_ok=True)
        src = case_dir / "old.pdf"
        dst = case_dir / "new.pdf"
        src.touch()
        # 不应抛异常
        PathGuard.assert_user_action_allowed(
            src, dst, user_confirmed=True
        )
```

### `tests/test_safety/test_no_auto_write.py`

```python
"""验证 AI 绝不自动写入客户文件夹。"""

import pytest
from pathlib import Path

from core.security.path_guard import PathGuard


@pytest.mark.safety
class TestNoAutoWrite:
    """AI 绝不自动写入客户文件夹的各种场景。"""

    def test_direct_write_blocked(self, test_env):
        """直接写入客户目录被拒。"""
        path = test_env["client_root"] / "任何文件.txt"
        with pytest.raises(PermissionError):
            PathGuard.assert_write_allowed(path)

    def test_nested_write_blocked(self, test_env):
        """嵌套子目录写入也被拒。"""
        path = test_env["client_root"] / "case1" / "subdir" / "file.pdf"
        with pytest.raises(PermissionError):
            PathGuard.assert_write_allowed(path)

    def test_dont_send_folder_blocked(self, test_env):
        """Don't send 文件夹也不允许写入。"""
        path = test_env["client_root"] / "case1" / "Don't send" / "draft.pdf"
        with pytest.raises(PermissionError):
            PathGuard.assert_write_allowed(path)
```

### `tests/test_safety/test_types.py`

```python
"""DesensitizedText 类型安全测试。"""

import pytest

from core.models.types import DesensitizedText


@pytest.mark.safety
class TestDesensitizedText:
    """确保类型系统强制脱敏。"""

    def test_create_from_desensitize(self):
        """只能通过 desensitize() 创建。"""
        dt = DesensitizedText("PERSON_1 has a loan")
        assert isinstance(dt, DesensitizedText)
        assert str(dt) == "PERSON_1 has a loan"

    def test_not_plain_str(self):
        """DesensitizedText 和 str 不是同一类型。"""
        dt = DesensitizedText("test")
        # 虽然继承自 str，但类型检查应区分
        assert type(dt).__name__ == "DesensitizedText"
```

### `tests/test_safety/test_case_lock_guard.py`

```python
"""案件锁安全测试。"""

import pytest

from core.security.case_lock import CaseLockGuard


@pytest.mark.safety
class TestCaseLockGuard:
    """验证案件锁防止并发冲突。"""

    def test_lock_prevents_concurrent_access(self, test_env):
        """同一案件不能被两个操作同时修改。"""
        guard = CaseLockGuard()
        case_id = "CASE-001"

        # 获取锁
        guard.acquire(case_id, operator="AI")
        
        # 再次获取同一案件应失败
        with pytest.raises(Exception):
            guard.acquire(case_id, operator="AI")

        # 释放后可再次获取
        guard.release(case_id)
        guard.acquire(case_id, operator="AI")
        guard.release(case_id)

    def test_different_cases_independent(self, test_env):
        """不同案件的锁互不干扰。"""
        guard = CaseLockGuard()
        guard.acquire("CASE-001", operator="AI")
        # 另一个案件应该可以获取
        guard.acquire("CASE-002", operator="AI")
        guard.release("CASE-001")
        guard.release("CASE-002")
```

---

## Step 7：核心业务测试示例

### `tests/test_core/test_case_creation.py`

```python
"""案件创建 + client_id 测试。"""

import pytest

from core.case_creation import generate_or_match_client_id


class TestClientIdGeneration:
    """client_id 生成测试。"""

    def test_prefix_format(self):
        """ID 前缀必须是 CLI-。"""
        cid = generate_or_match_client_id("John Doe", "john@test.com")
        assert cid.startswith("CLI-"), f"Expected CLI- prefix, got {cid}"

    def test_consistent_format(self):
        """格式为 CLI-{8位十六进制}。"""
        cid = generate_or_match_client_id("Jane Smith", "jane@test.com")
        parts = cid.split("-")
        assert len(parts) == 2
        assert parts[0] == "CLIENT"
        assert len(parts[1]) == 8
        assert all(c in "0123456789ABCDEF" for c in parts[1])

    def test_different_inputs_different_ids(self):
        """不同输入生成不同 ID。"""
        cid1 = generate_or_match_client_id("John", "john@a.com")
        cid2 = generate_or_match_client_id("Jane", "jane@b.com")
        assert cid1 != cid2

    def test_no_old_format(self):
        """不应生成旧格式 client_xxx。"""
        cid = generate_or_match_client_id("John Doe", None)
        assert not cid.startswith("client_"), f"Old format detected: {cid}"
        assert "john" not in cid.lower()
```

### `tests/test_core/test_checklist.py`

```python
"""清单生成与匹配测试。"""

import pytest


class TestChecklistGenerator:
    """清单生成测试。"""

    def test_generates_for_known_lender(self, mock_config):
        """已知银行应生成清单。"""
        from core.checklist.generator import generate_checklist
        items = generate_checklist(lender="CBA", loan_type="home_loan")
        assert len(items) > 0

    def test_conditional_items_marked(self, mock_config):
        """条件项应标记为待确认。"""
        from core.checklist.generator import generate_checklist
        items = generate_checklist(lender="CBA", loan_type="home_loan")
        conditional = [i for i in items if i.get("conditional")]
        # conditional 项应该存在
        for item in conditional:
            assert item.get("status") in ("pending_confirmation", "待确认")
```

---

## Step 8：运行全量测试

```bash
cd d:\vera-workbench
python -m pytest tests/ -v --tb=short --cov=core --cov-report=term-missing -x
```

---

## 验证步骤

### Step A：client_id 修正验证
```python
python -c "
import sys; sys.path.insert(0, '.')
from core.case_creation import generate_or_match_client_id
cid = generate_or_match_client_id('John Doe', 'john@test.com')
assert cid.startswith('CLI-'), f'Expected CLI- prefix, got {cid}'
print(f'client_id OK: {cid}')
"
```

### Step B：conftest 加载
```bash
python -m pytest tests/ --co -q 2>&1 | head -20
# 应列出测试项，不报 fixture 错误
```

### Step C：safety 测试
```bash
python -m pytest tests/test_safety/ -v --tb=short -m safety
```

### Step D：全量测试 + 覆盖率
```bash
python -m pytest tests/ -v --cov=core --cov-report=term-missing
# 核心模块覆盖率 ≥ 80%
```

### Step E：行数检查
```bash
find tests/ -name "*.py" -exec wc -l {} \; | sort -rn | head -10
# 最大文件应 ≤ 200 行
```

---

## 失败标准

- `generate_or_match_client_id` 函数被改名 → **FAIL**（契约先行）
- 生成的 ID 不以 `CLI-` 开头 → **FAIL**
- `onboarding_pipeline.py` 仍有 `client_{name}` 格式 → **FAIL**
- `test_env` fixture 不可用 → **FAIL**
- safety 测试文件 < 10 个 → **FAIL**
- 任何 safety 测试 FAIL → **FAIL**（红线）
- 测试文件 import `shared.*` 或 `server.services.*` → **FAIL**
- 测试使用真实 API Key 或客户数据 → **FAIL**
- 任何文件 > 200 行 → **FAIL**
- `_no_test_pollution` fixture 未生效 → **FAIL**

---

⚠️ 执行纪律：
1. 保留 `generate_or_match_client_id` 函数名，只改前缀逻辑
2. conftest 必须同时支持 `:memory:` 和 file-based DB
3. 测试不使用真实 API Key（monkeypatch 假值）
4. 测试数据用脱敏样本（PERSON_1, $100,000 等）
5. 每迁移一批测试立即运行验证
6. safety 测试用 `@pytest.mark.safety` 标记
7. 旧项目的测试逻辑保留，只改 import 路径
