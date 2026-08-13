# 发布流程（release_workflow）

> 适用于 vera-workbench 本地单机发布。前端由 Google AI Studio 线交付（ui/vera-工作台 (N)），后端由 opencode/Codex 施工。

## 发布前检查（门禁）

1. **全量测试**：`python -m pytest tests/ -q` → 0 failed / 0 skipped
2. **ruff**：`python -m ruff check core/ server/ tools/`（本单文件）→ All checks passed
3. **迁移**：`python -m alembic upgrade head` → current = head；`python -m tools.migrate_lender_keys --dry-run` → 全 0
4. **启动自检**：`python run_backend.py` 能起，`/api/health` config_ok=true
5. **端到端联调**：按 docs/e2e_checklist.md 走一遍（建案/任务/SSE/草稿/通知/计算器/申报检查/能力中心）

## 版本号三处同步

- `pyproject.toml` → `version`
- `server/main.py` → `APP_VERSION`（启动/健康使用）
- `server/api/admin.py` → `/api/version` 返回的硬编码版本（必须与 APP_VERSION 一致）
- `ui/vera-工作台 (N)/package.json` → `version`（前端线，随 AI Studio 交付同步）

## 发布步骤

1. 版本号三处同步 + CHANGELOG 追加条目
2. 跑全部门禁（见上）
3. 提交：`git commit -m "release: vX.Y.Z — 描述"`
4. 打标签：`git tag vX.Y.Z`
5. 前端：AI Studio 交付最新文件夹后，把 `ui/vera-工作台 (N)` 作为当前前端版本基线（不入 git；由用户侧管理）

## 红线提醒

- `data/`、`.env` 绝不提交 git
- 客户文件/ PII 不进入任何外部 API（脱敏闸门）
- AI 只出草稿，发送/递交必须 Vera 确认
