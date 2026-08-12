# 施工单 10：基础设施优化 + 调度

> 执行者：DeepSeek  
> 依赖：WO-01+02 完成  
> 预估：1.5 天

---

## 技术约束

- 新增文件放 `core/scheduler/`、`core/pipeline/`
- Python 文件行数 ≤ 200
- 新依赖：`apscheduler>=3.10`（已在 pyproject.toml）
- 不引入 Redis / Celery / 其他重依赖
- SQLite 备份不能锁死主进程

---

## 目标

1. APScheduler 集成（定时任务注册中心）
2. SQLite 自动备份（每日，保留 7 天）
3. PII 优化：金额不脱敏
4. Pipeline 优化：OCR 阈值 50→100、HEIC 支持
5. 两阶段分类
6. 统一 `ingest_file()` 入口
7. EXPECTED_FIELDS 外置 YAML

---

## 改动范围

| 文件 | 操作 | 说明 |
|------|------|------|
| `core/scheduler/__init__.py` | 已有 | — |
| `core/scheduler/jobs.py` | 新建 | APScheduler 任务注册 |
| `core/scheduler/backup.py` | 新建 | SQLite 备份 |
| `core/pii/gateway.py` | 修改 | 金额不脱敏（移除 AMOUNT regex） |
| `core/pipeline/parser.py` | 修改 | OCR 阈值 100 + HEIC |
| `core/pipeline/classifier.py` | 修改 | 两阶段分类 |
| `core/pipeline/ingest.py` | 新建 | 统一入口 |
| `config/expected_fields.yaml` | 新建 | 外置字段定义 |
| `tests/test_scheduler.py` | 新建 | 调度测试 |
| `tests/test_pii_amount.py` | 新建 | 金额保留测试 |

---

## 接口契约

### scheduler/jobs.py

```python
from apscheduler.schedulers.background import BackgroundScheduler

_scheduler: BackgroundScheduler | None = None

def init_scheduler() -> BackgroundScheduler:
    """初始化并返回全局调度器。

    注册的定时任务：
    - SQLite 备份：每日 03:00
    - 委派超期检查：每 30 分钟
    - NAS 同步：每 5 分钟（WO-06）
    - 摘要刷新：每小时
    """
    ...

def get_scheduler() -> BackgroundScheduler:
    """获取已初始化的调度器单例。"""
    ...
```

### scheduler/backup.py

```python
def backup_database(
    db_path: Path | None = None,
    backup_dir: Path | None = None,
    keep_days: int = 7,
) -> Path:
    """SQLite 在线备份（不锁主进程）。

    Returns:
        备份文件路径 data/backups/assistant_YYYYMMDD_HHMMSS.db
    """
    ...
```

### pipeline/ingest.py

```python
def ingest_file(
    file_path: Path,
    case_id: str,
    db: Session,
    source: str = "watcher",  # watcher/manual/email
) -> CaseFile:
    """统一文件入口：解析 → 分类 → 提取 → 清单匹配 → 存储。

    取代分散在 watcher/onboarding/processing_center 的入库逻辑。
    """
    ...
```

### PII 金额不脱敏规则

```python
# core/pii/gateway.py 中 desensitize 修改：
# 金额（$xxx,xxx.xx / AUD xxx / xxx万）保留原值不替换
# 银行名/机构名保留（已有）
# 日期保留（已有）
```

---

## 验证步骤

### Step 1：调度器启动
```python
python -c "
from core.scheduler.jobs import init_scheduler
s = init_scheduler()
jobs = s.get_jobs()
assert len(jobs) >= 3, f'Expected 3+ jobs, got {len(jobs)}'
print(f'Scheduler: {len(jobs)} jobs registered')
s.shutdown()
"
```

### Step 2：备份
```python
python -c "
from core.scheduler.backup import backup_database
from pathlib import Path
p = backup_database()
assert p.exists() and p.stat().st_size > 0
print(f'Backup OK: {p}')
"
```

### Step 3：金额保留
```python
python -c "
from core.pii.gateway import desensitize
result = desensitize('Loan amount is \$850,000 from CBA', 'test_case', None)
assert '850,000' in result or '850000' in result
print(f'Amount preserved: {result}')
"
```

### Step 4：测试
```bash
python -m pytest tests/test_scheduler.py tests/test_pii_amount.py -v
```

---

## 失败标准

- APScheduler 启动报错 → **FAIL**
- 注册任务 < 3 个 → **FAIL**
- 备份文件大小为 0 → **FAIL**
- `desensitize("$850,000")` 后 850000 消失 → **FAIL**
- HEIC 文件传入 parser 报 UnsupportedFormat → **FAIL**
- `ingest_file()` 对 .pdf 未触发分类 → **FAIL**
- 任何文件 > 200 行 → **FAIL**

---

⚠️ 执行纪律：
1. 备份使用 `sqlite3.backup()` API，不用文件复制
2. 金额 regex 修改只影响 desensitize，不影响 rehydrate
3. HEIC 处理：先尝试 `pillow-heif`，不可用则跳过并标记
4. 两阶段分类：先 regex 快速判断，低置信度再走 AI
5. `expected_fields.yaml` 格式必须与 `document_types.yaml` 对齐
