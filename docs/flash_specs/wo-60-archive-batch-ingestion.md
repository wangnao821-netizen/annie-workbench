# WO-60 历史案卷批量归档入库与放款事实解析 — 执行规范（OpenCode 执行）

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / `pathlib.Path`（禁止 `os.path.join`）
- 禁止：引入任何新的 pip 依赖
- 禁止：创建"改动范围"表以外的文件；禁止修改表以外任何文件
- 禁止：重构、重命名、移动任何既有文件/函数（除非本表明确要求）
- 禁止：访问/读取真实客户文件夹（`D:\EverStones_Test_Clients\...`），测试一律用 `tmp_path` 构造虚拟测试数据
- 所有路径操作必须 `pathlib.Path`，不硬编码分隔符
- 严格遵循安全纪律：测试隔离，不向测试目录外写文件

## 背景（为什么要做）

在澳洲贷款业务中，存量已放款客户案卷是经纪人长期尾佣与二次经营（转贷/降息/再置业）的核心资产池。
本单开启 **第二阶段（资产与知识系统）** 的第一批次：
1. **独立归档管道与入口**：建立独立于日常工作台的 `core/archive/ingestion.py` 归档扫描与批量入库管道；
2. **严格的高门槛准入制（Anti-Pollution Gate）**：
   - 优先接纳已放款结案（`Settled`）或具备明确终态反思的案卷；
   - 自动检测并拦截正在工作台中活跃推进的在途案卷（标明 `in_workbench`，防跨区冲突）；
   - 自动过滤草稿或未成型案卷，杜绝半成品污染资产库；
3. **放款与产品事实解析器（Settlement Truth Extractor）**：
   - 扫描交割单（`Settlement Statement.pdf`）、批复函（`Approval Letter`）、`Broker Notes`；
   - 提取放款交割日期（`settlement_date`）、最终获批利率（`interest_rate`）、贷款金额、机构与物业地址；
4. **批量归档入库**：
   - 写入 `Case` 表（标记 `stage="closed"`, `close_reason="settled"`, `is_imported=True`），并记录 `ImportRecord`；
   - 提供 `POST /api/archive/scan` 与 `POST /api/archive/batch-import` 端点。

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `core/archive/ingestion.py` | **新建** | 历史案卷归档扫描、准入过滤与放款事实解析（≤260 行） |
| `server/api/schemas.py` | 修改 | 文件末尾追加归档扫描与批量入库响应/请求模型 |
| `server/api/archive.py` | **新建** | 档案中心专属路由模块，挂载 `/api/archive`（≤90 行） |
| `server/main.py` | 修改 | 注册 `archive_router`（约 5 行） |
| `tests/test_api/test_archive_ingestion.py` | **新建** | 准入过滤、放款事实解析、冲突排重与 API 端点全量测试（≤220 行） |

⚠️ 严禁修改上表以外的任何文件。

---

## 接口契约（一字不改）

### 1. `core/archive/ingestion.py`
```python
from __future__ import annotations

import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from core.case_folder.topology import _count_files, parse_case_folder_name
from core.logger import get_logger
from core.models.orm import Case

logger = get_logger(__name__)

# 放款与交割关键词
_SETTLED_KEYWORDS = ("settled", "settlement", "completed", "放款", "已交割", "done")


def scan_archive_folder(folder_path: str, db: Session | None = None) -> dict[str, Any]:
    """扫描指定历史客户或总目录，执行准入过滤与放款事实提取。

    规则：
    1. 根目录不存在 ➔ 返回 {"ok": False, "message": "..."}；
    2. 枚举子目录，识别案卷（数字开头或已知机构）；若本身就是单案卷则直接处理；
    3. 准入与冲突检测：
       - 若该路径已在 Case 表且 stage != "closed"，标记 in_workbench = True, eligible = False;
       - 若已在 Case 表且 stage == "closed"，标记 already_archived = True, eligible = False;
       - 识别是否为已完结 (Settled/Withdrawn)：目录名或文件包含 settled/approval/statement 等；
    4. 提取放款事实：
       - 放款日期 settlement_date (默认当前或从文件名/交割单解析)；
       - 利率 interest_rate (从 Broker Notes 或目录名解析，如 "6.09");
    5. 返回结构化待归档案卷列表。
    """


def batch_import_archive_cases(items: list[dict[str, Any]], db: Session) -> dict[str, Any]:
    """批量将选定的历史完结案卷作为已结案资产归档入库。"""
```

### 2. `server/api/schemas.py`（追加到文件末尾）
```python
class ArchiveCaseItem(BaseModel):
    dir_name: str
    folder_path: str
    client_name: str
    lender: str | None = None
    loan_amount: float | None = None
    property_address: str | None = None
    settlement_date: str | None = None
    interest_rate: str | None = None
    status: str = "settled"  # settled / withdrawn
    eligible: bool = True
    in_workbench: bool = False
    already_archived: bool = False
    filter_reason: str | None = None
    file_count: int = 0


class ArchiveScanResponse(BaseModel):
    ok: bool
    message: str | None = None
    client_name: str | None = None
    total_found: int = 0
    eligible_count: int = 0
    cases: list[ArchiveCaseItem] = Field(default_factory=list)


class ArchiveBatchImportItem(BaseModel):
    folder_path: str
    client_name: str
    lender: str | None = None
    loan_amount: float | None = None
    property_address: str | None = None
    settlement_date: str | None = None
    interest_rate: str | None = None
    status: str = "settled"


class ArchiveBatchImportRequest(BaseModel):
    items: list[ArchiveBatchImportItem]


class ArchiveBatchImportResponse(BaseModel):
    ok: bool
    imported_count: int
    created_cases: list[dict] = Field(default_factory=list)
```

### 3. `server/api/archive.py`
```python
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core.archive.ingestion import batch_import_archive_cases, scan_archive_folder
from server.api.schemas import (
    ArchiveBatchImportRequest,
    ArchiveBatchImportResponse,
    ArchiveScanResponse,
    FolderTopologyScanRequest,
)
from server.deps import get_db

router = APIRouter(prefix="/api/archive", tags=["archive"])


@router.post("/scan", response_model=ArchiveScanResponse)
def scan_archive(
    req: FolderTopologyScanRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> ArchiveScanResponse:
    """扫描历史案卷目录，执行准入审查与放款事实提取。"""
    res = scan_archive_folder(req.folder_path, db=db)
    return ArchiveScanResponse(**res)


@router.post("/batch-import", response_model=ArchiveBatchImportResponse)
def import_archive_batch(
    req: ArchiveBatchImportRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> ArchiveBatchImportResponse:
    """批量将历史完结案卷归档入库。"""
    items_data = [item.model_dump() for item in req.items]
    res = batch_import_archive_cases(items_data, db=db)
    return ArchiveBatchImportResponse(**res)
```

### 4. `server/main.py` 注册路由
```python
from server.api.archive import router as archive_router
# 在 app.include_router 区域挂载:
app.include_router(archive_router)
```

---

## 自动化测试与门禁（`tests/test_api/test_archive_ingestion.py`）

1. `test_scan_archive_settled_detection`:
   - 验证包含 `Settled` 或交割单的案卷被识别为 `eligible = True`, `status = "settled"`, 正确提取放款事实。
2. `test_scan_archive_in_workbench_conflict_blocked`:
   - 在 DB 中预先插入一个 stage="gathering" 的进行中 Case；
   - 扫描该路径时，验证返回 `in_workbench = True`, `eligible = False`, `filter_reason` 明确提示在办。
3. `test_batch_import_archive_creates_closed_cases`:
   - 调用 `POST /api/archive/batch-import`；
   - 验证创建的 Case 其 `stage == "closed"`, `close_reason == "settled"`, `is_imported == True`。
4. `test_archive_api_endpoints`:
   - TestClient 验证 `/api/archive/scan` 与 `/api/archive/batch-import` 端点 200 响应。

---

## 验收检查命令
```powershell
$env:PYTHONPATH="D:\vera-workbench\.venv\Lib\site-packages"
$env:TESSDATA_PREFIX="C:\Users\Yaruo\AppData\Local\Temp\py311embed\tessdata"
python -m pytest tests/test_api/test_archive_ingestion.py -v
python -m ruff check core/archive/ingestion.py server/api/archive.py server/main.py server/api/schemas.py tests/test_api/test_archive_ingestion.py
```
- 测试 100% 通过（0 failed）
- ruff 检查 0 errors / 0 warnings
