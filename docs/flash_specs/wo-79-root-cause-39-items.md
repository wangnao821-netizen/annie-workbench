# 根因分析：为什么出现 39 项（21 + 18）

## 🔍 根因排查

1. **首次建案时的 21 项**：
   - 建案时 `initial_generator` 根据 `preliminary_assessment.yaml` 模版在数据库插入了 21 条初始清单材料（如：`有效护照`、`驾照`、`6 个月工资入账流水` 等）。

2. **在「调整勾选清单」保存时的重复叠加（关键 Bug）**：
   - 在 `ChecklistAdjustModal.tsx` 的保存逻辑中，前端逐条遍历选中的 18 项并调用了 `addChecklistItem`；
   - `addChecklistItem` 是为了“新增自定义材料”设计的，它把这 18 项作为新的记录重新 `INSERT` 进了数据库（如新增了 `有效护照 (Passport)`）；
   - 而对于未选中的项，前端调用了 `revokeChecklistItem`，但 `revoke` 后端逻辑只是把状态从 `received` 撤销回 `pending`，**并没有从数据库中 DELETE 删除**；
   - 结果：**原来的 21 项全部还在 + 新增的 18 项 = 39 项**！并且在“身份证明”中出现了 `有效护照` 与 `有效护照 (Passport)` 双份。

---

## 🛠️ 解决方案

1. **后端新增原子替换接口**：
   `PUT /api/cases/{case_id}/checklist/initial`
   - 入参：`{"selected_master_ids": ["passport", "driver_license", ...]}`
   - 行为：原子级清空该案旧的 `phase="initial"` 项，按选定的标准 Master ID 重建（已勾选收到/关联文件的状态予以保留），追加阶段（condition）项绝不破坏；
   - 彻底杜绝逐条叠加和重名新增。

2. **画像默认值修正**：
   - 若建案时未显式指定雇佣类型，默认按 `PAYG` 裁剪自雇税表与财报，初始推荐约 12~14 项（而非 21 项全集）。
