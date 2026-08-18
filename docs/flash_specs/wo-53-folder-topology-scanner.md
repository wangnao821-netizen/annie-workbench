# WO-53 目录拓扑与多案卷智能识别 — 执行规范（OpenCode 执行）

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / `pathlib.Path`（禁止 `os.path.join`）
- 禁止：引入任何新的 pip 依赖
- 禁止：创建"改动范围"表以外的文件；禁止修改表以外任何文件
- 禁止：重构、重命名、移动任何既有文件/函数（除非本表明确要求）
- 禁止：访问/读取真实客户文件夹（`D:\EverStones_Test_Clients\...`），测试一律用 `tmp_path` 造虚拟目录树
- 所有路径操作必须 `pathlib.Path`，不硬编码分隔符
- 严格遵循 PII 与安全红线：不写客户文件夹，测试数据与路径必须临时隔离

## 背景（为什么要做）

在澳洲真实信贷业务中，客户文件夹（如 `D:\...\Yingkun CHEN`）代表借款主体，其下包含 1~N 个带序号的子文件夹（如 `1. Refinance...`、`8. Refi & cash - ORDE小号 - 84 Louis St (Alt doc) - onhold due to poor val`），分别对应不同的交易案卷或重递轮次。
现有存量导入（WO-50）只能对单级平铺目录做简单预览，无法识别客户主体名下的多案卷拓扑，也无法解析出目录名中蕴含的房产地址、Lender 机构、业务类型、以及 `Withdrawn` / `onhold due to poor val` 等关键状态标签。

本单目标：
1. 实现 **客户目录拓扑扫描器（Topology Scanner）**：自动提取客户姓名，递归识别所有案卷子目录；
2. 实现 **案卷目录名语义解析器**：通过正则与规则提取序号、房产地址、目标机构、方案类型（Alt Doc / Lite Doc 等）、显式状态（withdrawn / onhold）及卡点原因；
3. 实现 **活跃案卷推荐与分组**：按房产地址聚合，按序号与活跃度排序，推荐最新主案卷；
4. 提供 `POST /api/cases/folder-topology/scan` 与 `POST /api/cases/topology-import/batch` 端点。

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `core/case_folder/topology.py` | **新建** | 核心拓扑扫描与目录名语义解析（≤260 行） |
| `server/api/schemas.py` | 修改 | 文件末尾追加拓扑扫描与批量导入请求/响应模型 |
| `server/api/cases.py` | 修改 | 文件末尾追加 2 个 API 端点 |
| `tests/test_api/test_folder_topology.py` | **新建** | 拓扑解析与端点全量单元测试（≤220 行） |

⚠️ 严禁修改上表以外的任何文件。

---

## 接口契约（一字不改）

### 1. `core/case_folder/topology.py`
```python
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from core.case_folder.legacy_import import find_broker_notes
from core.facts.prefill import build_prefill_from_text
from core.pipeline.parser import parse_file

# 忽略的文件列表
_IGNORED_FILES = frozenset({".DS_Store", "Thumbs.db", "desktop.ini", "processed_ids.txt"})

# 常见机构关键字
KNOWN_LENDERS = (
    "ORDE", "Zank Financial", "Zank", "Brighten", "Latrobe", "La Trobe",
    "CBA", "ANZ", "Westpac", "NAB", "Macquarie", "St George", "Bankwest",
    "Suncorp", "Pepper", "Liberty", "RedZed", "Resimac", "Firstmac"
)

# 方案类型关键字
DOC_TYPES = ("Alt Doc", "Alt doc", "Lite Doc", "Lite doc", "Full Doc", "Full doc", "Low Doc")


def parse_case_folder_name(dir_name: str) -> dict[str, Any]:
    """解析单个案卷子目录名称的语义元数据。

    示例输入：
    "8. Refi & cash - ORDE小号 - 84 Louis St (Alt doc) - onhold due to poor val"
    "2. Resub - Refinance & cash out - Zank Financial - 84 Louis Street, Granville NSW 2142 - Withdrawn"
    "5. Resub - Refinance & cash out - Brighten - 84 Louis St (Alt Doc) - Val Fees Not Paid"

    返回字典结构：
    {
      "sequence": int | None,          # 8
      "is_resub": bool,                # False / True (是否有 Resub / 重递)
      "loan_type": str,                # "Refinance & cash out" / "Purchase" / "Commercial" 等
      "lender": str | None,            # "ORDE" / "Zank Financial" 等
      "property_address": str | None,  # "84 Louis St" / "84 Louis Street, Granville NSW 2142"
      "doc_type": str | None,          # "Alt Doc" / "Lite Doc" / "Full Doc"
      "status": str,                   # "active" / "withdrawn" / "onhold" / "submitted"
      "onhold_reason": str | None,     # "估价过低阻断" / "估价费未支付" / "利益冲突" / 原始文字
    }
    """


def scan_customer_topology(folder_path: str, db: Session | None = None) -> dict[str, Any]:
    """扫描客户根目录，发现所有案卷子目录并返回结构化拓扑信息。

    规则：
    1. 根目录不存在 ➔ 返回 {"ok": False, "message": "..."}
    2. 客户姓名 client_name 取根目录名称（如 "Yingkun CHEN"）。
    3. 枚举根目录下所有子目录：
       - 若子目录名以数字序号开头（如 "1. ...", "8. ..."）或包含已知机构名，判定为案卷子目录；
       - 统计子目录内有效文件数（递归忽略 _IGNORED_FILES）；
       - 检查是否存在 Broker Notes（find_broker_notes）；若有且传入 db，提取 prefilled 画像；
       - 识别最新活跃推荐案卷：排除 status == "withdrawn" 的案卷，按 sequence 倒序、文件数倒序，排在第一的标记 is_recommended_active = True。
    4. 若根目录下没有发现案卷子目录（即本身就是单案卷目录），将当前目录作为唯一案卷返回。
    """
```

### 2. `server/api/schemas.py`（追加到文件末尾）
```python
class FolderTopologyScanRequest(BaseModel):
    folder_path: str


class CaseSubfolderMeta(BaseModel):
    dir_name: str
    folder_path: str
    sequence: int | None = None
    is_resub: bool = False
    loan_type: str = "Refinance"
    lender: str | None = None
    property_address: str | None = None
    doc_type: str | None = None
    status: str = "active"  # active / withdrawn / onhold / submitted
    onhold_reason: str | None = None
    is_recommended_active: bool = False
    has_broker_notes: bool = False
    broker_notes_name: str | None = None
    file_count: int = 0
    prefilled: dict = Field(default_factory=dict)
    submitted_platforms: list[str] = Field(default_factory=list)


class FolderTopologyScanResponse(BaseModel):
    ok: bool
    message: str | None = None
    client_name: str | None = None
    client_root: str | None = None
    cases: list[CaseSubfolderMeta] = Field(default_factory=list)


class BatchTopologyImportItem(BaseModel):
    folder_path: str
    client_name: str
    lender: str | None = None
    loan_amount: float | None = None
    property_address: str | None = None
    stage: str = "gathering"
    is_imported: bool = True
    platform_submissions: list[str] = Field(default_factory=list)


class BatchTopologyImportRequest(BaseModel):
    items: list[BatchTopologyImportItem]


class BatchTopologyImportResponse(BaseModel):
    ok: bool
    created_cases: list[dict] = Field(default_factory=list)
```

### 3. `server/api/cases.py`（追加到文件末尾）
```python
from core.case_folder.topology import scan_customer_topology
from server.api.schemas import (
    BatchTopologyImportRequest,
    BatchTopologyImportResponse,
    FolderTopologyScanRequest,
    FolderTopologyScanResponse,
)


@router.post("/folder-topology/scan", response_model=FolderTopologyScanResponse)
def scan_folder_topology(
    req: FolderTopologyScanRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> FolderTopologyScanResponse:
    """扫描客户目录拓扑结构与多案卷元数据（只读）。"""
    res = scan_customer_topology(req.folder_path, db=db)
    return FolderTopologyScanResponse(**res)


@router.post("/topology-import/batch", response_model=BatchTopologyImportResponse)
def batch_topology_import(
    req: BatchTopologyImportRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> BatchTopologyImportResponse:
    """批量从识别出的拓扑案卷中建档。"""
```

---

## 实施细节

### 1. `core/case_folder/topology.py` 的解析规则实现细节
- 序号正则：`r"^\s*(\d+)[\.\s、_-]"` 提取 `sequence`
- 重递检测：`r"resub|重递|转成"` 匹配 `is_resub = True`
- 状态检测：
  - `withdrawn` / `撤回` ➔ `status = "withdrawn"`
  - `onhold` / `on-hold` / `暂停` / `fees not paid` / `poor val` / `conflict` ➔ `status = "onhold"`
  - 提取 `onhold_reason`：
    - 匹配 `poor val` ➔ `"估价过低阻断，进入复议"`
    - 匹配 `fees not paid` / `fee not paid` ➔ `"估价费未支付"`
    - 匹配 `conflict` ➔ `"利益冲突/政策合规阻断"`
    - 匹配 `unacceptable` ➔ `"物业评估不合规"`
- 机构提取：遍历 `KNOWN_LENDERS` 进行不区分大小写前缀/单词匹配
- 地址提取：匹配包含 `Street|St|Road|Rd|Avenue|Ave|Parade|Pde|Drive|Dr|Highway|Hwy|Boulevard|Blvd|Court|Ct|Place|Pl|Crescent|Cres|Lane|Ln|Granville|Parramatta|Sydney|NSW|VIC|QLD` 或数字开头的片段

### 2. `server/api/cases.py` 中的 `batch_topology_import`
- 遍历 `req.items`：
- 调用 `core.case_creation.create_case_from_source`：
  - `client_name = item.client_name`
  - `lender = item.lender`
  - `folder_path = item.folder_path`
  - `is_imported = True`
  - `platform_submissions = item.platform_submissions`
- 记录导入历史并返回创建好的 `case_id` 列表。

---

## 自动化测试与门禁（`tests/test_api/test_folder_topology.py`）

1. `test_parse_case_folder_name_varieties`:
   - 测试各类真实目录名的解析（ORDE onhold due to poor val、Zank Withdrawn、Brighten Val Fees Not Paid 等）。
2. `test_scan_customer_topology_multi_cases`:
   - 在 `tmp_path` 下创建模拟 `Yingkun CHEN`（含 1~8 号子目录、部分含 Broker Notes、部分含 Send to Lender）；
   - 验证返回的 `client_name == "Yingkun CHEN"`，`cases` 数量与元数据正确，`is_recommended_active` 准确锁定 8 号案卷。
3. `test_scan_customer_topology_single_folder_fallback`:
   - 在 `tmp_path` 下创建单案卷目录，验证平退机制正常。
4. `test_batch_topology_import_endpoint`:
   - 调用 `POST /api/cases/topology-import/batch` 成功创建案件，并验证数据库 `Case.is_imported == True` 及平台事件记录。

---

## 验收检查命令
```powershell
$env:PYTHONPATH="D:\vera-workbench\.venv\Lib\site-packages"
$env:TESSDATA_PREFIX="C:\Users\Yaruo\AppData\Local\Temp\py311embed\tessdata"
python -m pytest tests/test_api/test_folder_topology.py -v
python -m ruff check core/case_folder/topology.py server/api/cases.py server/api/schemas.py tests/test_api/test_folder_topology.py
```
- 测试 100% 通过（0 failed）
- ruff 检查 0 errors / 0 warnings
