# DeepSeek Harness（dsh）调研与对照分析

> 日期：2026-08-14
> 来源：GitHub deepseek-ai/deepseek-harness + 量子位/IT之家/OSCHINA/V2EX 实测报道
> 状态：调研结论（不引入，借鉴 3 点）

## 一、是什么

- DeepSeek 官方开源 Agent Harness（`dsh`），**MIT**，随 DeepSeek V4 Pro 0813 一同发布，v0.1 **开发者预览版**（官方明示：会有破坏性变更，迭代极快）。
- 形态：Node/TS（`npx @deepseek-ai/dsh web`，Web UI 默认 127.0.0.1:3080）；定位**编码 Agent 工作台（对标 Claude Code）**。
- 架构口号：**Everything is a Plugin**——连模型都是插件；底层基于 **Cordis** 元框架；profile = 插件 bundle 的 patch 层按序叠加；换 provider = 往 `ctx.llm` 注册适配器（内置 llm-deepseek）。
- 生态：npm 插件 + `dsh-plugin` 主题；Web UI 底部有 **Token 消耗 + 缓存命中率**实时统计表（实测大多 99% 左右，偶尔 60-70%）。
- 上下文：**compaction（事后压缩上下文）** 机制。

## 二、与我们架构的对照

| dsh 能力 | 我们现状（vera-workbench） | 结论 |
| --- | --- | --- |
| 字节级稳定 prompt、跨轮不带时间戳、不重排（SWE-Bench-Pro KV cache 平均命中 98.67%） | WO-26b 已定"缓存纪律"：系统提示词纯函数、只追加、不注入动态前缀；AiUsageLog 记录 prompt_cache_hit_tokens | ✅ 方向被官方验证，无需改，保持 |
| Token/缓存命中率实时面板 | AiUsageLog 有数据，但**前端无展示** | 🔧 借鉴：加"用量/缓存命中率"小面板（F 批次）——呼应"测量工具只预警不限额" |
| compaction 事后压缩上下文 | **会话压缩未实现**（已登记遗漏） | 🔧 借鉴：会话压缩 WO 参考其思路（保留关键事实、压缩前摘要写 CaseContextEvent） |
| 模型即插件 / provider 适配器 | config 驱动 + routing（DeepSeek 默认 / Gemini 英文） | ✅ 架构等价，无需改 |
| Everything is a Plugin（任意扩展） | 技能包 = 白名单 + 人闸（无任意代码） | ❌ 不照搬，保持安全边界 |
| Node/TS 编码工作台 | Python/FastAPI 业务 Agent（Pydantic AI 内核） | ❌ 不引入（生态/语言/场景不符；预览版不稳定） |

## 三、结论

1. **不引入 dsh**：Node 编码场景 + 预览版 + 与我们 Pydantic AI 业务内核定位不同。
2. **借鉴 3 点（可落地）**：
   - 前端"用量/缓存命中率"小面板（数据已有 AiUsageLog，纯前端 F 批次）；
   - 会话压缩 WO 设计参考 compaction；
   - 模型配置跟进 V4（2026-08-18 已执行）：deepseek-chat 已于 2026-07-24 官方弃用，默认主力切换为 deepseek-v4-flash（原 deepseek-chat 非思考角色）；deepseek-v4-pro 待业务需要再评估（成本更高）。
3. 缓存纪律保持现状（已被官方实测验证）。
