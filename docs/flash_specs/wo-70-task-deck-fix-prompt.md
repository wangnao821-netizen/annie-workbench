# OpenCode 施工单：WO-70 首页右栏「客户任务」全面修复与重设计（双轨 Tool-Calling 版）

请作为全栈资深开发工程师，严格按照本施工单执行代码修改。本次涉及 **1 个后端 Python 文件** + **9 个前端 TSX/TS 文件**，共 5 大修复项。

> ⚠️ **改动范围锁死**：严禁修改本施工单列出的 10 个文件以外的任何文件。
> ⚠️ **样式系统不动**：不改 CSS 变量、不改 theme 文件、不加新依赖。
> ⚠️ **现有注释保留**：除了明确标注要删除的 `TODO(WO-03)` 行以外，保留所有既有 docstring 和注释。

---

## 一、修复 1：后端任务创建改为「双轨 Tool-Calling」架构（根治口语废话）

> 详细规范与性能基准请参考：[`docs/flash_specs/wo-70-task-tool-calling.md`](file:///d:/vera-workbench/docs/flash_specs/wo-70-task-tool-calling.md)

### 1.1 文件：`core/chat/loop.py`

定位 `run_chat_with_tools_stream` 中的 `elif intent == ChatIntent.TASK_CREATE and case_id:` 分支（约第 231-270 行），替换为**双轨精准提取逻辑**：

```python
    elif intent == ChatIntent.TASK_CREATE and case_id:
        try:
            from core.chat.slot_extractor import extract_task_slots
            from core.chat.tools import _create_task, TOOL_SCHEMAS

            # 1. 轨道 A：先尝试规则快路径 (0 延迟)
            slots = extract_task_slots(message)
            task_args = None

            if slots.get("confidence") == "high":
                task_args = {
                    "title": slots["title"],
                    "deadline": slots.get("deadline"),
                    "priority": slots.get("priority", "normal"),
                    "context": {"source": "chat", "mode": "fast_path", "raw_time": slots.get("raw_time")},
                }
            else:
                # 2. 轨道 B：复杂口语走精准 Tool Calling (语义理解，无废话)
                yield {"event": "step", "data": {"label": "正在解析任务事项与排期...", "status": "running"}}

                create_task_schema = next((t for t in TOOL_SCHEMAS if t.get("function", {}).get("name") == "create_task"), None)
                task_prompt = f"请根据用户的对话内容创建待办任务，提取清晰的事项标题、截止时间与优先级：\n{safe_message}"

                result = gw.call_llm(
                    text=DesensitizedText(task_prompt),
                    prompt_template="",
                    system_prompt="你是一个专业的信贷助手，负责将口语指令提取为严谨利落的任务事项（去除‘好的把’、‘也安排’等口语废话）。",
                    tools=[create_task_schema] if create_task_schema else None,
                    tool_choice="required",
                    max_tokens=100,
                )

                if result.tool_calls:
                    call_args = result.tool_calls[0].get("arguments", {})
                    task_args = {
                        "title": call_args.get("title") or slots.get("title") or message[:30],
                        "deadline": call_args.get("deadline") or slots.get("deadline"),
                        "priority": call_args.get("priority") or slots.get("priority", "normal"),
                        "context": {"source": "chat", "mode": "tool_calling", "raw_time": slots.get("raw_time")},
                    }
                else:
                    task_args = {
                        "title": slots.get("title") or message[:30],
                        "deadline": slots.get("deadline"),
                        "priority": slots.get("priority", "normal"),
                        "context": {"source": "chat", "mode": "fallback"},
                    }

            # 3. 执行任务创建并回填系统提示
            res = _create_task(task_args, case_id, db)

            if res.get("ok"):
                dl_display = task_args.get("deadline") or "未设期限"
                tool_cards.append({
                    "type": "task_created",
                    "title": f"📋 任务已创建：{task_args['title']}（{dl_display}，{task_args['priority']}）",
                    "payload": {
                        "task_id": res.get("task_id"),
                        "title": task_args["title"],
                        "deadline": task_args.get("deadline"),
                        "priority": task_args.get("priority"),
                    },
                })
                base_prompt += f"\n\n【系统通知】已成功为 Vera 创建任务: {task_args['title']}，截止时间: {dl_display}。"
            else:
                tool_cards.append({
                    "type": "task_create_failed",
                    "title": "⚠️ 任务创建失败",
                    "payload": {"reason": res.get("error") or res.get("summary") or "未知原因"},
                })
            if tool_cards:
                yield {"event": "tool_cards", "data": tool_cards}

        except Exception as te:
            logger.warning("task_create branch failed: %s", te)
            base_prompt += f"\n\n【任务创建提示】自动记录失败: {te}"
```

### 1.2 文件：`core/chat/slot_extractor.py`（优化快路径判定与清洗）

#### 1.2.1 扩充 `_ACTION_VERBS_PATTERN`（第 22 行）
```python
_ACTION_VERBS_PATTERN = r"(?:好的?(?:把|吧)?|行(?:吧)?|嗯|那(?:就)?|OK|ok)[,，\s]*(?:帮我|请)?(?:记一下|记一笔|帮我记|建(?:一个|个)?(?:加急|紧急)?(?:任务|待办|提醒)|创建任务|安排一下|提醒我|设(?:一个|个)?提醒|设个待办|做个备忘|也?(?:排|安排)(?:到|一下).*?(?:时间|时候))[:：,，\s]*"
```

#### 1.2.2 标题清洗管道追加剥离（第 49 行之后）
```python
    cleaned = re.sub(r"也?(?:排|安排)(?:到|一下).*?(?:时间|时候|时|$)", "", cleaned).strip()
    cleaned = re.sub(r"^(?:把|吧|也)[,，\s]*", "", cleaned).strip()
```

#### 1.2.3 调准快路径高置信标准（第 52 行）
当包含口语残余词时直接置信度降为 `low`，触发轨道 B 的 Tool Calling：
```python
    has_filler = bool(re.search(r"^(?:好的|好的把|行吧|嗯|那就|把|也)", title))
    confidence = "high" if (len(title) >= 2 and not has_filler and raw_time is not None) else "low"
```

---

## 二、修复 2：点击任务标题→全部跳转 OS 工作台（应跳转任务详情）

### 文件 A：`frontend/src/components/brain/TaskDeckContent.tsx`
定位第 421 行：
```tsx
onClick={() => openOsWorkbench(task.id)}
```
替换为：
```tsx
onClick={() => useUiStore.getState().openTaskDetail(task.id)}
```

### 文件 B：`frontend/src/components/brain/TaskDrawer.tsx`
定位第 315 行：
```tsx
onClick={() => openOsWorkbench(task.id)}
```
替换为：
```tsx
onClick={() => useUiStore.getState().openTaskDetail(task.id)}
```

---

## 三、修复 3：任务详情页假邮件/假附件/乱码内容清理

### 3.1 类型扩展：`frontend/src/types/index.ts`
在 `TaskItem` 接口末尾追加可选字段：
```typescript
  emailFrom?: string | null;       // 邮件发件人
  emailSubject?: string | null;    // 邮件主题
  emailBodyHtml?: string | null;   // 邮件正文 HTML
  emailBodyText?: string | null;   // 邮件正文纯文本
  emailAttachments?: { id: string; name: string; size: string }[] | null;  // 邮件附件列表
```

### 3.2 文件：`frontend/src/components/panel/details/EmailDispatchDetail.tsx`
1. 删除 `MOCK_ATTACHMENTS` 硬编码常量；
2. 头部声明：`const attachments = task.emailAttachments ?? [];`；
3. 发件人替换：`From: {task.emailFrom || task.title || '未知发件人'}`；
4. 邮件正文替换为：
   ```tsx
   {task.emailBodyText ? (
     <div className="whitespace-pre-wrap">{task.emailBodyText}</div>
   ) : (
     <div className="flex items-center justify-center py-6 text-muted text-xs">
       <span>📭 邮件原文未加载（需后端 API 接入）</span>
     </div>
   )}
   ```
5. 附件列表改为渲染 `attachments`，无数据时提示“暂无附件”。

### 3.3 文件：`frontend/src/components/panel/details/GeneralEmailDetail.tsx`
执行与 3.2 完全相同的改动。

---

## 四、修复 4：OS 工作台双语草稿框太小 + 移除 TODO 噪音文字

### 4.1 文件：`frontend/src/components/os/OsDraftColumn.tsx`
1. 中文 textarea `rows={4}` ➔ `rows={8}`；
2. 英文 textarea `rows={5}` ➔ `rows={10}`；
3. `resize-none` ➔ `resize-y`；
4. 删除第 94-96 行 `TODO(WO-03)` 文字；
5. 列宽调整：第 33 行 `w-full xl:w-[400px]` ➔ `w-full xl:flex-1 xl:min-w-[380px]`。

### 4.2 文件：`frontend/src/components/os/OsConditionsColumn.tsx`
删除第 73-75 行 `TODO(WO-03)` 文字。

### 4.3 文件：`frontend/src/components/os/OsStrategyColumn.tsx`
删除第 61-63 行 `TODO(WO-03)` 文字。

---

## 五、修复 5：「客户任务」页签整体 UI 重设计

### 文件：`frontend/src/components/brain/TaskDeckContent.tsx`

1. **Header 增加完成进度条**：在标题与计数 badge 旁增加动效进度指示条；
2. **任务卡片增加优先级色条**：根据 `task.priority` / `isOverdue` / `isBossTask` 赋予左侧色条（红/橙/黄/accent）；
3. **AI 摘要预览**：在标题下方增加 truncated AI 摘要行；
4. **操作按钮 Hover 显示**：默认半透明/隐藏，hover 时完全呈现；
5. **逾期任务脉冲动画**：逾期任务的截止 badge 增加 `animate-pulse`；
6. **精致空状态**：采用居中圆形图标与双行提示文案。

---

## 改动文件清单（共 10 个文件，严禁超出）

| # | 文件路径 | 修复项 |
|---|---------|-------|
| 1 | `core/chat/loop.py` | 修复 1 |
| 2 | `core/chat/slot_extractor.py` | 修复 1 |
| 3 | `frontend/src/components/brain/TaskDeckContent.tsx` | 修复 2 + 修复 5 |
| 4 | `frontend/src/components/brain/TaskDrawer.tsx` | 修复 2 |
| 5 | `frontend/src/types/index.ts` | 修复 3 |
| 6 | `frontend/src/components/panel/details/EmailDispatchDetail.tsx` | 修复 3 |
| 7 | `frontend/src/components/panel/details/GeneralEmailDetail.tsx` | 修复 3 |
| 8 | `frontend/src/components/os/OsDraftColumn.tsx` | 修复 4 |
| 9 | `frontend/src/components/os/OsConditionsColumn.tsx` | 修复 4 |
| 10 | `frontend/src/components/os/OsStrategyColumn.tsx` | 修复 4 |

---

## 验收命令

```powershell
# 后端
cd D:\vera-workbench
$env:PYTHONPATH="D:\vera-workbench\.venv\Lib\site-packages"
python -m pytest tests/test_slot_extractor.py -v
python -m pytest tests/test_intent_driven_tools.py -v
python -m ruff check core/chat/loop.py core/chat/slot_extractor.py

# 前端
cd D:\vera-workbench\frontend
npx tsc --noEmit
npm run build
```
