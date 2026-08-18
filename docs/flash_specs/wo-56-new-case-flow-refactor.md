# WO-56 新建案件全景重构 — 执行规范（OpenCode 执行）

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / `pathlib.Path`（禁止 `os.path.join`）
- 禁止：引入任何新的 pip 依赖
- 禁止：创建"改动范围"表以外的文件；禁止修改表以外任何文件
- 禁止：重构、重命名、移动任何既有文件/函数（除非本表明确要求）
- 禁止：访问/读取真实客户文件夹（`D:\EverStones_Test_Clients\...`），测试一律用 `tmp_path` 构造虚拟测试数据
- 所有路径操作必须 `pathlib.Path`，不硬编码分隔符
- 严格遵循安全纪律：测试隔离，不向测试目录外写文件

## 背景（为什么要做）

经过前序批次（WO-53 ~ WO-55）的建设，系统已具备了完整的多案卷拓扑识别、标题快速匹配打勾与邮件时序抽取能力。
现在需要对建档顶层流程进行**全景收口与现代化重构**：
1. **明确入口权重**：将日常 365 天高频使用的 **「全新空白建案」** 确立为第一默认主入口；
2. **标准本地目录脚手架（Directory Scaffolding）**：当用户创建全新案件并选定父级存放目录（如 `D:\EverStones_Clients`）时，系统自动在本地硬盘上创建规范命名的案件目录（如 `D:\EverStones_Clients\{客户名}\{1. 贷款类型 - 机构 - 地址}\`）及其标准的 11 个子文件夹（`Send to Lender`、`Approval`、`Valuation`、`To be signed` 等），并自动绑定为 `Case.folder_path`；
3. **存量在途自适应导入**：将存量导入作为次级快捷通道，直接复用已验证的 `scan_customer_topology` 与 `batch_topology_import`，自适应提取最高完整度；
4. **彻底废除“三种录入粒度”** 等过时的妥协设计。

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `core/case_engine/folder.py` | 修改 | 完善标准 11 目录脚手架创建逻辑 `scaffold_case_directories`（约 30 行） |
| `server/api/schemas.py` | 修改 | 文件末尾追加 `CaseScaffoldRequest` 与 `CaseScaffoldResponse` |
| `server/api/cases.py` | 修改 | 文件末尾追加 `POST /api/cases/scaffold` 脚手架目录预创建/校验端点（约 25 行） |
| `tests/test_api/test_case_scaffold.py` | **新建** | 脚手架目录创建、标准 11 子目录校验与端点全量测试（≤180 行） |

⚠️ 严禁修改上表以外的任何文件。

---

## 接口契约（一字不改）

### 1. `core/case_engine/folder.py` 标准 11 子目录定义
```python
STANDARD_CASE_SUBDIRS = (
    "Send to Lender",
    "Approval",
    "Valuation",
    "To be signed",
    "Supporting Documents",
    "Application Summary",
    "Bank Statements",
    "Identification",
    "Income & Employment",
    "Liabilities",
    "Communications",
)


def scaffold_case_directories(
    parent_path: str,
    client_name: str,
    case_name: str | None = None,
    create_subdirs: bool = True,
) -> dict[str, Any]:
    """在指定的父目录下生成规范的客户与案件文件夹，并按需创建标准 11 子目录。

    目录规则：
    1. 客户根目录: {parent_path}/{client_name}
    2. 案卷目录: {parent_path}/{client_name}/{case_name or '1. Initial Submission'}
    3. 在案卷目录下创建 STANDARD_CASE_SUBDIRS 所有子文件夹；
    4. 返回 {"ok": True, "client_folder": str, "case_folder": str, "created_subdirs": list[str]}。
    """
```

### 2. `server/api/schemas.py`（追加到文件末尾）
```python
class CaseScaffoldRequest(BaseModel):
    parent_path: str
    client_name: str
    case_name: str | None = None
    create_subdirs: bool = True


class CaseScaffoldResponse(BaseModel):
    ok: bool
    client_folder: str
    case_folder: str
    created_subdirs: list[str] = Field(default_factory=list)
    message: str | None = None
```

### 3. `server/api/cases.py`（追加到文件末尾）
```python
from core.case_engine.folder import scaffold_case_directories
from server.api.schemas import CaseScaffoldRequest, CaseScaffoldResponse


@router.post("/scaffold", response_model=CaseScaffoldResponse)
def scaffold_case_folder(
    req: CaseScaffoldRequest,
) -> CaseScaffoldResponse:
    """在选定父目录下预创建标准客户/案卷目录骨架（含 11 个标准子文件夹）。"""
    try:
        res = scaffold_case_directories(
            parent_path=req.parent_path,
            client_name=req.client_name,
            case_name=req.case_name,
            create_subdirs=req.create_subdirs,
        )
        return CaseScaffoldResponse(**res)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"创建目录骨架失败: {exc}")
```

---

## 自动化测试与门禁（`tests/test_api/test_case_scaffold.py`）

1. `test_scaffold_case_directories_creates_all_subdirs`:
   - 在 `tmp_path` 下调用 `scaffold_case_directories`；
   - 验证客户根目录、案卷目录及 11 个子文件夹全部在硬盘上物理创建成功。
2. `test_scaffold_endpoint_success`:
   - TestClient 调用 `POST /api/cases/scaffold` 验证 HTTP 200 及返回结构。
3. `test_scaffold_endpoint_invalid_parent`:
   - 传入不可写或非法路径，验证异常安全捕获并返回 400。

---

## 验收检查命令
```powershell
$env:PYTHONPATH="D:\vera-workbench\.venv\Lib\site-packages"
$env:TESSDATA_PREFIX="C:\Users\Yaruo\AppData\Local\Temp\py311embed\tessdata"
python -m pytest tests/test_api/test_case_scaffold.py -v
python -m ruff check core/case_engine/folder.py server/api/cases.py server/api/schemas.py tests/test_api/test_case_scaffold.py
```
- 测试 100% 通过（0 failed）
- ruff 检查 0 errors / 0 warnings
