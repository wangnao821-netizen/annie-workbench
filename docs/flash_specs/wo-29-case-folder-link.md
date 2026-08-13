# WO-29：案件文件夹关联（V2 定稿 §十三 第一档；后端最小单）

> 来源（Vera 定稿 2026-08-13）：主文档 §十三 V2 定稿——建档时**选择已有文件夹**（手动建的）或**自动创建**并关联；关联后 AI 知道案件数据根在哪。本单只做"关联"本身（选已有/自动建 + 校验落库），**三档渐进与文件操作端点后续单**。
> 前置：PathGuard 底座已就位；Case.folder_path 列已存在；core 建档已自动建标准子目录（_Inbox / Don't send / Send to Lender）。
> 执行方：Codex。检查方：Codex 自检。

## 技术约束

- 红线：不写客户文件夹内容（只读校验 + 记录关联路径）；路径穿越拒绝；AI 不自主移动/删除/改名
- 路径规则：关联路径必须位于 CLIENT_FILES_ROOT 下；自动创建按 naming_rules 校验唯一/冲突
- 新代码文件 ≤200 行；无新依赖；不碰前端（提示词另出）
- 幂等：重复关联同一路径 → 返回当前状态（不报错）；换路径 → 需显式 Vera 操作（update 语义）

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
| --- | --- | --- |
| `core/case_engine/folder.py` | **新建** | link_existing / auto_create / 校验（越界拒绝、冲突检测、幂等） |
| `server/api/cases.py` | 修改 | POST `/api/cases/{id}/folder`（body: {mode: "existing"\|"auto", path?: str}） |
| `server/api/schemas.py` | 修改 | CaseFolderRequest / CaseFolderResponse |
| `tests/test_api/test_case_folder.py` | **新建** | ≥8 用例 |

⚠️ 严禁修改：core/models/orm.py（folder_path 已有）、config/agent_flows/*.yaml、前端、core/chat/loop.py。

## 设计

### core/case_engine/folder.py

- `link_existing(db, case_id, path, client_root) -> Case`：校验 path 在 client_root 下（resolve 后前缀匹配，拒绝 `..` 穿越）；目录存在；重复关联幂等；写 Case.folder_path
- `auto_create(db, case_id, naming, client_root) -> Case`：按 naming_rules 生成唯一目录（冲突自动加后缀或报可读错误），创建标准子目录（_Inbox / Don't send / Send to Lender），写 Case.folder_path
- 两者均返回 Case 或抛 ValueError（可读原因）

### 端点 POST /api/cases/{id}/folder

- 案件不存在 → 404；mode 非法 → 422；路径越界/不存在 → 422（可读原因）
- 响应：{ case_id, folder_path, mode }

## 测试（tests/test_api/test_case_folder.py，≥8）

1. link_existing：合法路径关联成功，Case.folder_path 落库
2. 路径越界（client_root 之外 / `..` 穿越）→ 422 拒绝
3. 目标目录不存在 → 422 可读错误
4. 重复关联同一路径 → 幂等（200，folder_path 不变）
5. auto_create：自动建标准子目录并关联成功
6. auto_create 冲突目录 → 可读错误或唯一后缀（断言其一）
7. 案件不存在 → 404
8. mode 非法 → 422

## 验收标准（全量门禁）

- 专项 8 用例全绿；`pytest tests/ -q` → 最新基线（843）+ 新增，0 failed / 0 skipped
- ruff（本单文件）→ All checks passed
- TestClient：existing/auto/越界/幂等四条路径实测通过
- 前端零改动（git diff 核对）

## 提交建议（一次）

```
git add core/case_engine/folder.py server/api/cases.py server/api/schemas.py tests/test_api/test_case_folder.py docs/flash_specs/wo-29-case-folder-link.md
git commit -m "feat: WO-29 案件文件夹关联 — 选已有/自动创建 + 校验落库（V2 定稿第一档）"
```

⚠️ 执行纪律：只改表内文件；不写客户内容；路径校验严格；每步验证。