# WO-54 标题快速匹配与清单自动打勾 — 执行规范（OpenCode 执行）

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / `pathlib.Path`（禁止 `os.path.join`）
- 禁止：引入任何新的 pip 依赖
- 禁止：创建"改动范围"表以外的文件；禁止修改表以外任何文件
- 禁止：重构、重命名、移动任何既有文件/函数（除非本表明确要求）
- 禁止：访问/读取真实客户文件夹（`D:\EverStones_Test_Clients\...`），测试一律用 `tmp_path` 造虚拟目录树
- 所有路径操作必须 `pathlib.Path`，不硬编码分隔符
- 严格遵循安全纪律：测试隔离，不向测试目录外写文件

## 背景（为什么要做）

在真实信贷业务中，客户案卷文件夹（例如 `8. Refi & cash - ORDE小号...`）中通常已经存放了数十个关键证明文件（如 `ID DL.pdf`、`ID Passport.pdf`、`ID Visa 155.pdf`、`Rate Notice - 84 Louis St...`、`Liability HL Zank...`、`SE Declaration.pdf`、`Credit_Check_Client_Consent.pdf`、`Property Val - ORDE.pdf` 等）。
目前系统在新建案件或存量导入后，材料清单（Checklist）项的状态全为 `pending`（待收集），需要用户手动逐项核对打勾，耗时且体验割裂。

本单目标：
1. 实现 **基于别名规则库的极速标题匹配引擎（Checklist Title Matcher）**：秒级遍历案卷文件夹（聚焦 `Send to Lender/`、`To be signed/`、`Valuation/` 等目录及根目录），通过标题别名快速与清单项（`master_id` / `item_name`）进行语义对齐；
2. 命中后自动将文件登记进 `processed_files`（`CaseFile`），将清单项置为 `status = "received"`，并将 `file_id` 填入 `received_file_id` 与 `received_file_ids`；
3. 自动计算并刷新案件材料收集进度（`Case.gathering_progress`）；
4. 在建案流（`core/case_creation.py`）中无缝联动：若提供了 `folder_path`，清单生成后自动触发一次材料匹配；
5. 提供显式重试端点：`POST /api/cases/{case_id}/checklist/match-files`。

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `core/checklist/matcher.py` | **新建** | 别名规则库、标题匹配算法与清单打勾核心逻辑（≤240 行） |
| `core/case_creation.py` | 修改 | `create_case_from_source` 中清单生成后触发匹配（约 10 行） |
| `server/api/schemas.py` | 修改 | 文件末尾追加匹配响应模型 `ChecklistMatchFilesResponse` |
| `server/api/cases.py` | 修改 | 文件末尾追加 1 个 API 端点（`POST /{case_id}/checklist/match-files`） |
| `tests/test_api/test_checklist_matcher.py` | **新建** | 标题匹配、打勾、多文件绑定与进度刷新全量测试（≤220 行） |

⚠️ 严禁修改上表以外的任何文件。

---

## 接口契约（一字不改）

### 1. `core/checklist/matcher.py`
```python
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from core.models.orm import Case, CaseChecklist, CaseFile

# 忽略的文件列表
_IGNORED_FILES = frozenset({".DS_Store", "Thumbs.db", "desktop.ini", "processed_ids.txt"})

# 核心材料别名映射规则库（key: master_id 语义标识，values: 文件名关键词列表）
CHECKLIST_ALIAS_MAP: dict[str, list[str]] = {
    # 身份类
    "driver_licence": ["dl", "driver license", "driver licence", "驾照", "id dl"],
    "passport": ["passport", "护照", "id passport"],
    "visa_vevo": ["visa", "vevo", "155", "189", "190", "500", "820", "801", "签证", "id visa"],
    "voi": ["voi", "id voi", "verification of identity"],
    "credit_consent": ["credit_check", "client_consent", "privacy consent", "征信授权"],
    "identification": ["identification", "id summary", "身份证明"],
    # 房产与负债类
    "council_rates": ["rate notice", "rates notice", "council rate", "地税", "市政费", "rates"],
    "home_loan_statement": ["liability hl", "loan statement", "mortgage statement", "hl 流水", "房贷流水", "home loan"],
    "credit_card_statement": ["credit card", "cc statement", "信用卡流水", "cba credit"],
    # 自雇与收入类
    "se_declaration": ["se declaration", "self certified", "income declaration", "自雇声明", "self cert"],
    "accountant_letter": ["accountant", "cpa letter", "会计信", "会计师声明", "accountant declaration"],
    "company_search": ["company search", "asic search", "abn lookup", "公司查册"],
    # 估价与建议书
    "valuation_report": ["property val", "valuation report", "估价报告", "property valuation"],
    "soca": ["soca", "credit advice", "statement of credit advice"],
    "product_comparison": ["product comparison", "products comparison", "产品对比"],
    "application_form": ["application form", "loan submission pack", "application summary", "申请表"],
}


def match_checklist_files_for_case(case_id: str, db: Session) -> dict[str, Any]:
    """对指定案件的文件夹执行标题快速匹配并自动打勾。

    执行流程：
    1. 查询 Case 实例，若无 folder_path 或目录不存在，返回 {"matched_count": 0, "items": []}；
    2. 查询该案件名下的所有 CaseChecklist 项；
    3. 遍历 folder_path 及其子目录（优先按 Send to Lender / To be signed / Valuation / 根目录排序）：
       - 忽略 _IGNORED_FILES 及文件夹；
       - 生成/查询 CaseFile（按 case_id + nas_path 唯一性，避免重复插入）；
       - 文件名转小写后与 CHECKLIST_ALIAS_MAP 匹配；
       - 与 CaseChecklist 的 master_id 或 item_name（小写别名）进行语义对齐；
    4. 命中匹配项：
       - checklist_item.status = "received"
       - checklist_item.received_file_id = file.id
       - checklist_item.received_file_ids 列表中若无该 file.id 则 append
    5. 计算收集进度：
       - total_req = 必选项总数
       - received_req = 已收到的必选项数
       - case.gathering_progress = int((received_req / total_req) * 100) if total_req > 0 else 0
    6. db.commit() 并返回匹配详情。
    """
```

### 2. `server/api/schemas.py`（追加到文件末尾）
```python
class ChecklistMatchedFileDetail(BaseModel):
    checklist_id: int
    item_name: str
    master_id: str | None = None
    status: str
    matched_file_id: str
    matched_file_name: str


class ChecklistMatchFilesResponse(BaseModel):
    ok: bool
    case_id: str
    matched_count: int
    gathering_progress: int
    matched_details: list[ChecklistMatchedFileDetail] = Field(default_factory=list)
```

### 3. `server/api/cases.py`（追加到文件末尾）
```python
from core.checklist.matcher import match_checklist_files_for_case
from server.api.schemas import ChecklistMatchFilesResponse


@router.post("/{case_id}/checklist/match-files", response_model=ChecklistMatchFilesResponse)
def match_case_checklist_files(
    case_id: str,
    db: Session = Depends(get_db),  # noqa: B008
) -> ChecklistMatchFilesResponse:
    """重新扫描案件关联文件夹，按文件标题快速匹配并自动勾选材料清单。"""
    res = match_checklist_files_for_case(case_id, db)
    return ChecklistMatchFilesResponse(
        ok=True,
        case_id=case_id,
        matched_count=res["matched_count"],
        gathering_progress=res.get("gathering_progress", 0),
        matched_details=res.get("items", []),
    )
```

---

## 实施步骤与细节

### Step 1: `core/case_creation.py` 联动触发
在 `create_case_from_source` 中，原清单生成逻辑之后追加调用：
```python
    # 4. 材料清单预选与自动匹配（WO-54）
    try:
        from core.checklist.generator import generate_checklist_draft, save_confirmed_checklist
        from core.checklist.matcher import match_checklist_files_for_case

        draft = generate_checklist_draft(case_id, db)
        save_confirmed_checklist(case_id, draft, db)

        # 若已绑定有效 folder_path，即刻执行一次标题快速匹配与自动打勾
        if folder_path and Path(folder_path).is_dir():
            match_checklist_files_for_case(case_id, db)
    except Exception as exc:  # noqa: BLE001 — 清单预选/匹配失败不阻断建档
        logger.warning("Checklist pre-selection or auto-match failed for %s: %s (non-fatal)", case_id, exc)
```

---

## 自动化测试与门禁（`tests/test_api/test_checklist_matcher.py`）

1. `test_match_checklist_files_success`:
   - 在 `tmp_path` 下创建模拟案卷目录，放入 `ID DL.pdf`、`ID Passport.pdf`、`Rate Notice - 84 Louis St.pdf`、`SE Declaration.pdf`；
   - 建立测试 Case 及 4 个对应 Checklist 项（`master_id="driver_licence"`, `"passport"`, `"council_rates"`, `"se_declaration"`）；
   - 执行 `match_checklist_files_for_case`；
   - 断言 4 个 Checklist 项状态变为 `"received"`，`received_file_id` 与 `received_file_ids` 均已正确关联 `CaseFile` ID；
   - 断言 `Case.gathering_progress == 100`。
2. `test_match_checklist_endpoint`:
   - 通过 FastAPI TestClient 调用 `POST /api/cases/{case_id}/checklist/match-files`，验证 HTTP 200 及返回体结构。
3. `test_match_checklist_missing_folder_safe`:
   - 当 `folder_path` 为空或不存在时，安全返回 0 匹配，不抛异常。

---

## 验收检查命令
```powershell
$env:PYTHONPATH="D:\vera-workbench\.venv\Lib\site-packages"
$env:TESSDATA_PREFIX="C:\Users\Yaruo\AppData\Local\Temp\py311embed\tessdata"
python -m pytest tests/test_api/test_checklist_matcher.py -v
python -m ruff check core/checklist/matcher.py core/case_creation.py server/api/cases.py server/api/schemas.py tests/test_api/test_checklist_matcher.py
```
- 测试 100% 通过（0 failed）
- ruff 检查 0 errors / 0 warnings
