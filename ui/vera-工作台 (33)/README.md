# Vera Workbench 前端 (Vera 工作台)

Vera Workbench 是面向澳洲 Mortgage Broker 的 AI 智能贷款辅助工作台前端。

## 技术栈
- **核心框架**: React 19 + Vite + TypeScript (Strict Mode)
- **状态管理**: Zustand
- **动画与 UI**: motion (framer-motion) + Tailwind CSS + Lucide React 图标库

## 本地运行指南
1. 安装依赖:
   ```bash
   npm install
   ```
2. 启动开发服务器:
   ```bash
   npm run dev
   ```

## 环境变量配置
在 `.env` 或 `.env.local` 中配置以下变量：
- `VITE_API_URL`: 后端 API 服务基准地址（例如 `http://localhost:8000`）
- `VITE_USE_MOCK`: 设置为 `true` 开启纯前端 Mock 演示模式，设置为 `false` 连接真实后端 API

## API 对接说明
后端 API 接口契约规范参照：`vera-workbench/docs/flash_specs/wo-03-api-routes.md`。

## PII 安全红线
严禁将客户 PII（个人敏感信息，包括姓名、地址、电话、TFN、ABN、银行账号等）未经脱敏传输或发送至外部服务。
