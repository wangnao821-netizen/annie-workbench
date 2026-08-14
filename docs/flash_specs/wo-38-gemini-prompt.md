# 任务：执行 WO-38 时间点回溯施工单（Gemini 实施）

你是 Vera Workbench 的实施工程师（Gemini 3.5）。严格按施工单执行，**禁止超范围改动**，遇到歧义停下报告。

## 前置信息
- 仓库：D:\vera-workbench（Windows）
- Python：D:\vera-workbench\.venv\Scripts\python.exe（测试/ruff 都用它）
- 施工单：docs\flash_specs\wo-38-timepoint-snapshot.md（**唯一契约**，接口签名/字段名一字不改）
- 背景：借鉴 Semantica point-in-time——老客户从半截接手缺上下文；数据已具备（BrainFact valid_from/valid_to + 事件 created_at + timeline stage_advanced），只差"案件在指定时点全景快照"查询层
- 当前基线：`pytest tests/ -q` = 930 passed, 0 failed, 0 skipped

## 硬性纪律（违反即返工）
1. 只改施工单「改动范围」表内文件，共 4 个：
   - `core/case_engine/snapshot.py`（新建，≤200 行）
   - `server/api/schemas.py`（修改，末尾新增 4 个模型，勿动既有模型）
   - `server/api/cases.py`（修改，新增 `/{case_id}/snapshot` 端点，勿动既有端点）
   - `tests/test_api/test_case_snapshot.py`（新建，10 用例）
2. 严禁修改：`core/models/orm.py`、`core/agents/*`、`config/agent_flows/*.yaml`、前端 `ui/`；严禁新增数据库迁移；严禁引入任何新 pip 依赖；严禁创建表外文件/目录
3. **PII 红线**：快照仅从本地库读取返回给 Vera（不出外网）；不触碰客户文件夹
4. 快照口径严格按施工单（facts 的有效期闭开区间、stage 推导容错、track 过滤），不得自行发明字段
5. schemas.py / cases.py 只允许"追加"，不允许改动既有代码

## 接口契约速览（完整签名见施工单「二、接口契约」，一字不改）

```python
# core/case_engine/snapshot.py
def build_case_snapshot(
    case_id: str, db: Session, at: datetime | None = None, track: str = "internal",
) -> dict:
    """返回 {"snapshot_at","stage","facts","events","timeline"}。
    Raises ValueError: track 非法 / case 不存在。"""
```

- facts：BrainFact `track==track` 且 `valid_from <= at` 且（`valid_to IS NULL` 或 `valid_to > at`），按 category/key 升序，每项 `{"key","value","category","conflict","valid_from","valid_to"}`
- events：CaseContextEvent `track==track` 且 `created_at <= at` 倒序 limit 20，每项 `{"source_type","content","status","created_at"}`
- timeline：CaseTimelineEvent `created_at <= at` 倒序 limit 20，每项 `{"event_type","title","description","created_at"}`
- stage：timeline 中 `stage_advanced` 且 `created_at <= at` 按时间倒序第一个的 `metadata_json["to_stage"]`（JSON 解析失败/缺字段 → 跳过继续往前找）；无 → `Case.stage or "gathering"`
- snapshot_at：`at.isoformat()`

端点（cases.py）：
```python
@router.get("/{case_id}/snapshot", response_model=CaseSnapshotResponse)
def case_snapshot(case_id: str, at: str | None = Query(None), track: str = Query("internal"), db: Session = Depends(get_db)) -> CaseSnapshotResponse: ...
```
`at` 用 `datetime.fromisoformat`，失败 → 422 "at 必须是 ISO 8601 时间"；track 非 internal/external → 422；案件不存在 → 404。

响应模型（schemas.py 末尾新增，全部 `model_config = ConfigDict(from_attributes=True)`）：
`SnapshotFact{key,value,category,conflict,valid_from,valid_to}` / `SnapshotEvent{source_type,content,status,created_at}` / `SnapshotTimelineItem{event_type,title,description,created_at}` / `CaseSnapshotResponse{snapshot_at,stage,facts,events,timeline}`

## 参考代码（先读再写）
- `core/models/orm.py`：BrainFact（L586）/ CaseContextEvent（L560）/ CaseTimelineEvent（L485）/ Case（L24）
- `server/api/cases.py`：现有端点风格（404/422 处理、get_db 依赖）；`GET /{case_id}/facts`（L335）是现成范例
- `server/api/schemas.py`：现有响应模型风格 + `ConfigDict(from_attributes=True)` 用法
- `core/case_engine/progression.py`：stage_advanced 事件 metadata 结构（from_stage/to_stage）
- 测试参考：`tests/test_api/test_context_events.py`（TestClient fixture 风格）

## 实施步骤
1. 读施工单全文 + 上述参考代码
2. Step 1：新建 core/case_engine/snapshot.py；验证 `ruff check core/case_engine/snapshot.py`
3. Step 2：schemas.py 加 4 模型 + cases.py 加端点；验证 `pytest tests/test_api/test_case_snapshot.py -q`
4. Step 3：写 10 个测试用例（施工单列名：now 有效 / 未来事实排除 / 区间内包含 / superseded 后排除 / stage 推导 / stage 回退 / track 过滤 / 404 / at 422 / track 422）
5. Step 4：全量门禁 + 提交

## 门禁（全绿才算完成）
- 专项：`pytest tests/test_api/test_case_snapshot.py -q` → 10 项全绿
- 回归：`pytest tests/test_api/test_context_events.py -q` → 全绿（cases.py 追加不回归）
- 全量：`pytest tests/ -q` → ≥930 全绿，0 failed / 0 skipped
- `ruff check core/case_engine/snapshot.py server/api/cases.py server/api/schemas.py tests/test_api/test_case_snapshot.py` → All checks passed
- `python -c "import core.case_engine.snapshot, server.main"` → 无循环导入
- `git diff` 核对：除「改动范围」表内 4 文件外零改动（前端 ui/ 一律不碰）

## 提交
- 只 stage 本单 4 个文件；提交信息：`feat: WO-38 时间点回溯 — 案件指定时点全景快照 GET /api/cases/{id}/snapshot`
- 提交后输出交付报告：改动文件清单 + 行数、专项/全量测试数、ruff 结果、遗留 TODO（如有）

## 失败标准（对照施工单「验收标准」）
任何一项不满足 → 停下报告，不要自行扩大范围。
