---
name: flash-executor-spec
description: Use when writing implementation plans or prompts that will be executed by a smaller/weaker model (DeepSeek Flash, Gemini Flash, Claude Haiku, etc.) rather than by yourself. Prevents hallucination, scope creep, and directory chaos by enforcing a 5-dimension strict spec format.
---

# Flash Executor Spec — 防走样规划规范

## Overview

当规划者（Antigravity/Kiro 等顶尖模型）写出实施计划交给执行者（DeepSeek Flash/Mini 等轻量模型）执行时，执行者容易出现以下问题：
- **幻觉**：编造不存在的 API、凭空引入依赖
- **乱改目录**：在错误位置创建文件
- **自作主张**：重构计划外的代码、改变命名约定
- **遗漏**：忘记实现某些细节，跳过验证步骤

本 Skill 定义了一套"防走样"规划格式，将执行者的工作降维为**填空题**，最大程度消除偏差。

## When to Use

- 规划完成后，需要交给 DeepSeek Flash/Mini 或其他轻量模型执行
- 需要将复杂改动拆解为多个 Step 逐步喂给执行模型
- 执行模型的上下文窗口较小（< 128K tokens）
- 过去执行模型出现过"走样"问题

## When NOT to Use

- 自己执行自己的计划（直接用 executing-plans skill）
- 改动极小（单文件 < 20 行的改动直接写完整代码即可）

---

## 核心原则

```
规划者写得越精确，执行者犯错的空间越小。
把执行者当成一个只会严格照做的"高级搜索替换工具"来对待。
```

---

## 五维规范格式（必须全部包含）

### 维度 1：明确技术栈与依赖边界 (Tech Stack & Boundary)

在 Spec 开头显式声明：
- 语言版本
- 框架版本
- **禁止引入的内容**（新依赖、新模式、新目录）
- **只允许使用的库/工具**

```markdown
## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x
- 前端：TypeScript strict / React 18 / Vite
- 禁止：引入任何新的 pip/npm 依赖
- 禁止：创建计划外的文件或目录
- 禁止：修改任何不在本计划列出的文件
- 样式：使用项目现有 CSS 变量（var(--card-bg) 等），不用 Tailwind 以外的方案
```

---

### 维度 2：强类型接口与契约定义 (Strict Contracts)

不要只写"实现 XX 功能"，而是**直接给出完整的类型定义**和函数签名，让执行者只做填空。

**后端示例：**
```python
# 执行者只需要在这个签名内填写实现逻辑
def prefill_case_brain(case_id: str, raw_text: str, db: Session) -> None:
    """从邮件原文中 AI 提取客户目标，写入 Case.client_goal。
    
    Args:
        case_id: 案件 ID
        raw_text: 原始邮件文本
        db: SQLAlchemy session
    
    Raises:
        不抛异常，失败时 logger.warning 并静默返回
    """
    ...
```

**前端示例：**
```typescript
// 执行者只需按此 interface 实现组件
interface NewCaseFormFields {
  clientGoal: string;          // textarea, placeholder: "例：首次购房..."
  specialCircumstances: string; // textarea, placeholder: "例：父母赠予..."
}

// API 请求体新增字段（追加到现有 body，不替换）
interface CreateCaseRequestPatch {
  client_goal?: string;
  special_circumstances?: string;
}
```

---

### 维度 3：原子化任务拆解 (Atomic Task Checklist)

每个 Step 只做**一件事**。每个 Step 包含：
- 要修改/创建的**精确文件路径**
- **具体的改动描述**（在第 X 行之后插入 / 在 Y 函数中添加参数）
- 该 Step 的**验证命令**

```markdown
### Step 1：后端接收参数
- [ ] 文件：`server/routes/cases.py`
- [ ] 找到 `class CreateCaseRequest(BaseModel):` （约 L28）
- [ ] 在最后一个字段之后新增 2 行：
  ```python
  client_goal: str | None = None
  special_circumstances: str | None = None
  ```
- [ ] 找到 `new_case = Case(` （约 L85）
- [ ] 在构造参数中新增 2 行：
  ```python
  client_goal=req.client_goal,
  special_circumstances=req.special_circumstances,
  ```
- [ ] 验证：`pytest tests/test_cases.py -x` 通过

### Step 2：前端表单
- [ ] 文件：`Vera-Frontend/src/components/NewCase.tsx`
- [ ] 在 state 声明区（约 L38-50）新增：
  ```typescript
  const [clientGoal, setClientGoal] = useState('');
  const [specialCircumstances, setSpecialCircumstances] = useState('');
  ```
- [ ] ...（继续拆解）
```

---

### 维度 4：固化文件路径与锚点 (File Anchors)

**必须包含一个"改动清单表"，精确到文件和行号范围：**

```markdown
## 本次改动范围（严禁超出）

| 文件 | 操作 | 锚点位置 |
|------|------|---------|
| `server/routes/cases.py` | 修改 | L28 CreateCaseRequest + L85 Case() |
| `Vera-Frontend/src/components/NewCase.tsx` | 修改 | L38-50 state + L420 表单区域 |
| `tests/test_new_case_fields.py` | 新建 | — |

⚠️ 严禁修改上表以外的任何文件。
⚠️ 严禁重命名、移动或删除任何现有文件。
⚠️ 严禁修改 import 以外的现有代码逻辑（除非本计划明确要求）。
```

---

### 维度 5：可校验的验收标准 (Definition of Done)

给出**具体的输入/输出示例**和**可执行的验证命令**：

```markdown
## 验收标准

### 自动验证（必须全部通过）
- `npx tsc --noEmit` → 零错误
- `pytest tests/ -x` → 全绿
- `ruff check server/ shared/` → 零 warning

### 手动验证
1. 浏览器打开 http://localhost:3000 → 点击"新建案件"
2. 表单中出现"客户目标"和"特殊情况"两个 textarea
3. 填写内容后提交 → 案件创建成功
4. 打开该案件 → 点击 🧠 → Drawer 中显示刚才填写的客户目标

### 输入输出示例
- POST /api/cases 请求体包含 `"client_goal": "首次购房 80万"` → 返回 201
- GET /api/cases/{id}/brain → 返回 JSON 中 clientGoal = "首次购房 80万"
```

---

## 完整 Spec 模板

```markdown
# [任务名称] — 执行规范

## 技术约束
- [语言/框架/版本]
- 禁止：[明确列出]
- 只允许使用：[明确列出]

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| ... | 修改/新建 | Lxx |

## 接口契约

[给出完整的类型定义/函数签名]

## 实施步骤

### Step 1：[标题]
- [ ] 文件：[精确路径]
- [ ] 改动：[具体描述，含行号/函数名/类名]
- [ ] 验证：[命令]

### Step 2：[标题]
...

## 验收标准

### 自动验证
- [命令] → [预期结果]

### 手动验证
- [操作步骤] → [预期结果]

---
⚠️ 执行约束：
- 严格按照上述 Spec 中的接口与路径编写代码
- 不要擅自增加未列出的依赖或重构其他模块
- 不要修改改动范围表以外的文件
- 每完成一个 Step 就停下来运行验证命令
- 如果验证失败，先报告错误，不要自作主张修复计划外的代码
```

---

## 协作工作流

```
┌─────────────────────────────────────────────────────────┐
│  Antigravity/Kiro（规划者）                              │
│                                                         │
│  1. 分析需求 + 读懂现有代码                              │
│  2. 按五维格式输出 Strict Spec                          │
│  3. 交付给执行模型                                       │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  DeepSeek Flash（执行者）                                │
│                                                         │
│  4. 逐 Step 执行，每步后运行验证命令                      │
│  5. 遇到问题停下来报告，不自作主张                        │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  Antigravity/Kiro（检查者）                              │
│                                                         │
│  6. 核对验收标准是否全部通过                              │
│  7. 发现偏差 → 出具补丁 Spec（同样五维格式）              │
│  8. 无偏差 → 确认完成，git commit                        │
└─────────────────────────────────────────────────────────┘
```

---

## 常见走样问题 & 对策

| 走样类型 | 症状 | 在 Spec 中如何预防 |
|---------|------|------------------|
| 幻觉依赖 | 执行者 import 了不存在的库 | 维度 1 明确"禁止引入新依赖" |
| 乱建文件 | 在错误目录创建了 helper.ts | 维度 4 改动清单表 + "严禁超出" |
| 接口走样 | 函数签名跟计划不一致 | 维度 2 给出完整签名，执行者只填空 |
| 过度重构 | 改了一堆不相关的代码 | 维度 4 "严禁修改表外文件" |
| 跳过验证 | 没跑测试就说完成了 | 维度 5 每个 Step 自带验证命令 |
| 命名走样 | 变量名/字段名跟计划不一致 | 维度 2 契约中写死所有命名 |

---

## 给执行者的"安全提示词"（附在每个 Spec 末尾）

```
⚠️ 执行纪律（每一条都必须遵守）：
1. 只修改"改动范围"表中列出的文件，绝不碰其他文件
2. 所有变量名/函数名/字段名严格按照"接口契约"章节的定义，一个字符都不能改
3. 每完成一个 Step 立即运行该 Step 的验证命令
4. 如果验证失败，停下来报告错误内容，不要自己尝试修复计划外的代码
5. 不要引入任何"技术约束"章节中未列出的依赖库
6. 不要创建任何"改动范围"表中未列出的新文件
7. 不要重构、优化、美化任何计划外的代码
```
