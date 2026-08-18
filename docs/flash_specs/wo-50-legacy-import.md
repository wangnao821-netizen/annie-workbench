# WO-50 存量导入后端 — 执行规范（OpenCode 执行）

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / pathlib（禁止 os.path.join）
- 禁止：引入任何新的 pip 依赖（含 openpyxl/oletools 等一律不新增）
- 禁止：创建"改动范围"表以外的文件；禁止修改表以外任何文件
- 禁止：重构、重命名、移动任何既有文件/函数（除非本表明确要求）
- 禁止：访问/读取真实客户文件夹（`D:\EverStones_Test_Clients\...`），测试一律用 tmp_path 造目录
- 允许：读取 `config/checklist_master.yaml`、`core/checklist/master_picker.py` 等以理解结构，但不得修改表外文件
- 所有路径操作必须 `pathlib.Path`，不硬编码分隔符

## 背景（为什么要做）

存量案件导入时，材料清单自动匹配依赖"文件名 → 主清单项"别名匹配。实测客户真实文件夹
`Send to Lender` 中 11 个文件只有 1 个能匹配（别名表缺澳洲真实命名），且现有扫描是对整个
案件文件夹递归扫描（噪音大）。本单：① 扩充别名表；② 扫描聚焦 `Send to *` 平台目录；
③ 提供存量导入预览端点（自动找 Broker Notes 提取画像 + 返回各平台递交状态）。

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `config/checklist_master.yaml` | 修改 | 5 个 items 的 aliases（见 Step 1） |
| `core/case_folder/discovery.py` | 修改 | `scan_case_folders`（约 L87-131） |
| `core/case_folder/legacy_import.py` | **新建** | —（≤180 行） |
| `server/api/cases.py` | 修改 | 末尾追加 1 个端点（不动既有代码） |
| `server/api/schemas.py` | 修改 | 文件末尾追加 2 个模型 |
| `tests/test_api/test_legacy_import.py` | **新建** | —（≤160 行） |

⚠️ 严禁修改上表以外的任何文件。
⚠️ 本单不做：平台进度写库/事件、前端改动、存量案件 master_id 补全（另行处理）。

## 接口契约（一字不改）

```python
# core/case_folder/legacy_import.py
def find_broker_notes(folder: Path) -> Path | None:
    """在案件文件夹根目录或 Send to Lender 子目录查找 Broker Notes 文件。
    优先 .docx，其次 .pdf；glob 模式不区分大小写写法固定为：
    "*roker*otes*.docx" / "*roker*otes*.pdf" / "*roker*ote*.docx" / "*roker*ote*.pdf"。
    找不到返回 None；只读不解析。"""


def build_legacy_import_preview(folder_path: str, db: Session) -> dict:
    """存量导入预览（只读，不写库）：
    1. folder 不存在 → 返回 {"ok": False, "message": "文件夹不存在: {folder_path}"}
    2. 找 Broker Notes → parse_file → build_prefill_from_text(text[:8000], db)
       → prefilled 合并进返回（key 与 PreFillResponse 的 prefilled 一致）；
       Broker Notes 缺失时 prefilled = {}（不报错）。
    3. 枚举顶层 "Send to *" 目录（名不区分大小写、以 "send to " 开头），
       统计每个目录文件数（仅顶层文件 + 递归，含子目录全部文件，忽略 .DS_Store/Thumbs.db/desktop.ini）；
       "Send to Lender" 计入 submissions 但标记 is_lender=true。
    4. 返回：
    {
      "ok": True,
      "broker_notes_found": bool,
      "broker_notes_name": str | None,
      "prefilled": {...},            # 来自 build_prefill_from_text 的 prefilled
      "submissions": [               # 每个 "Send to *" 目录一条
        {"platform": "Lender", "dir_name": "Send to Lender", "file_count": int, "is_lender": bool}
      ],
      "submitted_platforms": [str]   # 非 Lender 且 file_count>0 的目录名（去 "Send to " 前缀）
    }
    """


# server/api/schemas.py（追加到文件末尾；如顶部未 import Field，请在
# `from pydantic import BaseModel, Field` 行补 Field——仅允许这一处 import 改动）
class LegacyImportPreviewRequest(BaseModel):
    folder_path: str


class LegacyImportSubmission(BaseModel):
    platform: str
    dir_name: str
    file_count: int
    is_lender: bool = False


class LegacyImportPreviewResponse(BaseModel):
    ok: bool
    message: str | None = None
    broker_notes_found: bool = False
    broker_notes_name: str | None = None
    prefilled: dict = Field(default_factory=dict)
    submissions: list[LegacyImportSubmission] = Field(default_factory=list)
    submitted_platforms: list[str] = Field(default_factory=list)


# server/api/cases.py（文件末尾追加，路由前缀已存在 /api/cases）
@router.post("/legacy-import/preview", response_model=LegacyImportPreviewResponse)
def legacy_import_preview(
    req: LegacyImportPreviewRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> LegacyImportPreviewResponse:
    """存量导入预览：Broker Notes 画像 + 平台递交状态（只读）。"""
```

## 实施步骤

### Step 1：扩充主清单别名表（checklist_master.yaml）

- [ ] 文件：`config/checklist_master.yaml`
- [ ] 打开 items 数组，按 `id` 找到以下 5 项，在各自 `aliases` 列表**追加**（不删除既有值，已存在则跳过）：
  - `driver_license` 追加：`"dl"`, `"iddl"`
  - `pr_grant_notice` 追加：`"visa155"`（**只加这一个**；`"155"` 过短禁止添加，防误配）
  - `existing_loan_statement` 追加：`"liability"`, `"liabilityhl"`, `"homeloan"`
  - `council_rates_notice` 追加：`"ratenotice"`
  - `accountant_letter` 追加：`"accountantsdeclaration"`, `"accountant"`
- [ ] 验证（写一个临时 python 断言脚本，跑完即删，或直接在 pytest 里覆盖——见 Step 4）：
  `classify_file("ID DL.pdf")` 返回 `driver_license` 且置信度 ≥ 0.8；
  `classify_file("ID Visa 155.pdf")` 返回 `pr_grant_notice`；
  `classify_file("Rate Notice - 84 Louis Street.pdf")` 返回 `council_rates_notice`；
  `classify_file("Liability HL Zank Fxx8440.pdf")` 返回 `existing_loan_statement`；
  `classify_file("ORDE Financial - Accountant's Declaration v042025.pdf")` 返回 `accountant_letter`

### Step 2：聚焦扫描 Send to * 目录（discovery.py）

- [ ] 文件：`core/case_folder/discovery.py`
- [ ] 修改 `classify_file`（约 L38-46）：**先到先得改为"最长别名优先"**，解决
  `ID Visa 155.pdf` 被 `visa_grant` 的短别名 `visa` 抢先命中（应命中 `pr_grant_notice` 的
  `visa155`）。完整替换为：
  ```python
  def classify_file(filename: str) -> tuple[str | None, float]:
      """文件名关键词分类（V1 不 OCR）。返回 (doc_type=master id, confidence)。

      最长别名优先：多个别名命中时取最长（如 visa155 优先于 visa），避免短别名抢先误配。
      """
      plain = _normalize(filename)
      best: tuple[str, str, float] | None = None
      for key, aliases in _aliases().items():
          for alias in aliases:
              a = _normalize(alias)
              if not a or a not in plain:
                  continue
              confidence = 0.95 if plain == a or plain.startswith(a) or plain.endswith(a) else 0.85
              if best is None or len(a) > len(best[1]):
                  best = (key, a, confidence)
      if best is None:
          return None, 0.0
      return best[0], best[2]
  ```
- [ ] 在模块顶部（`_IGNORED_NAMES` 定义之后）新增辅助函数：
  ```python
  def _platform_dirs(folder: Path) -> list[Path]:
      """案件文件夹下所有顶层 "Send to *" 目录（Send to Lender / Send to Infynity / ...）。"""
      try:
          return [p for p in folder.iterdir()
                  if p.is_dir() and p.name.lower().startswith("send to ")]
      except OSError:
          return []
  ```
- [ ] 修改 `scan_case_folders`：把 `for f in sorted(folder.rglob("*")):` 改为
  `for root in (_platform_dirs(folder) or [folder]):` 外层循环，内层
  `for f in sorted(root.rglob("*")):`（`_platform_dirs` 为空时回退整文件夹扫描，保持兼容）
- [ ] 注意：`_log_event` 中 `f.relative_to(folder)` 在子目录扫描时仍以 folder 为基准（正确，不要改）
- [ ] 验证：`pytest tests/test_core/test_folder_discovery.py -q` 全绿

### Step 3：新建 legacy_import.py + preview 端点

- [ ] 新建 `core/case_folder/legacy_import.py`（≤180 行，含 docstring；复用
  `core.pipeline.parser.parse_file`、`core.facts.prefill.build_prefill_from_text`）
- [ ] 实现 `find_broker_notes(folder)`（契约见上）
- [ ] 实现 `build_legacy_import_preview(folder_path, db)`（契约见上；
  `_IGNORED` 集合为 `{".DS_Store", "Thumbs.db", "desktop.ini", "processed_ids.txt"}`，
  文件计数时跳过）
- [ ] `server/api/schemas.py` 末尾追加 5 个模型（契约见上；注意现有文件末尾是
  `CaseResubmitRequest`，在其后追加，不要插到中间）
- [ ] `server/api/cases.py` 末尾追加 `legacy_import_preview` 端点（契约见上；
  import 需补充 `LegacyImportPreviewRequest/LegacyImportPreviewResponse` 到 schemas import 列表，
  其余不动）
- [ ] 验证：`python -c "import core.case_folder.legacy_import"` 无错；
  `python -c "import server.main"` 无循环导入

### Step 4：测试

- [ ] 新建 `tests/test_api/test_legacy_import.py`（≤160 行，风格参照
  `tests/test_api/test_case_lifecycle.py`：`test_db` fixture + TestClient）
- [ ] 用例清单（每用例独立 tmp 案件目录）：
  1. `test_classify_real_file_names`：直接调 `classify_file`，断言 Step 1 的 5 个文件名映射
     （driver_license / pr_grant_notice / council_rates_notice / existing_loan_statement / accountant_letter）
  2. `test_find_broker_notes_prefers_docx`：目录放 `Broker Notes.pdf` + `Send to Lender/Broker Notes.docx`
     → 返回 Send to Lender 下的 docx
  3. `test_build_preview_prefilled_and_submissions`：tmp 目录结构
     `Broker Notes.docx`（内容含 "Loan Amount: $500,000"）+
     `Send to Lender/ID Passport.pdf` + `Send to Infynity/Products.pdf` →
     broker_notes_found=True；prefilled 含 loan_amount=500000（或等价）；submissions 含
     Lender 与 Infynity 两条；submitted_platforms == ["Infynity"]
  4. `test_preview_folder_missing`：folder_path 不存在 → ok=False + message 含"文件夹不存在"
  5. `test_preview_endpoint`：用 TestClient POST `/api/cases/legacy-import/preview`
     json={"folder_path": "<tmp 目录>"} → 200，响应结构含 submissions/submitted_platforms
- [ ] 验证：`pytest tests/test_api/test_legacy_import.py -q` 全绿

## 验收标准

### 自动验证（必须全部通过）

- `pytest tests/test_api/test_legacy_import.py -q` → 5 passed
- `pytest tests/test_core/test_folder_discovery.py tests/test_api/test_case_lifecycle.py -q` → 全绿（无回归）
- `ruff check core/case_folder/legacy_import.py core/case_folder/discovery.py server/api/cases.py server/api/schemas.py tests/test_api/test_legacy_import.py` → All checks passed
- `python -c "import core.case_folder.legacy_import, server.main"` → 无异常

### 手动验证（开发环境后端）

1. 启动后端后 POST `/api/cases/legacy-import/preview`，
   body `{"folder_path": "D:\\EverStones_Test_Clients\\Yingkun CHEN\\8. Refi & cash - ORDE小号 - 84 Louis St (Alt doc) - onhold due to poor val"}`
   → 返回 broker_notes_found=true、prefilled 含 client_name/loan_amount/purpose、
   submissions 含 Send to Lender（is_lender=true）与 Send to Infynity、
   submitted_platforms=["Infynity"]
2. 对照真实文件夹：Send to Lender 的 11 个文件中，ID Passport / ID DL / ID Visa 155 /
   Rate Notice / Liability HL / Accountant's Declaration 均能在清单匹配（classify_file 命中）

---
⚠️ 执行纪律（每一条都必须遵守）：
1. 只修改"改动范围"表中列出的文件，绝不碰其他文件
2. 所有变量名/函数名/字段名严格按照"接口契约"章节定义，一个字符都不能改
3. 每完成一个 Step 立即运行该 Step 的验证命令
4. 如果验证失败，停下来报告错误内容，不要自己尝试修复计划外的代码
5. 不要引入任何"技术约束"章节中未列出的依赖库
6. 不要创建"改动范围"表中未列出的新文件
7. 不要重构、优化、美化任何计划外的代码
8. 测试一律用 tmp_path，绝不读真实客户文件夹
