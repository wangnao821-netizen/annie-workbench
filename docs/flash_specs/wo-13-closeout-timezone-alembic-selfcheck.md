# WO-13：V1 收口小单 — 统计时区 Sydney + Alembic URL 加固 + 双库启动自检

> 来源：CASE 大脑 V1 缺口收口 #17 / #20。执行方：opencode。检查方：Codex。

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / Alembic
- 禁止：引入任何新的 pip 依赖；禁止创建本表以外的文件或目录；禁止修改本表以外的文件
- 禁止：改动任何数据库迁移 revision（不新建/不修改 migrations/versions/）
- 允许使用：标准库 `zoneinfo`、`configparser`（均已随 Python 3.11 提供）
- 时区名一律用 IANA 名（`Australia/Sydney`），禁止用 UTC 偏移硬编码

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `core/analytics/bucketing.py` | 修改 | 全文件（约 73 行） |
| `config/settings.yaml` | 修改 | 末尾追加 analytics 段 |
| `alembic.ini`（项目根） | 修改 | L8 `sqlalchemy.url` |
| `core/alembic.ini` | 修改 | L8 `sqlalchemy.url` |
| `core/models/db.py` | 修改 | 新增 `_warn_on_dual_data_dirs`（建议放在 `init_sa_tables` 之前）+ `init_sa_tables` 内调用 |
| `tests/test_api/test_analytics.py` | 修改 | `TestBucketing` 类内更新 1 个用例 + 新增 2 个用例 |
| `tests/test_alembic.py` | 修改 | 文件末尾新增 2 个用例 |

⚠️ 严禁修改上表以外的任何文件（含 server/、core/ 其他模块、前端）。严禁重命名/移动/删除现有文件。

---

## 一、统计时区 → Australia/Sydney（#17）

### 接口契约（`core/analytics/bucketing.py`）

```python
import os
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

GRANULARITIES: tuple[str, ...] = ("day", "week", "month")
DEFAULT_BUCKETS: dict[str, int] = {"day": 14, "week": 8, "month": 6}

# 配置项：环境变量 ANALYTICS_TZ 可覆盖；settings.yaml analytics.timezone 为声明值
DEFAULT_ANALYTICS_TZ = os.environ.get("ANALYTICS_TZ", "Australia/Sydney")


def _to_local(dt: datetime, tz: str | None = None) -> datetime:
    """把 naive（按 UTC 解释）/aware 时间转换为目标时区的本地 naive 时间。

    Args:
        dt: 待转换时间；naive 视为 UTC（DB 存储约定 datetime.utcnow）。
        tz: IANA 时区名，默认取 DEFAULT_ANALYTICS_TZ。

    Returns:
        目标时区的本地 naive datetime（不带 tzinfo，供分桶/strftime 使用）。
    """
    tz_name = tz or DEFAULT_ANALYTICS_TZ
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(ZoneInfo(tz_name)).replace(tzinfo=None)
```

改动要求（把原 `_set_utc` 替换为 `_to_local`，并更新三处调用）：

1. `period_key(dt, granularity)`：第一行 `dt = _set_utc(dt)` → `dt = _to_local(dt)`；docstring"naive 时间按 UTC 处理"改为"naive 时间按 UTC 解释后转换到 ANALYTICS_TZ（默认 Australia/Sydney）"。
2. `_bucket_start(dt, granularity)`：第一行 `dt = _set_utc(dt)` → `dt = _to_local(dt)`；docstring"（UTC，日级午夜对齐）"改为"（本地时区，日级午夜对齐）"。
3. `buckets_since(granularity, n, now=None)`：`first = _bucket_start(_set_utc(now or datetime.now(UTC)), granularity)` → `first = _bucket_start(now or datetime.now(UTC), granularity)`。
   > ⚠️ 注意：**不要**在传给 `_bucket_start` 前预转换 `_to_local(...)`——`_bucket_start` 内部已做时区转换，预转换会造成"双重转换"（悉尼本地时间再被当 UTC 平移 +10h，跨到次日），导致 `test_buckets_since_uses_sydney_midnight` 失败。正确语义：`_bucket_start` 接收原始 now（naive 按 UTC 解释 / aware 直接转换），在本地时区上做午夜对齐。
4. 文件顶部 docstring"时间分桶助手 — 天 / 周 / 月分组（UTC）"改为"时间分桶助手 — 天 / 周 / 月分组（默认 Australia/Sydney，ANALYTICS_TZ 可覆盖）"。
5. `_shift` 与 `_bucket_start` 其余逻辑**零改动**（`_shift` 在本地 naive 时间上做日历运算，语义不变）。

### `config/settings.yaml` 追加（文件末尾）

```yaml
# 统计分析分桶时区（V1 收口 #17：Vera 在澳洲，天/周按澳洲日历日）
# 运行期生效值 = 环境变量 ANALYTICS_TZ（默认 Australia/Sydney），此处为声明值
analytics:
  timezone: "Australia/Sydney"
```

> 注意：`SettingsConfig`（pydantic）未定义 analytics 字段，多余 key 会被忽略，不会导致配置校验失败——此段仅为声明/文档用途，不改 `core/config.py`。

### 测试（`tests/test_api/test_analytics.py`）

更新 `TestBucketing::test_period_key_rules`：naive 输入现在按 UTC 解释再转 Sydney（AEST=UTC+10，8 月无夏令时），期望值改为：

```python
def test_period_key_rules(self):
    dt = datetime(2026, 8, 12, 15, 0, 0)  # naive → UTC → Sydney 2026-08-13 01:00
    assert period_key(dt, "day") == "2026-08-13"
    assert period_key(dt, "week") == "2026-W33"
    assert period_key(dt, "month") == "2026-08"
```

> 提交前用下面命令核对期望值，若与输出不符以实际输出为准并同步修改断言：
> `python -c "from datetime import datetime; from core.analytics.bucketing import period_key; print(period_key(datetime(2026,8,12,15,0),'day'), period_key(datetime(2026,8,12,15,0),'week'), period_key(datetime(2026,8,12,15,0),'month'))"`

`TestBucketing` 类内新增两个用例：

```python
def test_sydney_cross_day_boundary(self):
    # 悉尼 0 点 = UTC 前一日 14:00（AEST +10）——"今天"按澳洲日历日
    assert period_key(datetime(2026, 8, 12, 14, 0, tzinfo=UTC), "day") == "2026-08-13"
    assert period_key(datetime(2026, 8, 12, 13, 59, tzinfo=UTC), "day") == "2026-08-12"

def test_buckets_since_uses_sydney_midnight(self):
    # 悉尼 8/12 23:59 仍属 8/12；悉尼 8/13 00:00 属 8/13
    before = buckets_since("day", 1, now=datetime(2026, 8, 12, 13, 59, tzinfo=UTC))
    after = buckets_since("day", 1, now=datetime(2026, 8, 12, 14, 0, tzinfo=UTC))
    assert before[-1][2] == "2026-08-12"
    assert after[-1][2] == "2026-08-13"
```

失败标准：以上用例 + 全量 `pytest tests/test_api/test_analytics.py` 通过；`TestCrossPeriod` 等既有用例不得因时区改动失败（若失败先报告，不得擅自改断言范围）。

---

## 二、Alembic ini URL 加固（#20）

### 改动

| 文件 | 原值 | 新值 |
|------|------|------|
| `alembic.ini`（根） | `sqlalchemy.url = sqlite:///core/data/assistant.db` | `sqlalchemy.url = sqlite:///%(here)s/core/data/assistant.db` |
| `core/alembic.ini` | `sqlalchemy.url = sqlite:///data/assistant.db` | `sqlalchemy.url = sqlite:///%(here)s/data/assistant.db` |

> 目的：URL 不再依赖 CWD。`%(here)s` 由 Alembic 展开为 ini 所在目录：根 ini → 项目根 → `core/data/assistant.db`；core ini → `core/` → `core/data/assistant.db`。两处最终都指向唯一真源 `core/data/assistant.db`。

### 测试（`tests/test_alembic.py` 末尾新增）

```python
def test_alembic_ini_urls_resolve_to_core_db():
    import configparser

    def url(p: Path) -> str:
        cp = configparser.ConfigParser(
            interpolation=configparser.BasicInterpolation(),
            defaults={"here": str(p.parent)},
        )
        cp.read(p, encoding="utf-8")
        return cp.get("alembic", "sqlalchemy.url").replace("\\", "/")

    assert url(PROJECT_ROOT / "alembic.ini").endswith("core/data/assistant.db")
    assert url(PROJECT_ROOT / "core" / "alembic.ini").endswith("core/data/assistant.db")
```

失败标准：以上用例通过；`test_alembic_env_binds_core_orm_metadata` 等既有用例不回归。

---

## 三、双库启动自检（#20）

### 接口契约（`core/models/db.py`，新增在 `init_sa_tables` 之前）

```python
def _warn_on_dual_data_dirs(db_path: Path, legacy_path: Path | None = None) -> None:
    """启动自检：检测另一 data 目录的遗留库，防止读错库（#20）。

    仅当生效库为默认库（core/data/assistant.db）时检查；测试/显式 override
    路径跳过，避免误报。发现遗留库（非空）→ logger.warning，不阻断启动。

    Args:
        db_path: 已解析的生效数据库路径。
        legacy_path: 遗留库候选路径，默认 PROJECT_ROOT.parent/data/assistant.db。
    """
    if db_path != DB_PATH:
        return
    legacy = legacy_path or (PROJECT_ROOT.parent / "data" / "assistant.db")
    try:
        if legacy.exists() and legacy.stat().st_size > 0:
            logger.warning(
                "检测到遗留数据库 %s（%s 字节）；当前使用 %s。"
                "如确认无用，请归档到 core/data/backups/legacy/",
                legacy,
                legacy.stat().st_size,
                DB_PATH,
            )
    except OSError:
        logger.warning("无法检查遗留数据库路径 %s", legacy)
```

`init_sa_tables` 内，在 `db_path = _effective_db_path(db_path)` 之后、`if _alembic_running:` 之前插入一行调用：

```python
    _warn_on_dual_data_dirs(db_path)
```

### 测试（`tests/test_alembic.py` 末尾新增）

```python
def test_dual_data_dir_warning_when_legacy_exists(tmp_path, caplog):
    from core.models.db import DB_PATH, _warn_on_dual_data_dirs

    legacy = tmp_path / "legacy.db"
    legacy.write_bytes(b"x" * 128)
    with caplog.at_level("WARNING", logger="core.models.db"):
        _warn_on_dual_data_dirs(DB_PATH, legacy_path=legacy)
    assert any("遗留数据库" in r.message for r in caplog.records)


def test_dual_data_dir_no_warning_on_override_path(tmp_path, caplog):
    from core.models.db import _warn_on_dual_data_dirs

    legacy = tmp_path / "legacy.db"
    legacy.write_bytes(b"x" * 128)
    with caplog.at_level("WARNING", logger="core.models.db"):
        _warn_on_dual_data_dirs(tmp_path / "other.db", legacy_path=legacy)
    assert not any("遗留数据库" in r.message for r in caplog.records)
```

失败标准：以上用例通过；`test_legacy_db_no_alembic_version_stamp_and_upgrade` 等既有用例不回归。

---

## 验收标准（全量门禁）

### 自动验证（必须全部通过）

```bash
python -m pytest tests/test_api/test_analytics.py tests/test_alembic.py -v   # 专项
python -m pytest tests/ -q                                                   # 全量（基线 450 passed，不得出现回归）
ruff check core/analytics/bucketing.py core/models/db.py tests/test_api/test_analytics.py tests/test_alembic.py
```

### 手动验证
1. `python -c "from core.analytics.bucketing import period_key; from datetime import datetime, UTC; print(period_key(datetime(2026,8,12,14,0,tzinfo=UTC),'day'))"` → 输出 `2026-08-13`
2. `cd D:\vera-workbench && .venv\Scripts\python.exe -m alembic current` → 显示 head revision `f49cf1c11b02` 且连接库为 `core/data/assistant.db`（无报错）
3. 确认根 `data/` 下不再有 `assistant.db`（已于收口时归档），启动后端不再出现双库警告

---

⚠️ 执行纪律（每一条都必须遵守）：
1. 只修改"改动范围"表中列出的 7 个文件，绝不碰其他文件
2. 所有函数名/变量名/断言值严格按照"接口契约"定义，一个字符都不能改
3. 每完成一个 Step（一/二/三）立即运行该节验证命令
4. 如果验证失败，停下来报告错误内容，不要自己尝试修复计划外的代码
5. 不要引入任何"技术约束"中未列出的依赖库
6. 不要创建改动范围表中未列出的新文件（含不新建测试文件）
7. 不要重构、优化、美化任何计划外的代码
