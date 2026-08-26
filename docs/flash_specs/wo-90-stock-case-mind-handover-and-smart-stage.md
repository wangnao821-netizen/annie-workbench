# WO-90: 存量案卷智能阶段推断、心智对账卡片与静默导入体验升级

## 一、背景与问题定义
1. **阶段识别缺失**：之前拓扑扫描仅粗分类 `active/settled`，导入时一律跌落至“收集资料 (gathering)”，未结合物理子目录（`Send to Lender`、`Approval`、`Loan Documents` 等）推断真实阶段；
2. **存量建档误建任务**：`onboarding_tasks.py` 漏掉 `is_imported` 拦截，存量案卷导入后仍被机械创建“发清单邮件”等新案任务；
3. **导入跳转与心智断层**：导入后跳转到静态表单页而非 AI 对话中栏（`BrainChat`），缺少结构化心智对账、内线备忘口述与下一步接力建议。

---

## 二、架构设计与修改清单

### 1. 后端阶段智能推断与新案任务拦截
- **`core/case_folder/topology.py`**:
  - 实现基于物理子目录（`Settlement` / `Loan Documents` / `Approval` / `Send to Lender` / `Valuation`）的细分阶段推断函数 `_infer_folder_stage(case_dir: Path)`；
  - 在 `_build_case_meta` 中返回 `stage`（如 `"已递交"`）和 `progress_pct`。
- **`core/case_engine/onboarding_tasks.py`**:
  - 在 `create_initial_tasks` 中严格判断 `if case.is_imported: return []`，存量导入 100% 不生成新案发信待办。
- **`server/api/cases.py`**:
  - `batch_topology_import`: 正确继承 `item.stage` 写入 `Case.stage`。

### 2. 前端存量导入弹窗与自动跳转
- **`frontend/src/components/cases/FolderTopologyScanner.tsx`**:
  - 默认分类筛选激活 `'active'`（仅展示在途活跃案卷，过滤结案老案）；
  - 导入完成后触发 `open-case-brain` 并切换至 `view === "brain"`（AI 对话中栏）。
- **`frontend/src/components/cases/topology/CaseSubfolderCard.tsx`**:
  - 展示推断阶段微标（如 `🟢 已递交`、`🟣 正式全批`）。

### 3. AI 对话中栏存量案卷心智对账卡片
- **`frontend/src/components/brain/WelcomeCard.tsx`**:
  - 针对 `is_imported` 存量案卷，呈现专属「心智接管汇报卡」：
    1. 📊 阶段与进度条对账；
    2. 📂 物理案卷路径与材料匹配度（无需重新收集）；
    3. 🧠 口述内线备忘录输入框（随手回车即存入记忆）；
    4. 📌 下一步建议跟进点与一键拍板（[确认阶段] / [设为待办] / [吩咐起草]）。

### 4. 版本升级与发布 (v2.3.4)
- 4 处版本号同步升级至 `2.3.4`；
- 打包并发布 GitHub Release。

---

## 三、验收标准
- `pytest tests/test_core/test_topology.py tests/test_api/test_folder_topology.py` 0 error；
- `tsc --noEmit` & `vite build` 0 error；
- 导入存量案卷后自动跳至 AI 中栏，展示对账卡片且不建任何发信垃圾任务。
