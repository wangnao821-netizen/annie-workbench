# Vera Workbench — CASE 大脑（AI First 贷款经纪工作台）

面向澳洲贷款经纪人的 AI 优先工作台：对话即入口，案件上下文（BrainFact + 向量语义记忆）驱动 AI 建议；工具包（申报一致性检查、计算器、政策库、银行主数据）按需接入。

## 技术栈

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / SQLite（core/data/assistant.db）/ APScheduler / sqlite-vec + fastembed（本地 BGE 语义检索）
- 前端：TypeScript / React / Vite / Tailwind（AI Studio 线维护，见 ui/vera-工作台 (N)）
- 规则配置：YAML（bank_registry / lender_policies / checklist_master / agents / calculator / industry_seed）

## 快速开始（后端）

1. 复制 `.env.example` 为 `.env`，填写 `CLIENT_FILES_ROOT`（客户文件根）、`DEEPSEEK_API_KEY`、`GEMINI_API_KEY`
2. 安装依赖：`python -m pip install -e .`（或 `uv sync`）
3. 启动：`python run_backend.py`（默认 0.0.0.0:8000，自动加载 .env、启动前检查配置）
4. 健康检查：`http://localhost:8000/api/health`（含 config_ok / missing_config）

前端开发：`cd ui/vera-工作台 (N) && npm install && npm run dev`（VITE_API_URL 指向后端，VITE_USE_MOCK=false）。

## 目录结构

- `core/` — 业务核心（案件/记忆/清单/计算器/策略/调度/脱敏）
- `server/` — FastAPI 路由与 schema
- `config/` — YAML 规则配置（单一真源）
- `tools/` — 离线脚本（迁移/重建向量）
- `docs/` — 主文档 / BACKLOG / 施工单（flash_specs）/ 实施计划
- `data/` — 运行时数据（不入 git）；`core/data/assistant.db` 为唯一数据库真源

## 当前状态

- 版本：2.1.0（见 CHANGELOG.md）
- 文档：主文档 CASE大脑_产品定位与架构指引.md / BACKLOG.md / 实施计划_2026-08-13.md
- 测试：pytest tests/ 全绿（见各 WO 交付报告）
