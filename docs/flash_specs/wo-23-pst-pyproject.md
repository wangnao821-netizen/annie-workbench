# WO-23：PST 导入 remember 接线修复 + pyproject 依赖对齐 + uv.lock 入库

> 来源（Codex 验收 WO-20/21 收尾，2026-08-13）：
> 1) tools/import_pst.py F821 —— `# from core.memory import remember` 被注释（TODO(WO-08) 遗留），但 L274 仍在调用 `remember(case_id, body, db)`，每次 PST 导入走到记忆步骤都触发 NameError（外层 try/except 兜住不崩，但行为错误且日志噪音）。`core/knowledge/memory.py` 已提供 `remember(case_id, content, db)`（L134），只需改 import 来源即可接线。
> 2) pyproject.toml 未声明实际运行依赖 openpyxl / oletools / python-multipart（venv 已装但声明缺失）；uv.lock 未跟踪（73 包，不含上述 3 个）。
> 执行方：opencode。检查方：Codex。
> 前置：WO-20/21 已提交（head 5c58018 / edf96f1）；alembic head = 6f9c2d4a8e1b（本单无迁移）。

## 技术约束

- 后端：Python 3.11+；只改 import 来源，不改 PST 解析逻辑；不碰 core/knowledge/memory.py（只消费）
- 禁止：引入任何新的 pip 依赖（本单只是声明已存在/已使用的依赖）；禁止修改本表以外的文件
- mem0 本次不声明：venv 未安装且 memory.py 有优雅降级（_get_mem0 失败返回 None），留待 Mem0 正式接入单再声明
- uv.lock 处理：uv 可用才重新生成；uv 不可用则跳过提交，在交付报告注明

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `tools/import_pst.py` | 修改 | L34-36：删除 `# TODO(WO-08)...` 与 `# from core.memory import remember`，替换为 `from core.knowledge.memory import remember`（按现有 import 排序插入） |
| `pyproject.toml` | 修改 | `dependencies` 段追加 3 行（见 §二） |
| `uv.lock` | 修改 | pyproject 更新后 `uv lock` 重新生成（uv 可用时） |
| `tests/test_tools/test_pst_remember_fix.py` | **新建** | 2 用例（见 §四），≤200 行 |

⚠️ 严禁修改上表以外的文件。尤其不得改动：core/knowledge/memory.py、PST 解析逻辑、config/ 任何文件、ui/ 任何文件。

---

## 一、import 接线（`tools/import_pst.py`）

- 现状（L34-36）：
  ```python
  # TODO(WO-08): memory module not yet migrated to core/
  # from core.memory import remember
  from core.logger import get_logger, setup_file_logging
  ```
- 改为：
  ```python
  from core.knowledge.memory import remember
  from core.logger import get_logger, setup_file_logging
  ```
- 调用点 L274 `remember(case_id, body, db)` 保持不动（签名 `remember(case_id, content, db)` 完全匹配）。

## 二、pyproject.toml 依赖对齐

在 `dependencies` 列表追加（与既有条目同格式）：

```toml
    "openpyxl>=3.1",
    "oletools>=0.6",
    "python-multipart>=0.0.32",
```

不声明 mem0（见技术约束）。追加后若 uv 可用：

```
uv lock
```

确认 uv.lock 包列表包含 openpyxl / olefile / python-multipart。

## 三、uv.lock 入库条件

- uv 可用且重新生成成功 → 随本单提交
- uv 不可用 → uv.lock 保持未跟踪不提交，交付报告注明「待 uv 环境重新生成后补提交」，不得手工编辑 uv.lock

## 四、测试（`tests/test_tools/test_pst_remember_fix.py` 新建）

```python
"""WO-23：PST 导入 remember 接线修复 — 防止 F821 回退。"""

class TestPstRememberFix:
    def test_remember_export_exists(self):
        # from core.knowledge.memory import remember 可导入；
        # inspect.signature 含 case_id / content / db 三个参数
    def test_import_pst_uses_correct_import(self):
        # 读 tools/import_pst.py 源码：
        #   断言包含 "from core.knowledge.memory import remember"
        #   断言不包含 "from core.memory import"
```

## 五、验收标准（全量门禁）

- `ruff check tools/import_pst.py` → 0 告警（F821 消失）
- `python -m pytest tests/test_tools/ -q` → 2 passed
- `python -m pytest tests/ -q` → 646 passed, 0 failed, 0 skipped（无回归）
- uv.lock（若提交）含 openpyxl / olefile / python-multipart
- git 提交（一次）：
  ```
  git add tools/import_pst.py tests/test_tools/ pyproject.toml
  git add uv.lock        # 仅当重新生成成功
  git commit -m "fix: WO-23 PST 导入 remember 接线 + pyproject 依赖对齐 + uv.lock 入库"
  ```
- 禁止纳入本次提交：config/industry_seed.yaml、ui/ 任何文件、docs/flash_specs/wo-22-bank-registry.md（WO-22 专属）

---
⚠️ 执行纪律：只改「改动范围」表内文件；每步完成立即验证；失败停下报告，不自作主张修计划外代码。
