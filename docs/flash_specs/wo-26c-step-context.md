# WO-26c：StepContext 显式契约（runner 参数接线；WO-26 轻量执行器升级）

> 来源（Vera 定稿 2026-08-13）：确认"StepContext 显式契约"为独立小单——把 flow YAML 已声明但未接线的 `$arg.x / $case_id / $step.<output>` 真正解析；轻量回退路径同步参数校验。落地映射见 Agent架构演进_参考Pi与PrimeAgent.md §五 #3、§八。
> 前置：WO-26b（Pydantic AI 内核）验收通过后实施；接口契约、flow YAML 格式、chat 路由、前端全部不变。

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x；**无新依赖**
- 红线：PII 脱敏 / 只出草稿 / 白名单工具等红线不变；**不做隐式变量池**——每步输入输出必须在 flow YAML 中显式可见（金融可追溯）
- 不碰前端、不碰 chat.py 路由逻辑、不碰 flow YAML 内容（兼容现有 3 个流程包）
- 新代码文件 ≤200 行

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
| --- | --- | --- |
| `core/agents/runner.py` | 修改 | StepContext 解析（params 绑定 `$arg.x` / `$case_id` / `$step.<output>`）+ 步骤参数校验 + 多步 output 累积 |
| `tests/test_core/test_step_context.py` | **新建** | ≥10 用例 |

⚠️ 严禁修改：config/agent_flows/*.yaml（内容）、core/chat/loop.py、server/api/schemas.py、前端、core/agents/pai.py（26b 文件本单不碰）。

## 设计

- StepContext = 有序 dict：
  - `$arg.<field>` ← 路由传入 args；`$case_id` ← case_id；`$step.<output>` ← 前序步骤 output（按步骤顺序累积）
  - 参数缺失 / 未知字段 → 该步骤不执行、返回可读错误（与 26b 工具参数校验同语义）
- 每步执行后按 `output:` 名写入 StepContext
- 步骤结果仍写 internal 事件、仍返回 WO-26 契约 dict（reply / tool_cards / recorded_facts / presentation）
- PAI 路径（26b）走 RunContext[Deps]；本单只保证**轻量回退路径行为一致**

## 测试（tests/test_core/test_step_context.py，≥10）

1. 单步 flow：`$arg.files` 解析并传入工具
2. `$case_id` 注入
3. 多步：上一步 output 作为下一步输入（`$step.<output>`）
4. 参数缺失 → 步骤不执行、返回可读错误
5. 未知 `$arg` 字段 → 可读错误
6. 白名单外工具 → 跳过（WO-26 行为保持）
7. output 累积供后续步骤（顺序敏感）
8. 每步成功写 internal 事件（行为保持）
9. 返回 WO-26 契约 dict
10. PAI 返回 None 时轻量回退行为一致（三触发语回归）

## 验收标准（全量门禁）

- 专项 10 用例全绿；`pytest tests/ -q` → 最新基线（26b 验收后）+ 新增，0 failed / 0 skipped
- ruff（本单文件）→ All checks passed
- 三条触发语仍返回对应 flow 卡（result_card / dialog）——回归 WO-26 行为
- flow YAML / chat 路由 / schemas / 前端零改动（git diff 核对）

## 提交建议（一次）

```
git add core/agents/runner.py tests/test_core/test_step_context.py
git commit -m "feat: WO-26c StepContext 显式契约 — runner 解析 \$arg/\$case_id/\$step.output + 参数校验（多步流程地基）"
```

⚠️ 执行纪律：只改表内文件；不碰 26b 文件；每步验证。