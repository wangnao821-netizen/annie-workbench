# WO-33：主动预判（三档渐进第 3 档）

> 来源：主文档 §十三 V2 定稿第 3 档——AI 主动发现缺口（缺材料/材料与申报对不上）→ 提醒 + 建议（产物仍为草稿/清单，Vera 拍板）。
> 前置：WO-29 + WO-31（材料"已收"清单）。执行方：待定。检查方：Codex。

## 技术约束
- 只出建议：不自动改清单状态、不自动推进度；产物 = 结果卡 + 建议进 Action Inbox（草稿）
- 缺口口径：期望清单（master_picker 预选）vs CaseChecklist 已收 vs 案件文件夹已发现材料
- 申报一致性提示：复用 WO-20 规则引擎做只读比对（不扫未关联目录）
- 触发：Vera 问（流程包 gap_analysis）或定时（开关 `case_folder.auto_gap.enabled`，默认 false）
- 新代码文件 ≤200 行

## 改动范围（严禁超出）
| 文件 | 操作 | 锚点 |
| core/case_folder/gap_analysis.py | **新建** | analyze_gaps(case, db) -> {missing[], matched[], suggestions[]}；build_suggestion（草稿文案） |
| core/agents/flows.py | 修改 | 白名单 + gap_analysis |
| core/agents/runner.py + pai.py | 修改 | gap_analysis 分支/工具（PAI 同步） |
| config/agent_flows/gap_analysis.yaml | **新建** | triggers：["缺什么材料", "材料缺口", "主动预判", "gap analysis"] |
| core/scheduler/jobs.py + core/config.py + config/settings.yaml | 修改 | +case_folder.auto_gap（enabled/interval_hours） |
| tests/test_core/test_folder_gap.py | **新建** | ≥8 用例 |

⚠️ 严禁修改：core/chat/loop.py、core/models/orm.py、前端 ui/。

## 测试（≥8）
1. 缺材料检测：期望项未收 → missing 列表
2. 已收材料不报缺口
3. 建议为草稿/只读：调用后清单状态不变（无副作用断言）
4. 无 folder_path 案件跳过
5. 开关关闭 → 不触发
6. 申报一致性提示复用（monkeypatch declaration_check 返回 findings → suggestions 含提示）
7. 三触发语"看看还缺什么材料"→ gap_analysis 命中
8. 返回 WO-26 契约（result_card + suggestions）

## 验收标准
- 专项全绿；`pytest tests/ -q` → 876 基线 + 新增；ruff；前端零改动

## 提交建议
git add core/case_folder/gap_analysis.py core/agents/flows.py core/agents/runner.py core/agents/pai.py config/agent_flows/gap_analysis.yaml core/scheduler/jobs.py core/config.py config/settings.yaml tests/test_core/test_folder_gap.py docs/flash_specs/wo-33-gap-analysis.md
git commit -m "feat: WO-33 主动预判 — 清单/文件夹缺口分析 + 建议草稿（Vera 拍板，不自动改状态）"