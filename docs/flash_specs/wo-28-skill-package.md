# WO-28：技能包系统（Skill Package）— manifest schema + 注册表 + 人闸创作

> 来源（Vera 定稿 2026-08-13）：确认技能包为最终单——把"流程包"升级为"技能包"（manifest 超集）；Vera 手动创作 + AI 提议→确认（人闸）；注册表 CRUD + 版本回滚。对应 Agent架构演进_参考Pi与PrimeAgent.md §五 #7；docs/技能包架构草案.md。
> 前置：WO-26b + WO-26c + WO-27 验收通过后实施（技能包建立在地基之上）。

## 技术约束

- 红线：技能只能调用白名单工具（**无任意代码执行**）；PII / 草稿 / PathGuard 红线对技能同样生效
- 人闸：AI 提议只生成 draft，**绝不自动激活**；激活必须 Vera 显式操作
- 状态机：draft → active → deprecated；每次编辑出新版本、可回滚（闭环）
- 配置优先：内置技能 YAML 为真源（config/）；用户创建技能存 DB（skill_versions）
- 新代码文件 ≤200 行；迁移用 batch 模式

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
| --- | --- | --- |
| `core/migrations/versions/xxxx_add_skill_versions.py` | **新建** | skill_versions 表（key/version/manifest_json/status/created_by/reason/created_at/superseded_by） |
| `core/models/orm.py` | 修改 | SkillVersion 模型 |
| `core/skills/manifest.py` | **新建** | manifest schema 校验（Pydantic） |
| `core/skills/registry.py` | **新建** | CRUD / list / activate / deactivate / rollback + 白名单强制 |
| `server/api/skills.py` | **新建** | 列表 / 详情 / 创建(draft) / 更新(新版本) / 激活 / 停用 / 回滚 / 提议 |
| `server/main.py` | 修改 | 注册 skills 路由 |
| `server/api/schemas.py` | 修改 | Skill / SkillVersion schema |
| `tests/test_core/test_skill_manifest.py` | **新建** | ≥8 用例 |
| `tests/test_api/test_skill_endpoints.py` | **新建** | ≥8 用例 |

⚠️ 严禁修改：config/agent_flows/*.yaml（本单不改）、core/chat/loop.py、前端（提示词另出）。

## 设计

### manifest 字段（超集）

key / name / description / version / category（agent|tool|flow|knowledge）/ triggers / presentation（result_card|dialog|notification）/ permission（read_only|draft|system_config）/ inputs / outputs / steps（白名单工具，可空：纯模板/知识技能）/ assets（提示词/邮件模板，非代码）/ confirm_required / status / author

### 两条创作路径（人闸）

- 路径 A（Vera 手动）：POST /api/skills（status=draft）→ 校验 → 预览 → 激活
- 路径 B（AI 提议）：POST /api/skills/propose（manifest 草稿 + 理由 + 适用范围）→ 存 draft → Vera 查看/修改/确认 → 激活；**不自动激活**
- 版本：每次更新 = 新 version 行（superseded_by 链）；rollback 恢复上一 active 版本

### 白名单强制

- `manifest.steps[].tool` 必须 ∈ 现有工具白名单（flows.py 白名单）；违规 → 校验拒绝（422）
- 自定义逻辑走代码评审流程（declaration_check.py 模式），不开放给用户创建

## 测试

### tests/test_core/test_skill_manifest.py（≥8）

1. 合法 manifest 通过校验
2. 非法 category / presentation / permission → 拒绝
3. 白名单外 tool → 拒绝
4. steps 为空（纯模板技能）合法
5. 版本唯一性
6. 状态机非法迁移（active→draft 等）拒绝
7. assets 非代码约束（拒绝可执行脚本字段）
8. 回滚：superseded_by 链正确

### tests/test_api/test_skill_endpoints.py（≥8）

1. 列表：内置技能 + 用户技能合并
2. 创建 draft；未激活不可执行
3. AI 提议 → draft（不自动激活）
4. Vera 激活 → active
5. 停用 → 不可触发
6. 更新 → 新版本；回滚 → 恢复上一 active
7. 白名单违规创建 → 422
8. 非 Vera 确认的 draft 无法激活（等价断言）

## 验收标准（全量门禁）

- 专项 16 用例全绿；`pytest tests/ -q` → 最新基线 + 新增，0 failed / 0 skipped
- alembic upgrade head 成功；skill_versions 表就位
- ruff（本单文件）→ All checks passed
- TestClient：技能 CRUD + 提议→确认闭环全通
- 前端零改动（提示词另出）

## 提交建议（一次）

```
git add core/migrations/versions/... core/models/orm.py core/skills/manifest.py core/skills/registry.py server/api/skills.py server/main.py server/api/schemas.py tests/test_core/test_skill_manifest.py tests/test_api/test_skill_endpoints.py
git commit -m "feat: WO-28 技能包系统 — manifest schema + 注册表 CRUD + 版本回滚 + AI 提议→Vera 确认（人闸）"
```

⚠️ 执行纪律：只改表内文件；人闸绝不自动激活；白名单强制；每步验证。