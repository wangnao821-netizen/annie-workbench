# Vera 工作台 — 案件文件夹智能解析与建档总实施框架

本文档结合 **Vera 工作台前后端现有架构** 与真实客户案卷（如 `Yingkun CHEN`）的业务实践，将**「一客户多案件识别 + 核心文档深度解析 + 标题快速匹配打勾 + 邮件时序与卡点定性」**提炼为完整落地的工程化实施框架。

---

## 🏗️ 一、 核心领域模型（Domain & Hierarchy）

在澳洲贷款业务实践中，客户与案卷的关系是**“一对多”的拓扑层级**：

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
- **案件（Case）**：每个带序号的子文件夹对应数据库中的一个独立 `Case` 实例（独立 `case_id`、独立的材料清单 `Checklist`、独立的文件夹路径 `folder_path`、独立的审批阶段与状态）。

---

## ⚙️ 二、 数据流转与四层解析中枢架构

```mermaid
flowchart TD
    A["选择客户根目录 (D:\...\Yingkun CHEN)"] --> L0["Layer 0: 目录拓扑与多案卷识别引擎"]
    
    L0 -->|1. 提取客户名| C_Name["Client Name: Yingkun CHEN"]
    L0 -->|2. 递归发现 1~8 号子目录| C_List["案卷列表 (按房产分组)"]
    L0 -->|3. 解析目录名标签| C_Meta["解析 Lender / 房产 / AltDoc / 状态(Withdrawn/Onhold)"]
    L0 -->|4. 智能推荐| C_Active["默认锁定最新活跃案卷 (8号 ORDE)"]
    
    C_Active --> UI_Select{"用户确认导入 (单选主案 / 多选多房产)"}
    
    UI_Select --> L1["Layer 1: 核心事实深度提取 (Deep Fact)"]
    UI_Select --> L2["Layer 2: 标题规则极速打勾 (Fast Match)"]
    UI_Select --> L3["Layer 3: 邮件时序与卡点引擎 (Email Timeline)"]
    
    L1 -->|Broker Notes & 估价报告| F1["提取：自雇收入/ABN/贷款结构/原债务/实际估价值($1.9M)"]
    L2 -->|别名规则库扫描| F2["ID/流水/地税单/声明信 ➔ 清单项自动打勾 (received) + 文件绑定"]
    L3 -->|.msg 邮件时序图谱| F3["提取：案号(23174)/审批官(Rachel)/估价缺口/申诉复议事件"]
    
    F1 & F2 & F3 --> DB[("案件全景落库: Case + Checklist + Facts + Timeline Events")]
```

---

### 🔍 Layer 0: 目录拓扑与多案卷识别引擎 (`core/case_folder/topology.py`)
1. **客户主体识别**：取客户根目录文件夹名称（如 `Yingkun CHEN`）。
2. **多案卷解析正则（Folder Name Regex）**：
   - 提取序号：`^(\d+)\.\s*`
   - 提取重递标记：`Resub\s*-\s*`
   - 提取业务类型：`Refinance & cash out` / `Purchase` / `Commercial`
   - 提取目标机构（Lender）：`ORDE` / `Zank Financial` / `Brighten` / `Latrobe`
   - 提取房产地址：`84 Louis Street, Granville NSW 2142`
   - 提取方案类型：`(Alt Doc)` / `(Lite Doc)` / `(Full Doc)`
   - 提取显式状态与卡点：`Withdrawn`（撤回）、`onhold due to poor val`（估值低暂停）、`Val Fees Not Paid`（欠费暂停）、`onhold due to conflict`（冲突暂停）。
3. **案卷分组与活跃度排序**：按房产地址聚合，同房产下按序号最大、修改时间最新、非 Withdrawn 状态排在最前作为推荐默认案卷。

---

### 📄 Layer 1: 核心事实深度抽取 (`core/facts/prefill.py`)
只针对极少数核心文档做深度阅读，精准提取数值与文字事实，写入 `brain_facts` 及 `Case`：
1. **`Broker Notes.docx/pdf`**（优先解析）：
   - 借款人与公司画像：自雇公司 `J & Q CONSTRUCTION PTY LTD`、ABN、行业 `Landscaping`、年应税收入 `$492,865`、婚姻与身份（Single, PR）。
   - 贷款结构：`Prime Alt Doc OO P&I`、利率 `6.89%`、金额 `$1,840,000`、LVR `80%`、年限 `30`。
   - 原贷款负债（待结清）：`Zank Financial` 房贷余额 `$1,662,172.83`、信用卡 `$1,000`。
   - 特殊策略（Admin Notes）：隔离历史关联人信息、指定会计师 `Xiaoli YANG`。
2. **`Property Val - *.pdf`**（估价报告）：
   - 提取实际估价值（如 `$1,900,000`），与预期估值（`$2,300,000`）形成事实对比，计算额度缺口。
3. **`Application Summary.pdf`**：
   - 提取递交申请表上的平台案号与递交明细。

---

### ⚡ Layer 2: 标题规则极速打勾引擎 (`core/checklist/matcher.py`)
无需昂贵 OCR 与 LLM，直接利用**别名规则库 + 目录优先级**对支持性材料毫秒级打勾并绑定文件：

```python
CHECKLIST_ALIAS_MAP = {
    # 身份证明类
    "driver_licence": ["dl", "driver license", "driver licence", "驾照"],
    "passport": ["passport", "护照"],
    "visa_vevo": ["visa", "vevo", "155", "189", "190", "500", "820", "801", "签证"],
    "voi": ["voi", "id voi", "verification of identity"],
    "credit_consent": ["credit_check", "client_consent", "privacy consent", "征信授权"],
    
    # 资产与负债类
    "council_rates": ["rate notice", "rates notice", "council rate", "地税", "市政费"],
    "home_loan_statement": ["liability hl", "loan statement", "mortgage statement", "hl 流水", "房贷流水"],
    "credit_card_statement": ["credit card", "cc statement", "信用卡流水"],
    
    # 自雇与收入类
    "se_declaration": ["se declaration", "self certified", "income declaration", "自雇声明"],
    "accountant_letter": ["accountant", "cpa letter", "会计信", "会计师声明"],
    "company_search": ["company search", "asic search", "abn lookup", "公司查册"],
    
    # 估价与建议书
    "valuation_report": ["property val", "valuation report", "估价报告"],
    "soca": ["soca", "credit advice", "statement of credit advice"],
}
```

- **执行逻辑**：
  1. 遍历案卷的 `Send to Lender/`、`To be signed/`、`Valuation/` 等目录；
  2. 匹配命中的文件自动登记进 `processed_files`（`CaseFile`）；
  3. 将对应清单项的 `CaseChecklist.status` 置为 `"received"`，并将 `file_id` 填入 `received_file_ids`；
  4. 瞬间完成全案 90%+ 材料的打勾闭环。

---

### 📬 Layer 3: 邮件时序与卡点提炼引擎 (`core/pipeline/msg_timeline.py`)
扫描案卷内的所有 `.msg` 邮件文件，提取时序与关键业务动态：
1. **邮件时序提取**：
   - 提取 `date`、`sender`、`subject`、`body`。
   - 正则提取审批官：从 `apps@orde.com.au` 或个人域邮件识别 `assigned to Rachel Fonseka for assessment` ➔ 提取审批官 `Rachel Fonseka`。
   - 正则提取案号：识别 `23174 (EX 11199)` ➔ 写入 `Case.lender_ref`。
   - 识别关键动作：补件（MIR）、估价加价、估价低阻断（Valuation Shortfall $1.9M）、复议（Reassessment / Argument Letter）。
2. **落库与时间线呈现**：
   - 写入 `CaseContextEvent`（双轨内线），触发自动蒸馏到 `Case.context_summary`。
   - 生成结构化时间线数组，供前端详情页时间轴组件直观渲染。

---

## 🔌 三、 前后端 API 契约设计

### 1. `POST /api/cases/folder-topology/scan`
- **入参**：`{"folder_path": "D:\\EverStones_Test_Clients\\Yingkun CHEN"}`
- **返回**：
```json
{
  "ok": true,
  "client_name": "Yingkun CHEN",
  "client_root": "D:\\EverStones_Test_Clients\\Yingkun CHEN",
  "cases": [
    {
      "dir_name": "8. Refi & cash - ORDE小号 - 84 Louis St (Alt doc) - onhold due to poor val",
      "folder_path": "D:\\...\\8. Refi & cash - ORDE小号...",
      "sequence": 8,
      "is_resub": true,
      "property_address": "84 Louis Street, Granville NSW 2142",
      "lender": "ORDE",
      "loan_type": "Refinance & cash out",
      "doc_type": "Alt Doc",
      "status": "onhold",
      "onhold_reason": "估价过低阻断 ($1.9M vs 期望 $2.3M)，复议中",
      "is_recommended_active": true,
      "has_broker_notes": true,
      "file_count": 28
    },
    {
      "dir_name": "2. Resub ... - Zank Financial - ... - Withdrawn",
      "folder_path": "D:\\...\\2. Resub...",
      "sequence": 2,
      "is_resub": true,
      "property_address": "84 Louis Street, Granville NSW 2142",
      "lender": "Zank Financial",
      "loan_type": "Refinance & cash out",
      "doc_type": "Full Doc",
      "status": "withdrawn",
      "onhold_reason": null,
      "is_recommended_active": false,
      "has_broker_notes": false,
      "file_count": 12
    }
  ]
}
```

### 2. `POST /api/cases/topology-import/batch`
- **入参**：选择要建档的案卷列表（含推荐的画像预填数据与指定关联路径）。
- **执行**：批量创建 `Case` ➜ 触发 Layer 1 事实落库 ➜ 触发 Layer 2 标题打勾 ➜ 触发 Layer 3 邮件时序落库。
- **返回**：创建成功的 `case_id` 列表及各案卷初始化状态。

### 3. `GET /api/cases/{case_id}/timeline`
- **返回**：该案卷从创建、递交、补件、审批官指派、估价报告下发、到申诉复议的完整时序事件列表。

---

## 🖥️ 四、 前端交互与视觉改造规划（AI Studio）

1. **存量客户导入弹窗（`ImportLegacyModal.tsx`）升级**：
   - 顶部展示识别出的 **客户主体（Client: Yingkun CHEN）**。
   - 中间以卡片组展示该客户名下的 **所有案卷列表（按房产分组）**，带上序号、银行徽标、房产地址、状态标签（🟢 活跃推荐 / 🟡 暂停中 / ⚪ 已撤回）。
   - 默认选中最新活跃案卷，支持勾选多个案卷**一键批量建档**。

2. **案件详情页概览头部（`CaseOverview`）增强**：
   - 展示机构与案号：`ORDE Financial · 案号: 23174 (EX 11199)`。
   - 展示当前审批官：`信贷审批官: Rachel Fonseka`。
   - 突出卡点报警横幅：`⚠️ 案件暂停中：估价过低 ($1.90M vs 期望 $2.30M)，复议中`。

3. **材料清单面板（`CaseChecklist`）增强**：
   - 打勾项旁边展示绿色小徽标：`[已自动匹配: ID DL.pdf]`。
   - 点击可直接调用 Electron 原生接口在本地资源管理器定位或打开该文件。

4. **新增「案件动态时间线」面板（`CaseTimelinePanel.tsx`）**：
   - 垂直时间轴展示 `.msg` 邮件往来历史与里程碑流转。

---

## 🚦 五、 施工批次划分与推进路线

| 批次 | 核心任务 | 后端施工单（`docs/flash_specs/`） | 前端提示词（AI Studio） |
| :--- | :--- | :--- | :--- |
| **批次一 (WO-53)** | **目录拓扑 + 多案卷识别 + 状态定性** | `wo-53-folder-topology-scanner.md` | **提示词 P1**：存量导入弹窗多案卷卡片与批量建案 |
| **批次二 (WO-54)** | **标题快速匹配 + 清单秒级自动打勾** | `wo-54-checklist-title-matcher.md` | **提示词 P2**：清单面板已匹配文件徽标与一键打开 |
| **批次三 (WO-55)** | **邮件时序提取 + 审批官/案号/卡点落库 + 时间线** | `wo-55-msg-timeline-extractor.md` | **提示词 P3**：案件概览卡点展示与动态时间线面板 |
