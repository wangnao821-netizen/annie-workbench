# Changelog

## 2.1.0（2026-08-13）

### 新增能力
- 记忆层语义检索（WO-24）：BrainFact 向量化（sqlite-vec + 本地 BGE），recall 语义层 + PII 红线测试
- 能力中心注册表（WO-25）：Agent/Tool 11 项种子 + 运行时开关；银行×平台确认 PATCH（platforms + vera_confirmed 持久化）
- 申报一致性检查 Agent（WO-20）：指定文件/文件夹 → 规则比对 + LLM 补强 → 结论分层 + 解释信草稿
- 计算器 Agent（WO-21）：6 家银行档案（机械提取自 Brokerpedia 源文件）+ 确定性引擎（步骤可见）+ 上传更新闭环（diff/apply/rollback）
- 政策库规则引擎（WO-19）：建档政策提示 + policy-check 端点
- 银行主数据（WO-22）：22 家分层 + 别名解析 + 消费点切 key；聚合平台维度（Infynity/MQG）
- 数据保命调度（Phase 2）：每日备份保留 7 天 / 委派超期提醒 / 摘要刷新（APScheduler）
- 配置基建：run_backend.py 标准启动 + .env.example + /api/health 配置探针

### 增强
- 摘要注入案件软记忆（Phase 3）：一句话摘要参考 BrainFact 记忆上下文
- 清单预选升级 use_ai=True（Phase 3）：规则硬过滤 + AI 排序/理由，失败回退
- CaseChecklist.master_id 关联全集（Phase 3）
- PST 导入 remember 接线（WO-23）；pyproject 依赖对齐 + uv.lock

### 修复
- latrobe display_name 对齐 policy_key；PII 白名单补 BankSA（WO-22 收尾）
- recall.py F821 / generator.py F821（Mem0 兜底接线）
- DB 唯一真源收敛为 core/data/assistant.db（#20 收口）

## 2.0.0（2026-08-12 基线）
- CASE 大脑 V1 基线：BrainFact / 确认闸门 / 对话协议 / 上下文注入 / 统一建案 / 统计 / 双线内外轨
