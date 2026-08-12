# 施工单 06：云端同步 + Leak Guard

> 执行者：Antigravity（安全敏感模块）  
> 依赖：WO-01+02 完成 + WO-10（APScheduler，可先不依赖）  
> 预估：1.5 天  
> 项目根目录：`d:\vera-workbench\`

---

## 技术约束

- 新依赖：`supabase-py`、`httpx`（加入 pyproject.toml `[project.optional-dependencies.cloud]`）
- Python 文件行数 ≤ 200
- **PII 绝不上云**（pii_map 不同步，云端只存脱敏后的摘要）
- 同步只推脱敏后的结构化数据
- 测试不实际连 Supabase（mock httpx）
- 所有新函数必须有 type annotation + docstring

---

## 目标

1. 本地 DB → 云端脱敏镜像推送（增量同步，§15.11）
2. 脱敏数据 → Supabase 推送（手机查看案件进度）
3. 增量同步断点管理（重启不重传）
4. 出站 PII 二次检查（Leak Guard）
5. Supabase DDL + RLS 策略

---

## 改动范围（完整文件清单）

| 文件 | 操作 | 行数上限 | 说明 |
|------|------|---------|------|
| `core/sync/__init__.py` | 已有 | 1 | — |
| `core/sync/cloud_push.py` | 新建 | 150 | 本地 DB → Supabase 增量推送（脱敏数据） |
| `core/sync/nas_sync.py` | 新建 | 120 | NAS _Inbox → 本地暂存（文件监控网络版） |
| `core/sync/checkpoint.py` | 新建 | 80 | 增量同步断点 |
| `core/pii/leak_guard.py` | 新建 | 120 | 出站 PII 二次检查 |
| `tools/supabase_ddl.sql` | 新建 | — | Supabase 建表 DDL |
| `pyproject.toml` | 修改 | — | 新增 cloud optional deps |
| `tests/test_sync.py` | 新建 | 180 | 同步测试 |
| `tests/test_safety/test_leak_guard.py` | 新建 | 150 | PII 泄漏检测测试 |

---

## Step 1：`core/pii/leak_guard.py`（安全先行）

```python
"""出站 PII 二次检查 — 红线安全模块。

在所有文本离开内网前（发送到 Supabase / 外部 API / 日志系统），
必须经过本模块扫描。命中 PII → 拒绝发送 + 写高危日志 + 通知 Vera。
"""

import re
from dataclasses import dataclass

from core.logger import get_logger

logger = get_logger(__name__)


class PiiLeakError(Exception):
    """PII 泄漏检测异常 — 命中后必须中止出站操作。"""

    def __init__(self, matched_type: str, context: str = ""):
        self.matched_type = matched_type
        self.context = context
        super().__init__(f"PII leak detected: {matched_type} in {context}")


@dataclass
class _Pattern:
    name: str
    regex: re.Pattern


# ── 澳洲 PII 检测模式 ────────────────────────────────────
_PATTERNS: list[_Pattern] = [
    _Pattern("AU_MOBILE", re.compile(r"04\d{2}[\s-]?\d{3}[\s-]?\d{3}")),
    _Pattern("AU_LANDLINE", re.compile(r"0[2-9]\d{1}[\s-]?\d{4}[\s-]?\d{4}")),
    _Pattern("EMAIL", re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")),
    _Pattern("TFN", re.compile(r"\b\d{3}[\s-]?\d{3}[\s-]?\d{3}\b")),
    _Pattern("ABN", re.compile(r"\b\d{2}[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{3}\b")),
    _Pattern("BSB", re.compile(r"\b\d{3}[\s-]\d{3}\b")),
    _Pattern("BANK_ACCOUNT", re.compile(r"\b\d{6,9}\b")),
    _Pattern("PASSPORT_MRZ", re.compile(r"P<[A-Z]{3}[A-Z<]{39}")),
]

# 白名单：不误报的已知模式
_WHITELIST = [
    re.compile(r"PERSON_\d+"),  # 脱敏占位符
    re.compile(r"AMOUNT_\d+"),
    re.compile(r"CASE-\d+"),    # 案件号
    re.compile(r"CLIENT-\w+"),  # 客户号
    re.compile(r"\d{4}-\d{2}-\d{2}"),  # 日期（ISO 格式）
]


def assert_no_pii_leak(text: str, context: str = "") -> None:
    """扫描文本中的 PII，命中则抛出 PiiLeakError。

    Args:
        text: 要检查的文本
        context: 上下文描述（用于日志）

    Raises:
        PiiLeakError: 如果检测到 PII
    """
    for pattern in _PATTERNS:
        matches = pattern.regex.findall(text)
        for match in matches:
            # 检查白名单
            if any(wl.fullmatch(match) for wl in _WHITELIST):
                continue
            # 命中 PII
            logger.critical(
                "PII_LEAK_DETECTED | type=%s | context=%s | snippet=%.20s...",
                pattern.name, context, match,
            )
            raise PiiLeakError(pattern.name, context)


def scan_payload(payload: dict, context: str = "") -> None:
    """递归扫描 dict 中所有字符串值。"""
    for key, value in payload.items():
        if isinstance(value, str):
            assert_no_pii_leak(value, context=f"{context}.{key}")
        elif isinstance(value, dict):
            scan_payload(value, context=f"{context}.{key}")
        elif isinstance(value, list):
            for i, item in enumerate(value):
                if isinstance(item, str):
                    assert_no_pii_leak(item, context=f"{context}.{key}[{i}]")
```

---

## Step 2：`core/sync/checkpoint.py`

```python
"""增量同步断点管理。

断点存储在 data/sync_state.json，记录每种同步的上次时间戳。
"""

import json
from datetime import datetime, timezone
from pathlib import Path

from core.config import get_project_root
from core.logger import get_logger

logger = get_logger(__name__)

_STATE_FILE = get_project_root() / "data" / "sync_state.json"


class SyncCheckpoint:
    """增量同步断点管理器。"""

    def __init__(self, state_file: Path | None = None):
        self._file = state_file or _STATE_FILE
        self._state: dict[str, str] = {}
        self._load()

    def _load(self) -> None:
        """从磁盘加载断点。"""
        if self._file.exists():
            try:
                self._state = json.loads(self._file.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                logger.warning("sync_state.json 损坏，使用空状态")
                self._state = {}

    def load(self, sync_type: str) -> datetime | None:
        """加载指定同步类型的上次时间。"""
        ts = self._state.get(sync_type)
        if ts:
            return datetime.fromisoformat(ts)
        return None

    def save(self, sync_type: str, timestamp: datetime | None = None) -> None:
        """保存本次同步时间。"""
        if timestamp is None:
            timestamp = datetime.now(timezone.utc)
        self._state[sync_type] = timestamp.isoformat()
        self._file.parent.mkdir(parents=True, exist_ok=True)
        self._file.write_text(
            json.dumps(self._state, indent=2),
            encoding="utf-8",
        )
```

---

## Step 3：`core/sync/cloud_push.py`

```python
"""脱敏数据 → Supabase 推送。

只推送案件摘要级别的脱敏数据，绝不推送文件内容或客户 PII。
"""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from core.logger import get_logger
from core.models.orm import Case, Action
from core.pii.gateway import desensitize
from core.pii.leak_guard import assert_no_pii_leak, scan_payload, PiiLeakError
from core.sync.checkpoint import SyncCheckpoint

logger = get_logger(__name__)

_checkpoint = SyncCheckpoint()


def _build_case_payload(case: Case, db: Session) -> dict:
    """构建单个案件的脱敏 payload。"""
    pending = db.query(Action).filter(
        Action.case_id == case.case_id,
        Action.status == "pending",
    ).count()

    payload = {
        "case_id": case.case_id,
        "stage": case.stage or "unknown",
        "progress_pct": float(getattr(case, "progress_pct", 0) or 0),
        "brief": desensitize(
            case.brief or "无摘要", case.case_id, db
        ) if case.brief else "无摘要",
        "last_activity_at": (
            case.updated_at.isoformat() if case.updated_at else None
        ),
        "pending_task_count": pending,
        "synced_at": datetime.now(timezone.utc).isoformat(),
    }

    # 二次检查：确保 payload 中无 PII
    scan_payload(payload, context=f"cloud_push.{case.case_id}")
    return payload


def push_case_summary(case_id: str, db: Session) -> bool:
    """推送单个案件的脱敏摘要到 Supabase。

    Returns:
        True 成功 / False 失败
    """
    import os
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_ANON_KEY")

    if not supabase_url or not supabase_key:
        logger.debug("SUPABASE 未配置，跳过推送")
        return False

    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        logger.warning("push_case_summary: 案件 %s 不存在", case_id)
        return False

    try:
        payload = _build_case_payload(case, db)
    except PiiLeakError as e:
        logger.critical("PII 泄漏阻止推送: %s", e)
        return False

    try:
        import httpx
        resp = httpx.post(
            f"{supabase_url}/rest/v1/case_summaries",
            json=payload,
            headers={
                "apikey": supabase_key,
                "Authorization": f"Bearer {supabase_key}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates",
            },
            timeout=30,
        )
        resp.raise_for_status()
        _checkpoint.save("cloud_push")
        return True
    except Exception as e:
        logger.error("云端推送失败: %s", e)
        return False


def push_all_cases(db: Session) -> dict:
    """推送所有活跃案件。"""
    cases = db.query(Case).filter(Case.is_archived != True).all()
    results = {"success": 0, "failed": 0, "skipped": 0}
    for case in cases:
        ok = push_case_summary(case.case_id, db)
        if ok:
            results["success"] += 1
        else:
            results["failed"] += 1
    logger.info("云端推送完成: %s", results)
    return results
```

---

## Step 4：`core/sync/nas_sync.py`（NAS _Inbox → 本地暂存）

```python
"""NAS → 本地增量同步。

定时扫描 NAS 上的 _Inbox 目录，将新文件拷贝到本地处理。
"""

import shutil
from datetime import datetime, timezone
from pathlib import Path

from core.config import get_project_root
from core.logger import get_logger
from core.security.path_guard import PathGuard
from core.sync.checkpoint import SyncCheckpoint

logger = get_logger(__name__)

_checkpoint = SyncCheckpoint()


def sync_from_nas(
    inbox_dir: Path,
    local_staging: Path | None = None,
) -> list[Path]:
    """从 NAS _Inbox 目录同步新文件到本地暂存区。

    Args:
        inbox_dir: NAS 上的 _Inbox 目录路径
        local_staging: 本地暂存目录（默认 data/staging/）

    Returns:
        新同步的文件路径列表
    """
    if local_staging is None:
        local_staging = get_project_root() / "data" / "staging"
    local_staging.mkdir(parents=True, exist_ok=True)

    # 检查 NAS 可达
    if not inbox_dir.exists():
        logger.warning("NAS 路径不可达: %s", inbox_dir)
        return []

    last_sync = _checkpoint.load("nas_sync")
    synced: list[Path] = []

    for file_path in inbox_dir.iterdir():
        if not file_path.is_file():
            continue

        # 增量：只同步上次之后的文件
        mtime = datetime.fromtimestamp(
            file_path.stat().st_mtime, tz=timezone.utc
        )
        if last_sync and mtime <= last_sync:
            continue

        # 复制到本地暂存
        dest = local_staging / file_path.name
        if dest.exists():
            # 同名文件加时间戳
            stem = file_path.stem
            suffix = file_path.suffix
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            dest = local_staging / f"{stem}_{ts}{suffix}"

        try:
            shutil.copy2(file_path, dest)
            synced.append(dest)
            logger.info("NAS 同步: %s → %s", file_path.name, dest.name)
        except OSError as e:
            logger.error("NAS 同步失败: %s → %s", file_path.name, e)

    if synced:
        _checkpoint.save("nas_sync")
        logger.info("NAS 同步完成: %d 个新文件", len(synced))

    return synced
```

---

## Step 5：`tools/supabase_ddl.sql`

```sql
-- ============================================================
-- Vera Workbench — Supabase DDL
-- 只存储脱敏后的摘要数据，绝不存储 PII
-- ============================================================

-- 案件摘要表
CREATE TABLE IF NOT EXISTS case_summaries (
    case_id TEXT PRIMARY KEY,
    stage TEXT NOT NULL DEFAULT 'unknown',
    progress_pct FLOAT DEFAULT 0,
    brief TEXT,
    last_activity_at TIMESTAMPTZ,
    pending_task_count INT DEFAULT 0,
    synced_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_case_summaries_stage
    ON case_summaries(stage);
CREATE INDEX IF NOT EXISTS idx_case_summaries_synced
    ON case_summaries(synced_at);

-- RLS 策略（只允许 service_role 访问）
ALTER TABLE case_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON case_summaries
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- 匿名用户只读（用于手机查看）
CREATE POLICY "anon_read" ON case_summaries
    FOR SELECT
    USING (true);

-- Upsert 函数
CREATE OR REPLACE FUNCTION upsert_case_summary(p_payload jsonb)
RETURNS void AS $$
BEGIN
    INSERT INTO case_summaries (case_id, stage, progress_pct, brief, last_activity_at, pending_task_count, synced_at)
    VALUES (
        p_payload->>'case_id',
        p_payload->>'stage',
        (p_payload->>'progress_pct')::float,
        p_payload->>'brief',
        (p_payload->>'last_activity_at')::timestamptz,
        (p_payload->>'pending_task_count')::int,
        now()
    )
    ON CONFLICT (case_id) DO UPDATE SET
        stage = EXCLUDED.stage,
        progress_pct = EXCLUDED.progress_pct,
        brief = EXCLUDED.brief,
        last_activity_at = EXCLUDED.last_activity_at,
        pending_task_count = EXCLUDED.pending_task_count,
        synced_at = now();
END;
$$ LANGUAGE plpgsql;
```

---

## Step 6：`pyproject.toml` 修改

在 `[project.optional-dependencies]` 中新增：

```toml
[project.optional-dependencies]
cloud = ["supabase>=2.0", "httpx>=0.25"]
```

---

## Step 7：`tests/test_safety/test_leak_guard.py`

```python
"""PII 泄漏检测安全测试 — 红线测试。"""

import pytest

from core.pii.leak_guard import assert_no_pii_leak, scan_payload, PiiLeakError


class TestLeakGuard:
    """PII 泄漏检测测试。"""

    def test_clean_text_passes(self):
        """脱敏后的文本应该通过。"""
        assert_no_pii_leak("Loan of 850000 from CBA for PERSON_1")

    def test_mobile_detected(self):
        """澳洲手机号应被检测。"""
        with pytest.raises(PiiLeakError, match="AU_MOBILE"):
            assert_no_pii_leak("Call 0412 345 678")

    def test_email_detected(self):
        """邮箱应被检测。"""
        with pytest.raises(PiiLeakError, match="EMAIL"):
            assert_no_pii_leak("Contact john@example.com")

    def test_tfn_detected(self):
        """TFN 应被检测。"""
        with pytest.raises(PiiLeakError, match="TFN"):
            assert_no_pii_leak("TFN: 123 456 789")

    def test_abn_detected(self):
        """ABN 应被检测。"""
        with pytest.raises(PiiLeakError, match="ABN"):
            assert_no_pii_leak("ABN: 51 824 753 556")

    def test_placeholder_whitelisted(self):
        """脱敏占位符不应误报。"""
        assert_no_pii_leak("PERSON_1 has AMOUNT_1 loan from CBA")

    def test_case_id_whitelisted(self):
        """案件号不应误报。"""
        assert_no_pii_leak("Case CASE-20240115001 updated")

    def test_date_whitelisted(self):
        """日期不应误报。"""
        assert_no_pii_leak("Settlement date: 2024-03-15")

    def test_scan_payload_recursive(self):
        """递归扫描 dict。"""
        with pytest.raises(PiiLeakError):
            scan_payload({
                "case_id": "CASE-001",
                "details": {"phone": "0412 345 678"},
            })

    def test_scan_payload_clean(self):
        """干净 payload 应通过。"""
        scan_payload({
            "case_id": "CASE-001",
            "stage": "pre_approval",
            "brief": "PERSON_1 的 CBA 贷款",
        })

    def test_bank_names_not_flagged(self):
        """银行名不应被误报。"""
        assert_no_pii_leak("CBA Westpac ANZ NAB")

    def test_amount_not_flagged(self):
        """金额不应被误报。"""
        assert_no_pii_leak("Loan amount: $850,000")
```

---

## Step 8：`tests/test_sync.py`

```python
"""同步模块测试。"""

import json
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import pytest

from core.sync.checkpoint import SyncCheckpoint


class TestSyncCheckpoint:
    """断点管理测试。"""

    def test_save_and_load(self, tmp_path):
        """保存后可加载。"""
        state_file = tmp_path / "sync_state.json"
        cp = SyncCheckpoint(state_file=state_file)
        now = datetime.now(timezone.utc)
        cp.save("cloud_push", now)

        cp2 = SyncCheckpoint(state_file=state_file)
        loaded = cp2.load("cloud_push")
        assert loaded is not None
        assert abs((loaded - now).total_seconds()) < 1

    def test_load_empty(self, tmp_path):
        """空状态返回 None。"""
        state_file = tmp_path / "sync_state.json"
        cp = SyncCheckpoint(state_file=state_file)
        assert cp.load("cloud_push") is None

    def test_multiple_types(self, tmp_path):
        """多种同步类型互不干扰。"""
        state_file = tmp_path / "sync_state.json"
        cp = SyncCheckpoint(state_file=state_file)
        t1 = datetime(2024, 1, 1, tzinfo=timezone.utc)
        t2 = datetime(2024, 6, 1, tzinfo=timezone.utc)
        cp.save("cloud_push", t1)
        cp.save("nas_sync", t2)
        assert cp.load("cloud_push") == t1
        assert cp.load("nas_sync") == t2

    def test_corrupt_file(self, tmp_path):
        """损坏的 JSON 不崩溃。"""
        state_file = tmp_path / "sync_state.json"
        state_file.write_text("{invalid json", encoding="utf-8")
        cp = SyncCheckpoint(state_file=state_file)
        assert cp.load("cloud_push") is None
```

---

## 验证步骤

### Step A：import 验证
```python
python -c "
import sys; sys.path.insert(0, '.')
from core.sync.cloud_push import push_case_summary, push_all_cases
from core.sync.nas_sync import sync_from_nas
from core.sync.checkpoint import SyncCheckpoint
from core.pii.leak_guard import assert_no_pii_leak, PiiLeakError, scan_payload
print('All WO-06 imports OK')
"
```

### Step B：leak guard 测试
```bash
python -m pytest tests/test_safety/test_leak_guard.py -v
```

### Step C：sync 测试
```bash
python -m pytest tests/test_sync.py -v
```

### Step D：文件行数
```bash
wc -l core/sync/*.py core/pii/leak_guard.py
# 每个应 ≤ 200 行
```

---

## 失败标准

- `push_case_summary()` 发送的 payload 包含未脱敏客户名 → **FAIL**（红线）
- `assert_no_pii_leak("0412345678")` 未抛异常 → **FAIL**（红线）
- `scan_payload` 不递归检查嵌套 dict → **FAIL**
- checkpoint 不持久化（重启后丢失） → **FAIL**
- supabase-py 不在 pyproject.toml → **FAIL**
- DDL 缺少 RLS 策略 → **FAIL**
- 任何文件 > 200 行 → **FAIL**

---

⚠️ 执行纪律：
1. 所有出站数据先过 `assert_no_pii_leak()` 或 `scan_payload()`
2. Supabase URL/Key 从环境变量读取，不硬编码
3. 同步失败不中断主进程（catch + log）
4. checkpoint 存在 `data/sync_state.json`
5. 测试不实际连 Supabase（mock httpx）
6. NAS 路径不可达时优雅跳过，不报错
