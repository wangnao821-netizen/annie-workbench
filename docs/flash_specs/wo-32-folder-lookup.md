# WO-32：按需自主取（三档渐进第 2 档）

> 来源：主文档 §十三 V2 定稿第 2 档——Vera 指定 → AI 去案件文件夹检索/解析具体文件（**不主动翻旧账、不主动扫全量**）。
> 前置：WO-29（Case.folder_path）。执行方：待定。检查方：Codex。

## 技术约束
- 只读：检索/解析均只读（PathGuard.assert_read_allowed 校验）；不主动枚举全量目录树（按 Vera 指定的关键词/类型/路径提示过滤）
- 解析复用现有 parse-file/parse-text（WO-18），输出脱敏摘要；PII 红线不变
- 无 folder_path → 可读错误；路径穿越拒绝
- 新流程包 `folder_lookup`（presentation=result_card）；白名单 + runner + PAI 三处同步（保持白名单一致）
- 新代码文件 ≤200 行

## 改动范围（严禁超出）
| 文件 | 操作 | 锚点 |
| core/case_folder/lookup.py | **新建** | lookup_files(case, query, client_root) -> list[dict]（元数据：rel_path/size/mtime/doc_type）；parse_one(case, rel_path, db)（脱敏摘要） |
| core/case_folder/__init__.py | 修改 | 导出 lookup |
| core/agents/flows.py | 修改 | 白名单 + folder_lookup |
| core/agents/runner.py | 修改 | folder_lookup 分支（StepContext 参数透传） |
| core/agents/pai.py | 修改 | +_folder_lookup 工具（保持 ≤200 行） |
| config/agent_flows/folder_lookup.yaml | **新建** | triggers：["去文件夹找", "找一下文件", "folder lookup", "在案件文件夹里找"]；params {query: "$arg.query"} |
| tests/test_core/test_folder_lookup.py | **新建** | ≥8 用例 |

⚠️ 严禁修改：core/chat/loop.py、core/models/orm.py、前端 ui/。

## 测试（≥8）
1. 按文件名关键词检索命中（tmp 案件文件夹造文件）
2. 路径穿越/越界（query 含 `..`）→ 可读错误
3. 无 folder_path → 可读错误
4. 只读断言：检索后文件 mtime/内容不变
5. parse_one 返回脱敏摘要（monkeypatch 解析器）
6. 三触发语"去案件文件夹找 payslip"→ folder_lookup 流程包命中
7. 白名单三处一致（flows/runner/pai）
8. 返回 WO-26 契约（result_card）

## 验收标准
- 专项全绿；`pytest tests/ -q` → 876 基线 + 新增；ruff；前端零改动

## 提交建议
git add core/case_folder/lookup.py core/case_folder/__init__.py core/agents/flows.py core/agents/runner.py core/agents/pai.py config/agent_flows/folder_lookup.yaml tests/test_core/test_folder_lookup.py docs/flash_specs/wo-32-folder-lookup.md
git commit -m "feat: WO-32 按需自主取 — Vera 指定后 AI 只读检索/解析案件文件夹内文件（folder_lookup 流程包）"