# WO-45 OCR 链路验证与加固（LiteParse 主链路 + 扫描/图片兜底 + tool-ocr 可用化）

> 依据：Vera 2026-08-15 拍板——图片识别/OCR 复用老项目已迁入的 LiteParse 链路
> （`core/pipeline/parser.py`），不引入 RapidOCR/Docling；补齐缺失兜底依赖，实测验证后 tool-ocr 能力真实可用。
> 执行者：opencode / Gemini，按 Step 执行，每步跑验证命令。

## 背景事实（已核实，勿重复调研）

- 老项目 OCR 方案（LiteParse，run-llama Rust 库，`ocr_enabled=True`）已随基线快照迁入
  `core/pipeline/parser.py`（解析 + 图片 OCR + 扫描 PDF 兜底 + 多级 fallback）；
- 现有调用点：`processing_center` / `state_machine` / `onboarding` /
  `case_folder.lookup.parse_one`（WO-32 文件夹检索）/ `agents.declaration_check`（WO-20）；
- venv 已装：liteparse 2.12.0 / extract_msg 0.56.0 / openpyxl 3.1.5 / pillow 12.3.0；
- **venv 未装**：pymupdf (fitz) / pdfplumber / pypdf / python-docx → parser.py 中扫描 PDF
  「逐页转图再 OCR」与 PDF 文本兜底分支实际未启用（`ImportError` 被吞，不崩但功能缺失）；
- `config/agents.yaml` 的 tool-ocr「文件识别提取 (OCR & Parse)」已注册 `available`
  （description：智能识别工资单/Bank Statement/身份证件）；
- 红线：AGENTS.md「大文件解析禁止集成进 Web 进程」→ `parse_file` 已有
  `ProcessPoolExecutor` 子进程隔离 + 60s 超时 + 2 次重试，本次保持并验证。

## 技术约束

- 项目根：`D:\vera-workbench`；venv：`.venv\Scripts\python.exe`；
  基线：`pytest tests/ -q` = **1060 passed**（wo-44 后）；
- **允许新增且仅新增 4 个 pip 依赖**：`pymupdf` / `pdfplumber` / `pypdf` / `python-docx`
  （用于启用 parser.py 既有兜底分支）；
- 禁止：修改 `config/document_types.yaml`、`config/naming_rules.yaml`（只读真源）；
  修改前端 `ui/`；引入真实客户文件作测试样本。

## 改动范围（严禁超出）

| 文件 | 操作 | 说明 |
|---|---|---|
| `pyproject.toml` | 修改 | dependencies 追加 `pymupdf>=1.24` / `pdfplumber>=0.11` / `pypdf>=4.0` / `python-docx>=1.1` |
| `uv.lock` | 修改 | `uv lock` 重新生成并提交 |
| `core/pipeline/parser.py` | 修改（最小） | 仅在实测发现兜底分支真实 bug 时修复；禁止重构、禁止改签名/字段名 |
| `tests/test_core/test_ocr_pipeline.py` | 新建 | 合成样本测试（见测试要点） |

> 若全量回归暴露 endpoint 层问题，允许最小修复 + 补测试，但必须在交付报告中说明。

## 实施步骤

### Step 1：依赖补齐

- `pyproject.toml` 追加 4 依赖 → `uv lock` → 提交 `uv.lock`；
- 验证：`python -c "import fitz, pdfplumber, pypdf, docx"` 无报错。

### Step 2：合成样本测试（tests/test_core/test_ocr_pipeline.py）

全部使用 `tmp_path` + PIL/pypdf/fitz 现场合成，**严禁真实客户文件**：

1. **英文文本图片**（白底黑字 ≥200px，PIL 画 2-3 行）→ `parse_file` → text 非空，
   `parse_route` 为 `image_ocr` 或 `native_text`（允许 LiteParse 判定差异），断言 text 含 ≥1 个关键 token；
2. **中文文本图片**（Windows 可用 `C:\Windows\Fonts\simhei.ttf` 则用中文；不可用则英文+数字代替并标注）
   → 断言 text 非空即可，**不硬断言具体词**（中文识别为可观测项，实测结果写进交付报告）；
3. **合成 PDF**（pypdf 写入一页文本）→ `native_text` 路径，断言 text 含写入内容；
4. **扫描样 PDF**（fitz 把图片 PDF 化）→ 兜底 OCR 路径，断言 text 非空或 `parse_error` 明确非空；
5. **.msg 邮件**（extract_msg 构造可行则测；不可行则跳过并标注）→ `parse_route=native_text`；
6. **OCR 失败兜底**：纯色图片 → 不抛异常，返回 `image_metadata` / `ocr_failed` 占位；
7. **子进程隔离**：断言 `_parse_with_liteparse` 使用 `ProcessPoolExecutor(max_workers=1)` +
   60s 超时（结构断言或 mock 验证），解析崩溃不拖垮主进程。

失败标准：以上断言全绿；任一断言失败不得跳过，需修到绿（除明确标注的可观测项/跳过项）。

### Step 3：回归门禁

1. `pytest tests/test_core/test_ocr_pipeline.py -q` 全绿；
2. `pytest tests/ -q` ≥ **1060 passed**，0 failed / 0 skipped；
3. `ruff check`（本单所有 py 文件）→ All checks passed；
4. `python -c "import core.pipeline.parser, core.case_folder.lookup, core.agents.declaration_check"` 无循环导入；
5. `git commit`：`feat: WO-45 OCR 链路验证加固 — 兜底依赖补齐 + 合成样本测试（N 文件）`。

### Step 4：tool-ocr 可用性核对（不改 agents.yaml）

- 确认 tool-ocr 在 `config/agents.yaml` 仍 `available`，5 个调用点 import 正常；
- 交付报告列明：哪些能力已通（图片 OCR / 扫描 PDF / 邮件 / 表格）、哪些是合成验证
  （未用真实客户文件）、中文识别实测结果与是否需要 RapidOCR 补充的建议。

## 红线

- 不写客户文件夹（测试全部用 `tmp_path`）；不引入真实客户文件/真实 PII（合成样本）；
- `parse_file` 保持子进程隔离，禁止把解析挪进 Web 请求线程（沿用 `ProcessPoolExecutor`）；
- parser.py 修改最小化：只修实测暴露的 bug，禁止重构、禁止改 `ParseResult` 字段名/函数签名。

## 交付物

- 4 个依赖 + uv.lock（已提交）；
- `tests/test_core/test_ocr_pipeline.py`（合成样本测试）；
- （按需）parser.py 最小修复；
- 交付报告：实测结果表 + tool-ocr 可用性结论 + 是否建议 RapidOCR 补充。
