# WO-85 双轨邮件共创体系与原生 DraftCard 深度修复

> **状态**：🚀 施工中（按五步门禁推进，契约先行）
> **目标**：
> 1. **消除 JSON 乱码 ➔ 主对话流原生【DraftCard】（方案 B）**：
>    - 对话流智能拦截所有邮件草稿产物，绝不裸露原始 JSON 代码；
>    - 原生渲染为全功能 DraftCard：主题、版本徽标（V1/V2/V3）、英文排版正文、**中英双语对照折叠开关（带精准流畅中文翻译）**、`[📋 复制英文]`、`[💾 存入草稿箱]`、`[↗️ 进入全屏深谈共创]`；
>    - 支持主对话内自然语言微调（如“语气更正式一点”、“精简到3句话”），原地生成递进版本（V2、V3）。
> 2. **清理冗余空白卡片**：
>    - 移除 `gap_analysis` 中重复的空文本框与空评估外壳，保留精炼分析正文并直连起草动作。
> 3. **全屏邮件共创深谈工作台深度修复（方案 A）**：
>    - **彻底消除打开时全白/空白 Bug**：进入共创弹窗立刻基于案件大脑全景生成 V1 完整初稿 + 中文对照，绝不全白；
>    - **修复右半边裁切**：重构弹窗 Flex/Grid 弹性自适应布局（`min-w-0`、`max-w-[95vw]`），保证各分辨率下完整舒展；
>    - **修复中文对照与会话标头**：打通 `body_cn` 全链路持久化，更新 Annie 品牌标头与输入框提示。

---

## 一、涉及文件清单（修改与新增）

| 文件路径 | 变更类型 | 说明 |
| :--- | :---: | :--- |
| `frontend/src/components/brain/DraftCard.tsx` | MODIFY | 升级为主对话流全能 DraftCard：支持版本徽标、中英双语对照、复制、存入草稿箱与升舱全屏 |
| `frontend/src/components/brain/BrainChat.tsx` | MODIFY | 智能拦截消息中的 JSON 草稿文本自动渲染为 DraftCard；支持 `open-co-create-flow` 事件拉起 |
| `frontend/src/components/brain/GapAnalysisCard.tsx` | MODIFY | 移除冗余重复的空白外壳，直连起草动作 |
| `frontend/src/components/brain/CoCreateDialog.tsx` | MODIFY | 修复初次打开空白 Bug、打通 `bodyCn` 中文翻译、修复窗口右侧被裁切与品牌文案 |
| `core/agents/draft_email.py` | MODIFY | `_gen_draft` / `run_co_create` 生成结构化 `body_cn` 并全链路持久化透传 |
| `server/api/schemas.py` | MODIFY | `EmailDraftResponse.draft_id` 设为可选兼容预览模式 |

---

## 二、双轨架构交互矩阵

| 场景 / 入口 | 呈现方式 | 核心功能 | 适用业务场景 |
| :--- | :--- | :--- | :--- |
| **方案 B：主对话流原生卡片** | 聊天气泡内嵌 `DraftCard` | • 版本标记（V1/V2/V3）<br>• 中英双语对照（随时折叠/展开）<br>• 复制英文 / 存入草稿箱<br>• 对话原地说话微调 | **日常极速催件 / 短邮件**（90% 高频场景，随聊随改） |
| **方案 A：全屏深谈工作台** | 全屏两栏工作台 (`CoCreateDialog`) | • 左右双栏沉浸工作区<br>• A/B 分支方案对比<br>• 沉淀为追加清单项 (`condition`)<br>• 完整历史版本链回滚 | **复杂长文 / Special Condition 攻坚**（10% 复杂争议场景） |

---

## 三、验收标准与门禁

1. **0 乱码**：对话流中绝无裸露的 `{"subject": ...}` 原始 JSON 字符串；
2. **DraftCard 全能展示**：邮件草稿卡片清晰展示主题、英文正文、版本号；
3. **中文对照即时可用**：点击“中文对照”无论在主卡片还是全屏工作台均能准确显示地道中文翻译；
4. **全屏共创工作台 0 空白、0 裁切**：点击进入共创弹窗后，两栏完整展示，右侧草稿区即刻充盈，无任何右侧边缘裁切；
5. **代码与构建质量**：`vite build` 0 Error，`pytest` 全量绿灯，`ruff check` 0 Error。
