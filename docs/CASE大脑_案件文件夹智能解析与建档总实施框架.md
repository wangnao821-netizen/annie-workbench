# Vera 工作台 — 案件文件夹智能解析与建档总实施框架（在途作战系统）

本文档结合 **Vera 工作台前后端现有架构** 与真实客户案卷（如 `Yingkun CHEN`）的业务实践，聚焦于 **“日常全新建档 + 存量在途案件极速导入”**，将**「一客户多案件识别 + 核心文档深度解析 + 标题快速匹配打勾 + 邮件时序与卡点定性 + 新建建档交互重构 + 四级状态证据链 + 已在库排重闭环」**提炼为完整落地的工程化实施框架。

> 📌 **战略分工说明**：
> - **第一部分（本框架文档）**：在途作战系统 ➔ 聚焦于 Vera 日常高频全新建档、在途案件快速导入与材料自动打勾；
> - **第二部分（独立框架文档）**：历史档案与二次经营系统 ➔ 详见 [`docs/CASE大脑_历史完结案卷导入与档案中心二次经营总实施框架.md`](file:///d:/vera-workbench/docs/CASE大脑_历史完结案卷导入与档案中心二次经营总实施框架.md)。

---

## 🏗️ 一、 核心领域模型与建档入口权重（Domain & Priority）

### 1. 客户与案卷的“一对多”拓扑层级
在澳洲信贷业务中，客户根目录与各案卷子目录具有天然的层级从属关系：

```
📁 客户主体 (Client Level: D:\...\Yingkun CHEN)
 ├── 客户级全局面谈需求: Meeting Notes 14.04.2026.docx
 │
 ├── 🏠 房产 A 案件链条 (84 Louis Street, Granville)
 │    ├── 1. Refinance & cash out - ORDE (初次递交) ➜ [已归档 Case]
 │    ├── 2. Resub ... - Zank Financial - Withdrawn ➜ [撤回 Case]
 │    ├── 7. Refi & cash - Latrobe (Lite Doc) - onhold ➜ [暂停 Case]
 │    └── 8. Refi & cash - ORDE小号 - 84 Louis St (Alt doc) - onhold due to poor val 
 │         └── 【当前活跃主 Case (Active)】
 │
 └── 🏢 房产 B 独立案件 (如新购房/商业贷)
      └── 9. Purchase - 12 Station St, Parramatta ➜ 【并行独立 Case】
```

- **客户主体（Client）**：姓名 `Yingkun CHEN`，持有全局身份（护照/PR/ABN）及基本面。
- **案件（Case）**：每个带序号的子文件夹对应数据库中的一个独立 `Case` 实例（独立 `case_id`、独立材料清单 `Checklist`、独立路径 `folder_path`、独立审批阶段与状态）。

---

### 2. 界面建档入口的双通道权重（Dual-Track Hierarchy）

根据 Vera 的日常实际业务节奏，明确区分高频日常操作与过渡性操作：

```
┌──────────────────────────────────────────────────────────┐
│  新建贷款案件 (New Loan Case)                              │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  [ ★ 全新客户 / 案件录入 (默认第一主入口) ]  [ 📂 存量案卷批量迁移 ] │
│                                                          │
│  ┌─ 通道 A: 全新空白录入 (日常高频 365 天主场景) ───────┐  │
│  │ 1. 借款人画像: 姓名、身份状态 (PR/Citizen)、雇佣类型   │  │
│  │ 2. 意向贷款方案: 目标银行、贷款类型、预估借款金额     │  │
│  │ 3. 抵押物业信息: 房产地址、预估价值                  │  │
│  │                                                    │  │
│  │ 📁 自动创建本地标准工作目录:                         │  │
│  │    存放父目录: [ D:\EverStones_Clients\ ] [更改...] │  │
│  │    自动生成: D:\...\Yingkun CHEN\1. Refi-ORDE-84... │  │
│  │    (内置 Send to Lender / Approval / Valuation 等)  │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ 通道 B: 存量案卷自适应导入 (上线初期快速迁入在途案) ─┐  │
│  │ 选择客户根目录 ➔ 毫秒级拓扑扫描 ➔ 展示多房产案卷卡片   │  │
│  │ 自动勾选活跃案 ➔ 自动回填画像 ➔ 一键批量导入建档      │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│                          [ 取消 ]  [ 立即创建并打开案件 ➔ ]│
└──────────────────────────────────────────────────────────┘
```

- **通道 A（全新建档 - 默认首选）**：Vera 每天接待新咨询时使用。几秒录完核心 10 个字段，系统自动在本地硬盘脚手架生成标准 11 个子目录。
- **通道 B（存量导入 - 过渡通道）**：用于上线初期一次性把在办在审的案子整齐搬进系统。
- **彻底废除“三种录入粒度”旧设计**：不再让用户手动选择“建壳/预填/全量”，系统全部采用自适应最高完整度管道（有 Notes 抽画像，有材料自打勾，有邮件建时序）。

---

## ⚙️ 二、 数据流转与四层解析中枢架构

```mermaid
flowchart TD
    A["选择客户根目录 (D:\...\Yingkun CHEN)"] --> L0["Layer 0: 目录拓扑与多案卷识别引擎"]
    
    L0 -->|1. 提取客户名| C_Name["Client Name: Yingkun CHEN"]
    L0 -->|2. 递归发现 1~8 号子目录| C_List["案卷列表 (按房产分组)"]
    L0 -->|3. 解析目录名标签| C_Meta["解析 Lender / 房产 / AltDoc / 状态(Withdrawn/Onhold)"]
    L0 -->|4. 智能推荐与排重| C_Active["默认锁定最新活跃案卷 (8号 ORDE) + 已在库标记"]
    
    C_Active --> UI_Select{"Vera 自由勾选确认 (哪个进入工作台/哪个不进)"}
    
    UI_Select --> L1["Layer 1: 核心事实深度提取 (Deep Fact)"]
    UI_Select --> L2["Layer 2: 标题规则极速打勾 (Fast Match)"]
    UI_Select --> L3["Layer 3: 邮件时序与卡点引擎 (Email Timeline)"]
    
    L1 -->|Broker Notes & 估价报告| F1["提取：自雇收入/ABN/贷款结构/原债务/实际估价值($1.9M)"]
    L2 -->|别名规则库扫描| F2["ID/流水/地税单/声明信 ➔ 清单项自动打勾 (received) + 文件绑定"]
    L3 -->|.msg 邮件时序图谱| F3["提取：案号(23174)/审批官(Rachel)/估价缺口/申诉复议事件"]
    
    F1 & F2 & F3 --> DB[("案件全景落库: Case + Checklist + Facts + Timeline Events")]
```

---

## 🔍 三、 案卷状态与推进阶段的“四级证据链判定矩阵”

系统通过四级交叉证据链，全自动判定每个案卷的准确状态与推进阶段：

| 证据层级 | 判定依据与信号源 | 对应状态 / 阶段判定 | 落地模块 |
| :--- | :--- | :--- | :--- |
| **第一级：目录名显式语义**<br>*(0 秒正则命中)* | • 包含 `withdrawn` / `cancel` / `declined` / `撤回` ➔ **已撤回 (withdrawn)**<br>• 包含 `onhold` / `poor val` / `fees not paid` / `conflict` ➔ **暂停遇卡点 (onhold + 提取原因)**<br>• 包含 `settled` / `completed` / `放款` ➔ **已完结放款 (settled)** | 静态状态定性 | `core/case_folder/topology.py` |
| **第二级：物理子目录与文件证据**<br>*(交付物物理链)* | • 存在 `Settlement Statement.pdf` ➔ **已放款 (Settled)**<br>• 存在 `Approval/` 目录或 `Formal Approval.pdf` ➔ **已获批 (Approved)**<br>• 存在 `To be signed/` 合同 ➔ **待签合同 (Docs Issued)**<br>• 存在 `Send to Lender/` 打包材料 ➔ **已递交在审 (Submitted)**<br>• 仅有散落 ID/流水 ➔ **收集材料中 (Gathering)** | 推进阶段划分 | `core/case_folder/topology.py`<br>`core/checklist/matcher.py` |
| **第三级：.msg 邮件沟通时序终态**<br>*(通信黑匣子)* | • 最后一封邮件是 `Settlement Confirmation` ➔ **已放款**<br>• 最后一封邮件是 `Valuation Shortfall` / `Fee Not Paid` ➔ **暂停卡点**<br>• 最后一封邮件是 `MIR (补件通知)` ➔ **在审·待补件**<br>• 提取 Assessor（`Rachel Fonseka`）与案号（`23174`） | 动态卡点与审批官锁定 | `core/pipeline/msg_timeline.py` |
| **第四级：多案卷拓扑排序与推荐**<br>*(多轮重递择优)* | • 同客户名下排除 `withdrawn`/已结案案卷；<br>• 按 **【序号倒序 (Sequence Desc) ➔ 修改时间最新 ➔ 文件最全】** 排序；<br>• 第一名自动标记 `is_recommended_active = True` 并默认高亮预选。 | 活跃主案推荐 | `core/case_folder/topology.py` |

---

## 🛡️ 四、 Vera 绝对控制权与已在库排重闭环机制（Deduplication & Control）

在识别出的案卷中，系统严格遵循 **“AI 辅助识别，Vera 拥有最终裁决权”** 的闭环管理原则：

1. **Vera 自由勾选控制权**：
   - 扫描出的 1~N 个案卷卡片左侧均提供独立复选框（Checkbox）；
   - Vera 可以自由选择：**只导入当前活跃主案**、或**勾选多套房产案卷同时建档**、或**完全取消历史案卷**，决定权 100% 在 Vera 手中。
2. **已在库智能排重（Collision Detection）**：
   - 扫描时后端自动比对本地数据库中的已有路径（`folder_path`）；
   - 若某案卷已在工作台中建档运行，卡片右上方自动打上 `[🔵 已在库中进行 | Case ID: xxx]` 标识；
   - 该卡片默认取消勾选且防重复建档，彻底杜绝重复导入导致的脏数据！

---

## 🚦 五、 施工批次划分与当前状态

| 批次 | 核心任务 | 状态 | 交付文件 |
| :--- | :--- | :--- | :--- |
| **批次一 (WO-53)** | **目录拓扑 + 多案卷识别 + 状态定性 + 排重** | **已验收 ✅** | `core/case_folder/topology.py`<br>`FolderTopologyScanner.tsx` |
| **批次二 (WO-54)** | **标题快速匹配 + 清单秒级自动打勾** | **已验收 ✅** | `core/checklist/matcher.py`<br>`ChecklistPanel.tsx` |
| **批次三 (WO-55)** | **邮件时序提取 + 审批官/案号/卡点落库 + 时间线** | **已验收 ✅** | `core/pipeline/msg_timeline.py`<br>`CaseTimelinePanel.tsx` |
| **批次四 (WO-56)** | **新建建档交互重构 (全新建档为主 + 标准 11 目录脚手架)** | **已验收 ✅** | `core/case_engine/folder.py`<br>`NewCaseSheet.tsx` (精简至455行) |
