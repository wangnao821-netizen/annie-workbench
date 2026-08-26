# WO-86 主对话流原生 DraftCard 挂载与多版本演进修复

> **状态**：🚀 施工中（五步门禁严谨推进）
> **目标**：
> 1. **主对话起草与微调 100% 挂载 DraftCard**：
>    - 修复 `core/chat/tools.py` 中 `_draft_email` 返回的标准卡片结构（`type: 'draft'` + `payload` 包含 `subject`、`body`、`body_cn`、`version`）；
>    - 扩充 `core/chat/intent_router.py` 邮件意图识别范围，支持连续微调指令（如“语气更严谨一点”、“加上明天是截止日”、“精简篇幅”）；
> 2. **大模型回复与 DraftCard 完美分离**：
>    - Annie 的专业分析与 Broker 提醒保留在聊天气泡中；
>    - 邮件实体以精致的 `DraftCard` 挂载在气泡下方，提供**版本演进（V1/V2/V3）、中英双语对照、复制英文、存入草稿箱、全屏深谈共创**完整操作链；
> 3. **前端多重兜底解析保护**：
>    - 若大模型输出中包含 `Subject:` 与英文正文，前端增加防御性提取逻辑，自动附加 DraftCard 操作栏，彻底告别死文本。

---

## 一、涉及文件清单

| 文件路径 | 变更类型 | 说明 |
| :--- | :---: | :--- |
| `core/chat/intent_router.py` | MODIFY | 扩充邮件起草与连续微调意图匹配规则 |
| `core/chat/tools.py` | MODIFY | 修复 `_draft_email` 产出的 `tool_card` 结构与版本透传 |
| `core/chat/loop.py` | MODIFY | 优化邮件起草分支的提示词注入与版本继承 |
| `frontend/src/components/brain/BrainChat.tsx` | MODIFY | 前端防御性解析与 DraftCard 渲染保障 |

---

## 二、验收标准

1. **出词必出卡**：对 Annie 说“针对当前缺失材料写封邮件”或“起草补件邮件”，下方必出带操作按钮的 DraftCard；
2. **微调出递进版本**：接着说“语气更严谨一点，加上明天是 Finance Clause 截止日”，Annie 下方立刻出 `[V2 版本]` 的 DraftCard；
3. **全功能可用**：卡片上 `[中文对照]`、`[复制英文]`、`[存入草稿箱]`、`[全屏深谈共创 →]` 均真实可用；
4. **构建与测试**：`vite build` 0 Error，`pytest` 全量绿灯。
