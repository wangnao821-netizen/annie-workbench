# WO-52 存量案件清理 — 执行规范

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / pathlib
- 禁止：引入任何新的 pip 依赖
- 禁止：创建"改动范围"表以外文件；禁止修改表以外文件
- 禁止：读写真实客户文件夹（测试一律 tmp_path）
- 前端部分不在本单（另出 AI Studio 提示词）；本单只做后端

## 背景

WO-50 修复了新建案件的 master_id 落库（18/18），但**存量案件**（如 CASE-459D32BE）
的清单是修复前生成的，master_id 全空 → 文件名匹配打钩失效。另：存量导入预览
能识别平台递交状态（submitted_platforms），但建案后未写入案件上下文。本单：
① 提供清单"重新生成"端点（AI 推荐 + master_id）；② 建案时把平台递交状态写入
案件上下文事件。

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `core/checklist/generator.py` | 修改 | 末尾追加 `regenerate_checklist(case_id, db)` |
| `server/api/cases.py` | 修改 | 追加 `POST /{case_id}/checklist/regenerate` 端点 |
| `server/api/cases.py` | 修改 | `create_case` 建案后写平台递交事件（约 L520 附近 `db.commit()` 前） |
| `server/api/schemas.py` | 修改 | 追加 1 个请求模型 + 1 个响应模型 |
| `core/case_creation.py` | 修改 | `create_case_from_source` 增加 `platform_submissions: list[str] = ()` 参数并落事件 |
| `tests/test_api/test_checklist_regenerate.py` | **新建** | ≤150 行 |

⚠️ 严禁修改上表以外文件。前端"重新生成"按钮另出提示词，本单不做。

## 接口契约（一字不改）

```python
# core/checklist/generator.py（末尾追加）
def regenerate_checklist(case_id: str, db: Session) -> list[dict]:
    """删除该案件现有清单并重新生成（AI 推荐，失败回退规则）。
    返回与 generate_checklist_draft 相同的 rehydrated_items（含 master_id）；
    生成后调用 save_confirmed_checklist 落库。案件不存在 → ValueError。"""


# server/api/schemas.py（末尾追加）
class ChecklistRegenerateResponse(BaseModel):
    case_id: str
    count: int
    generated_by: str  # "ai" | "rule_fallback"


# server/api/cases.py（追加端点）
@router.post("/{case_id}/checklist/regenerate", response_model=ChecklistRegenerateResponse)
def regenerate_case_checklist(
    case_id: str,
    db: Session = Depends(get_db),  # noqa: B008
) -> ChecklistRegenerateResponse:
    """重新生成材料清单：AI 推荐 + master_id 落库；LLM 失败回退规则（generated_by=rule_fallback）。"""


# core/case_creation.py：create_case_from_source 增加关键字参数
platform_submissions: list[str] = ()  # 追加到函数签名末尾（默认空元组，向后兼容）
# 建案成功后（清单预选之后）：
#   对每个 p in platform_submissions：
#     append_context_event(case_id, f"存量导入：案件已递交 {p} 平台",
#                          db, source_type="stage_advanced", trigger_distill=False)
```

## 实施步骤

### Step 1：regenerate_checklist（generator.py）

- [ ] 文件：`core/checklist/generator.py`，末尾追加 `regenerate_checklist`（≤60 行）
- [ ] 实现：`_get_case_or_404` 逻辑（直接查 `db.query(Case)`，不存在 `raise ValueError`）→
  `db.query(CaseChecklist).filter(case_id==...).delete()` → `generate_checklist_draft(case_id, db)`
  （LLM 失败内部已回退规则/默认清单）→ `save_confirmed_checklist(case_id, items, db)`
- [ ] `generated_by` 判定：比较 items 是否含规则回退特征（全部 `ai_suggestion ==
  "根据案件画像与银行政策为必选材料"` 且全部 `is_required=True`）→ `"rule_fallback"`，否则 `"ai"`
- [ ] 验证：`python -c "import core.checklist.generator"` 无错

### Step 2：端点 + schemas

- [ ] `server/api/schemas.py` 末尾追加 `ChecklistRegenerateResponse`
- [ ] `server/api/cases.py` 末尾追加 `regenerate_case_checklist` 端点（契约见上；
  import 补充 `ChecklistRegenerateResponse` 与 `regenerate_checklist`）
- [ ] 验证：`python -c "import server.main"` 无循环导入

### Step 3：平台递交状态落库

- [ ] `core/case_creation.py`：`create_case_from_source` 签名末尾追加
  `platform_submissions: list[str] = ()`
- [ ] 在函数内清单预选之后、返回前，遍历 `platform_submissions` 写上下文事件
  （`append_context_event`，`source_type="stage_advanced"`，`trigger_distill=False`，
  content 格式 `"存量导入：案件已递交 {p} 平台"`）
- [ ] `server/api/cases.py` 的 `create_case` 端点：请求体新增
  `platform_submissions: list[str] = []`（CaseCreateRequest 追加字段），调用
  `create_case_from_source(..., platform_submissions=req.platform_submissions)`
- [ ] 验证：建案请求带 `platform_submissions=["Infynity"]` → 案件上下文事件含
  "已递交 Infynity 平台"

### Step 4：测试

- [ ] 新建 `tests/test_api/test_checklist_regenerate.py`（≤150 行）
- [ ] 用例：
  1. `test_regenerate_replaces_items`：造案件+旧清单（master_id=None）→ 调
     `regenerate_checklist` → 旧清单被替换、新清单 master_id 全非空、
     端点返回 count>0 与 generated_by ∈ {"ai","rule_fallback"}
  2. `test_regenerate_missing_case_404`：不存在案件 → 404
  3. `test_create_with_platform_submissions`：建案请求
     `platform_submissions=["Infynity"]` → CaseContextEvent 含"已递交 Infynity 平台"
  4. `test_create_without_platform_submissions`：不带该字段 → 无平台事件（向后兼容）
- [ ] 验证：`pytest tests/test_api/test_checklist_regenerate.py -q` → 4 passed

## 验收标准

### 自动验证
- `pytest tests/test_api/test_checklist_regenerate.py -q` → 4 passed
- `pytest tests/test_api/test_case_lifecycle.py tests/test_api/test_legacy_import.py -q` → 全绿（无回归）
- `ruff check core/checklist/generator.py core/case_creation.py server/api/cases.py server/api/schemas.py tests/test_api/test_checklist_regenerate.py` → All checks passed

### 手动验证（开发环境）
1. 对存量案件（如 CASE-459D32BE）POST `/api/cases/{id}/checklist/regenerate` →
   清单重建且每条 master_id 非空；Send to Lender 文件名可匹配打钩
2. 存量导入建案（preview 的 submitted_platforms 传入建案请求）→ 案件时间线/全景
   出现"已递交 Infynity 平台"事件

---
⚠️ 执行纪律：
1. 只修改"改动范围"表文件；一个字符契约都不能改
2. 每 Step 完成立即验证；失败停下报告，不自作主张
3. 测试只用 tmp_path；不读写真实客户文件夹
4. 不引入新依赖；不重构计划外代码
5. 完成后不 commit，等检查者核对
