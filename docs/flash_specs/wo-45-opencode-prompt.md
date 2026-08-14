# 任务：执行 WO-45 OCR 链路验证与加固施工单（opencode 实施）

你是 Vera Workbench 的实施工程师。严格按施工单执行，**禁止超范围改动**，遇到歧义停下报告。

## 前置信息

- 仓库：`D:\vera-workbench`（Windows）；
- Python：`D:\vera-workbench\.venv\Scripts\python.exe`（测试 / ruff 都用它）；
- 施工单：`docs\flash_specs\wo-45-ocr-verify-harden.md`，**唯一契约**（接口签名、字段名一字不改）；
- 背景：Vera 拍板 OCR 复用老项目已迁入的 LiteParse 链路（`core/pipeline/parser.py`），不引入
  RapidOCR/Docling；本次补齐缺失兜底依赖（pymupdf/pdfplumber/pypdf/python-docx），用合成样本实测验证，
  让 tool-ocr「文件识别提取」能力真实可用；
- 当前基线：`pytest tests/ -q` = **1060 passed**，0 failed / 0 skipped；
- 已核实事实：venv 已装 liteparse 2.12.0 / extract_msg 0.56.0 / openpyxl / pillow；
  未装 pymupdf / pdfplumber / pypdf / python-docx；parser.py 中扫描 PDF/PDF 兜底分支因 ImportError 被吞而失效。

## 硬性纪律（违反即返工）

1. 只改施工单「改动范围」表内文件：
   `pyproject.toml`（+4 依赖）、`uv.lock`、`core/pipeline/parser.py`（最小修复，仅在实测暴露 bug 时）、
   `tests/test_core/test_ocr_pipeline.py`（新建）；
2. **严禁修改** `config/document_types.yaml`、`config/naming_rules.yaml`（只读真源）、前端 `ui/`、
   `config/agents.yaml`（tool-ocr 已 available，仅核对不修改）；
3. **红线**：不写客户文件夹（测试全用 `tmp_path`）；不引入真实客户文件/真实 PII（合成样本）；
   `parse_file` 保持 `ProcessPoolExecutor` 子进程隔离 + 60s 超时 + 2 次重试，禁止把解析挪进 Web 请求线程；
4. 禁止重构 parser.py、禁止改 `ParseResult` 字段名/函数签名。

## 接口契约速览（完整见施工单，一字不改）

```python
# core/pipeline/parser.py（现状勿动，只读参考）
parse_file(file_path: Path) -> ParseResult   # text / text_quality / parse_route / metadata ...
_parse_with_liteparse(file_path)             # ProcessPoolExecutor(max_workers=1) + timeout=60
```

`pyproject.toml` dependencies 追加（保持现有排序风格）：

```toml
"pymupdf>=1.24",
"pdfplumber>=0.11",
"pypdf>=4.0",
"python-docx>=1.1",
```

## 参考代码

- `core/pipeline/parser.py`：现有 fallback 分支（pypdf → pdfplumber → PyMuPDF 逐页转图 OCR），
  ImportError 时静默跳过——本次装齐依赖后应自然启用，无需改逻辑；
- `tests/test_api/test_file_ops.py` / `tests/test_core/`：fixture 风格参考
  （TestClient + tmp_path + monkeypatch 环境变量）。

## 实施步骤（每步跑验证命令）

1. 读施工单全文 + 上述参考代码；
2. `pyproject.toml` 追加 4 依赖 → `uv lock` →
   `python -c "import fitz, pdfplumber, pypdf, docx"` 无报错；
3. 新建 `tests/test_core/test_ocr_pipeline.py`（合成样本，见施工单 Step 2 的 7 个用例）→
   `pytest tests/test_core/test_ocr_pipeline.py -v` 全绿；
4. 全量 `pytest tests/ -q` ≥ 1060 passed，0 failed / 0 skipped；
5. `ruff check`（本单所有 py 文件）→ All checks passed；
6. `python -c "import core.pipeline.parser, core.case_folder.lookup, core.agents.declaration_check"` 无循环导入；
7. 核对 tool-ocr（不改文件）：`config/agents.yaml` 仍 available、5 个调用点 import 正常；
8. `git commit`：`feat: WO-45 OCR 链路验证加固 — 兜底依赖补齐 + 合成样本测试（N 文件）`。

## 测试要点（tests/test_core/test_ocr_pipeline.py）

- fixture：`tmp_path` + PIL 合成英文/中文图片；pypdf 写文本 PDF；fitz 做扫描样 PDF；
- 断言：英文图 text 非空含关键 token；中文图仅断言 text 非空（可观测项）；文本 PDF 含写入内容；
  扫描样 PDF text 非空或 parse_error 明确；纯色图不抛异常返回占位；
- 子进程隔离：结构断言或 mock 验证 `ProcessPoolExecutor(max_workers=1)` + timeout=60；
- 中文识别结果与是否建议 RapidOCR 补充，写进交付报告（不在测试中硬断言具体词）。

## 交付报告要求

- 改动文件清单 + 行数；依赖安装结果（版本号）；测试通过情况（专项 + 全量）；
- 实测结果表：图片 OCR / 扫描 PDF / 文本 PDF / .msg / 失败兜底 各路径实际 parse_route 与字符量；
- tool-ocr 可用性结论 + 是否建议 RapidOCR 补充（给出理由）。
