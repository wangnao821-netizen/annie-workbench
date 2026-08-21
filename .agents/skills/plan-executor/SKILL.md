---
name: plan-executor
description: >-
  Monitors docs/flash_specs/ for new Flash Spec execution plans,
  reads them aloud to Vera, asks for authorization to execute, then runs each
  step. Implements the "铁律开发流程" from AGENTS.md: 深查根因 → 沟通授权 → 执行.
compatibility: Requires filesystem read access to docs/flash_specs/ and project tree. Writes follow project rules (AGENTS.md Red Lines, PathGuard). Tracks state in data/.executed_plans.json (gitignored).
metadata:
  version: "1.0.0"
  category: workflow-automation
---

# 施工计划执行器 — Plan Executor

每次载入此 skill，按以下流程执行。

---

## Step 1：扫描新计划

- 扫描 `docs/flash_specs/` 中所有 `*.md` 文件（不含子目录）
- 读取 `data/.executed_plans.json`（不存在则创建空 `{}`），格式：
  ```json
  {
    "docs/phase4_plan.md": {
      "status": "completed",
      "completed_at": "2026-07-27T12:00:00",
      "steps_total": 5,
      "steps_done": 5
    },
    "docs/phase_next1_plan.md": {
      "status": "pending",
      "completed_at": null,
      "steps_total": 3,
      "steps_done": 0
    }
  }
  ```
- 将 plan 分为三组：
  - **🆕 新计划** — 不在 tracking 中，或 `status == "pending"`
  - **✅ 已完成** — `status == "completed"`
  - **❌ 失败/取消** — `status == "cancelled"`
- 如无新计划，汇报后结束。

> **注意**：`data/` 已 gitignore，不会泄漏执行记录。

---

## Step 2：读取并摘要

对每个新计划：

1. 读取全文
2. 检查是否符合 [flash-executor-spec](file:///d:/loan-assistant/.agents/skills/flash-executor-spec/SKILL.md) 的 **5 维结构**：
   - 维度 1：明确技术栈与依赖边界
   - 维度 2：强类型接口与契约定义
   - 维度 3：原子化任务拆解
   - 维度 4：固化文件路径与锚点
   - 维度 5：可校验的验收标准
3. 向 Vera 输出摘要（格式见下文）

---

## Step 3：请求授权

以如下格式向 Vera 汇报并询问：

```
━━━ 施工计划：{文件名} ━━━

🎯 目标：{从 Spec 标题/描述中提取}
🔧 技术约束：{维度 1 摘录}
📐 接口契约：{维度 2 关键签名}
📋 改动范围：{维度 4 文件清单}
🔢 实施步骤：{N} 步
🏷  步骤列表：
  1. {步骤 1 标题}
  2. {步骤 2 标题}
  ...

✔️ 验收标准：
  - {标准 1}
  - {标准 2}
  ...

━━━━━━━━━━━━━━━━━━━━
是否需要我按此计划开工？ (y/N)
```

等待 Vera 明确答复 `y` 后方可继续。

同时可以有多个新计划，让 Vera 选择先执行哪一个。

---

## Step 4：按步执行

Vera 确认后：

1. **契约先行** — 重读计划中的组件详细设计，确认接口、命名、边界
2. 按 **实施步骤总结** 的顺序逐一执行
3. 每步完成后运行该步的验证命令（计划中有指定）或全量 `pytest`/`npx tsc --noEmit`
4. 每步完成后更新 tracking：
   ```json
   {
     "docs/xxx_plan.md": {
       "status": "in_progress",
       "current_step": 2,
       ...
     }
   }
   ```
5. 如果某步失败：
   - 停下来向 Vera 汇报错误
   - 按 [systematic-debugging](file:///d:/loan-assistant/.agents/skills/systematic-debugging/SKILL.md) 排查（如存在）
   - 不擅自修复计划外的代码
6. 如需执行多步，每步执行前先简要向 Vera 说明即将做什么

**开发纪律（必须遵守）：**

- 遵循 AGENTS.md 所有规则（Red Lines、PathGuard、PII 脱敏等）
- 遵循 [test-driven-development](file:///d:/loan-assistant/.agents/skills/test-driven-development/SKILL.md)（如存在）— 测试先行
- 遵循 [verification-before-completion](file:///d:/loan-assistant/.agents/skills/verification-before-completion/SKILL.md)（如存在）— 交付前验证
- 遵循 [flash-executor-spec](file:///d:/loan-assistant/.agents/skills/flash-executor-spec/SKILL.md)（如存在）— 如需子 agent 执行复杂步骤
- **施工单纪律**：一单只做一件事，单元闭环，验收后再开下一单
- 完成有意义的阶段后直接 `git commit`
- 不积压技术债 — 完成一个组件后立即运行 lint + test + typecheck

---

## Step 5：收尾

- 全部步骤完成后，设置 `status: "completed"`
- 运行全量门禁：
  - `pytest` 全绿
  - `ruff check .`
  - `npx tsc --noEmit`（如涉及前端）
  - `npm run build`（如涉及前端）
- 更新 `CHANGELOG.md`
- 提交 commit + tag（如果 Vera 要求）

---

## 最终汇报格式

```
━━━ 施工完成：{文件名} ━━━

✅ 状态：全部完成
📊 步骤：{N}/{N}
🧪 测试：{passed/failed}
🔖 提交：{commit hash / tag}
⚠️ 遗留问题：
  - {技术债追踪中的 TODO 项}
  - {未解决的 warning}

━━━━━━━━━━━━━━━━━━━━
```

---

## 参考

- 计划文件夹：`docs/flash_specs/`
- 计划命名规范：Flash Spec 格式（参见 [flash-executor-spec](file:///d:/loan-assistant/.agents/skills/flash-executor-spec/SKILL.md)）
- 执行状态文件：`data/.executed_plans.json`
- 项目规则：[AGENTS.md](file:///d:/loan-assistant/AGENTS.md)
- 更多执行细节：[flash-executor-spec](file:///d:/loan-assistant/.agents/skills/flash-executor-spec/SKILL.md)
