# WO-31：新文件自动发现（三档渐进第 1 档）

> 来源：主文档 §十三 V2 定稿三档渐进第 1 档——监听已关联案件文件夹，新文件自动识别类型 → 提醒"材料到了"；高置信自动匹配清单项"已收"（**可撤销**）。
> 前置：WO-29（Case.folder_path 关联落库）。执行方：待定（Codex 或 Gemini）。检查方：Codex。

## 技术约束
- 只读红线：扫描只读文件系统（不写、不改名、不移动客户文件）；匹配清单项"已收"是可撤销闭环（复用 confirm/revoke）
- 扫描范围：仅 `Case.folder_path` 非空的案件；每档独立开关 `case_folder.auto_discover.enabled`（默认 false，Vera 开启后生效）
- V1 识别：文件名 + 扩展名 + 大小（不 OCR 全文）；置信度 < 阈值 → 仅提醒不自动匹配
- 去重：新增 `case_folder_files` 记录表；同一 rel_path 不重复提醒
- 提醒：写 FileEvent + SseManager.publish（前端通知后续 F 批次）
- 新代码文件 ≤200 行；batch 迁移

## 改动范围（严禁超出）
| 文件 | 操作 | 锚点 |
| core/case_folder/discovery.py | **新建** | scan_case_folders / classify_file / auto_match / 去重 |
| core/case_folder/__init__.py | **新建** | 空包 |
| core/models/orm.py | 修改 | +CaseFolderFile 表 |
| core/migrations/versions/xxx_add_case_folder_file.py | **新建** | case_folder_files（case_id, rel_path, doc_type, confidence, matched_checklist_id, status: pending\|matched\|revoked, discovered_at, unique(case_id, rel_path)） |
| core/scheduler/jobs.py | 修改 | +discover_job（按 scheduler.case_folder 配置周期注册） |
| core/config.py + config/settings.yaml | 修改 | +case_folder.auto_discover（enabled/interval_minutes/confidence_threshold） |
| server/api/files.py | 修改 | +POST /api/cases/{id}/folder-files/{file_id}/revoke（撤销自动匹配，复用 revoke_checklist_item） |
| tests/test_core/test_folder_discovery.py | **新建** | ≥8 用例 |

⚠️ 严禁修改：config/agent_flows/*.yaml、core/chat/loop.py、前端 ui/。

## 测试（≥8）
1. 扫描发现新文件并写 case_folder_files（去重：二次扫描不重复）
2. 高置信（≥阈值）→ 自动匹配清单项"已收"（CaseChecklist 状态变化 + matched_checklist_id 落库）
3. 低置信 → 仅提醒（pending），不自动匹配
4. 撤销自动匹配 → 清单项恢复 + status=revoked（闭环）
5. 无 folder_path 案件跳过
6. 开关关闭 → 不扫描
7. 非法扩展名/未知类型 → pending 不匹配
8. SSE publish 被调用（monkeypatch SseManager.publish 断言 event）

## 验收标准
- 专项全绿；`pytest tests/ -q` → 876 基线 + 新增，0 failed / 0 skipped
- ruff（本单文件）→ All checks passed；alembic upgrade head 成功
- TestClient：发现→匹配→撤销链路实测；前端零改动

## 提交建议
git add core/case_folder/ core/models/orm.py core/migrations/versions/xxx_add_case_folder_file.py core/scheduler/jobs.py core/config.py config/settings.yaml server/api/files.py tests/test_core/test_folder_discovery.py docs/flash_specs/wo-31-folder-discovery.md
git commit -m "feat: WO-31 新文件自动发现 — 扫描已关联案件文件夹 + 高置信自动匹配清单已收（可撤销）+ SSE 提醒"