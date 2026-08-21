# WO-68 清单新增「从库选择」（清单总库查询接口 + 前端库选择）

> 状态：规划（待实施）

## 背景

新增清单项目前是自由输入名称 + 手选分类。WO-43 已沉淀「清单总项库」（内置 `config/checklist_master.yaml` + 自定义 `checklist_library_custom` 表），但前端没有库选择入口。目标：新增表单先「从库选」，选不中再自定义，自定义项继续沉淀进库（闭环）。

## 技术约束

- 后端 Python 3.11 / FastAPI；禁止新增依赖
- 复用 `core/checklist/master_picker._load_master(db)`（已实现 master + custom 合并）
- 只读库接口，不在此单改库结构

## 改动范围（严禁超出）

| 文件 | 操作 | 内容 |
|---|---|---|
| `server/api/checklist_library.py` | 新建（≤120 行） | `GET /api/checklist/library` 返回合并库 |
| `server/main.py` | 修改 | 注册路由（最小接线） |
| `server/api/schemas.py` | 修改 | `ChecklistLibraryItem` / `ChecklistLibraryResponse` |
| `frontend/src/services/api/checklist.ts` | 修改 | `getChecklistLibrary()` |
| `frontend/src/components/brain/ChecklistDeck.tsx` | 修改 | 新增表单加「从库选择」：搜索框 + 候选列表，点选自动填充名称/分类/适用条件；仍保留手动输入 |
| `tests/test_api/test_checklist_library.py` | 新建（≤140 行） | 库接口专项测试 |

## 接口契约

`GET /api/checklist/library`

```json
{
  "items": [
    { "id": "master:2025_noa", "name_zh": "2025 财年 NOA", "category": "income_self_employed",
      "applicable_when": null, "use_count": 0, "is_custom": false }
  ]
}
```

- master 项 id 前缀 `master:`，custom 项 `custom:{uuid8}`
- 按 name_zh 去重（custom 同名覆盖 master）
- category 用后端枚举（与 `CATEGORY_TO_EN` 一致）

## 实施步骤

1. 后端：`_load_master(db)` 结果映射为契约结构；custom 追加 `use_count`
2. 注册路由 + schema
3. 前端：库选择 UI（搜索过滤 name_zh/category，点选填充 `newName/newCategory/newCondition`，`newRequired` 默认 true）
4. 测试：返回合并库、custom 去重覆盖、空库降级（无 custom 表或空）

## 验收

- 专项测试全绿；全量 pytest 0 failed；tsc/build 通过
- 打包版：新增清单项可从库搜索点选，选不中可手动输入并沉淀

## 纪律

- 只读库接口，禁止改动 `checklist_master.yaml` 与 `checklist_library_custom` 结构
- 完成后不 commit，等检查者核对
