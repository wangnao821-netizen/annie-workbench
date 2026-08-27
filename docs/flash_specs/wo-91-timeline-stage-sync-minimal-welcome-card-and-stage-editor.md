# WO-91: 邮件时间线智能阶段同步、Apple极简接管卡与全景阶段选择器

## 一、背景与问题定义
1. **邮件事件与阶段脱节**：`msg_timeline.py` 解析出审批/递交/补件邮件后仅存入展示时间线，未联动晋级主表 `Case.stage`；
2. **导入跳转偏离**：`NewCaseSheet.tsx:194` 遗留了 `open-case-detail` 事件，覆盖了直达 AI 中栏；
3. **欢迎卡视觉过载**：500px 高度 + 4 种背景色冲突，需重构为 Apple 极简卡片（~160px）+ 渐进折叠备忘输入；
4. **全景阶段不可交互**：`OverviewFacts.tsx` 中的阶段为纯静态文字，需增加交互式 9 级阶段点选器。

---

## 二、修改清单与契约

### 1. 邮件时间线联动晋级阶段 (`core/pipeline/msg_timeline.py`)
- 在 `sync_timeline_for_case` 扫描邮件事件后，根据最新高阶事件（`approval_issued` ➔ `已批准`, `mir_requested` ➔ `银行补件`, `submission_lodged` ➔ `已递交(等银行)`）自动推进 `Case.stage` 并落库。

### 2. 路由直通 AI 中栏 (`frontend/src/components/cases/NewCaseSheet.tsx`)
- 将 `handleBatchMigrationComplete` 中的 `open-case-detail` 统一改为 `open-case-brain`。

### 3. Apple 极简接管卡片 (`frontend/src/components/brain/WelcomeCard.tsx`)
- 高度压缩至约 160px，去除多色背景块，统一使用高级单色系；
- 内置 **[ 🎯 阶段点选下拉弹层 ]**，支持就地点选 9 级阶段并即时保存；
- 折叠式灵动备忘胶囊 **[ 💬 随手记内线备忘... ]**，输入完成自动收拢。

### 4. 右栏全景阶段选择器 (`frontend/src/components/cases/overview/OverviewFacts.tsx`)
- 将静态只读文本改为交互式 Stage Dropdown/Badge，支持随时切换阶段。

---

## 三、验收标准
- `pytest tests/test_api/test_msg_timeline.py tests/test_core/test_topology.py` 0 error；
- `tsc --noEmit` 0 error；
- 启动本地前端开发服务器（`localhost:3000`）供用户实机网页测试。
