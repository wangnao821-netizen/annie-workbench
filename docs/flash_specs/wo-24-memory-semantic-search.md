# WO-24：记忆层语义检索（sqlite-vec + 本地 BGE，BrainFact 向量化 + recall 改造）

> 来源（Vera 定稿 2026-08-13，复核昨日 2026-08-12 讨论收敛结论）：主文档口径 = **Mem0 保留但降级为可选、不作为核心**；语义搜索主力 = **sqlite-vec + 本地 BGE**（记忆系统深度调研/重设计与选型/对照分析三份文档共识）。本单落地语义检索层，Mem0 不安装、不声明、保持现有优雅降级。
> 执行方：opencode。检查方：Codex。
> 前置：BrainFact 已上线（track/valid_to/superseded 语义完整）；`core/knowledge/recall.py` 现有 LIKE + Mem0 fallback；**sqlite-vec 0.1.9（win_amd64 wheel）与 fastembed 0.8.0（纯 Python wheel）可用性已验证**（2026-08-13 pip download 实测）；当前 alembic head = dccde7819389。

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / **sqlite-vec>=0.1.9** / **fastembed>=0.8.0**（含 onnxruntime，Windows wheel 可用）
- **新增依赖（本单明确授权，仅这两个）**：sqlite-vec（本地向量扩展，零新增服务器）、fastembed（ONNX 本地嵌入，零出网）。禁止其他任何新 pip 依赖
- 嵌入模型：fastembed `BAAI/bge-small-en-v1.5`（384 维）。首次使用需联网从 HF 下载模型（约 100MB，缓存本地，之后全离线）；**下载失败/无网 → 语义层优雅降级**（recall 回退现有 LIKE 行为，不阻断、不报错）
- 红线：**嵌入输入必须 desensitize 后送入**（向量内容不含 PII，pii_map 永不出内网）；嵌入只用本地 ONNX，绝不调外部 embedding API；不改 CaseContextEvent 账本、不改 BrainFact 派生逻辑
- 架构决定：vec0 虚拟表（`fact_embeddings`）由 `ensure_vector_schema()` 幂等创建（CREATE VIRTUAL TABLE IF NOT EXISTS），**不进 Alembic**（虚拟表非普通表，alembic autogenerate 无法管理；在 init_sa_tables 之后调用，测试钉住幂等）——此为对 WO-13「alembic 唯一建表路径」的受控例外，注释写明
- 新代码文件全部 ≤200 行；测试文件 ≤200 行

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `core/knowledge/vector.py` | **新建** | ensure_vector_schema / embed_text / semantic_search（≤200 行，见 §二） |
| `core/knowledge/recall.py` | 修改 | recall_for_context 插入语义层（见 §三） |
| `core/models/db.py` | 修改 | get_engine 内 init_sa_tables 之后调用 ensure_vector_schema（幂等） |
| `core/ai/case_context.py` | 修改 | build_case_context 最小接入：语义召回并入 team_experience 槽（见 §三） |
| `tools/rebuild_fact_embeddings.py` | **新建** | 全量重建嵌入（幂等脚本，≤200 行） |
| `pyproject.toml` | 修改 | dependencies 追加 sqlite-vec>=0.1.9 / fastembed>=0.8.0 |
| `uv.lock` | 修改 | uv 可用时重新生成（不可用则不提交并说明） |
| `tests/test_core/test_vector_memory.py` | **新建** | ≥10 用例 |
| `tests/test_safety/test_vector_pii.py` | **新建** | ≥4 用例（红线：嵌入前必脱敏） |
| `tests/test_core/test_recall_semantic.py` | **新建** | ≥5 用例（recall 合并行为） |

⚠️ 严禁修改上表以外文件。尤其不得改动：core/knowledge/memory.py（Mem0 保持原样）、core/context/accumulator.py、迁移链既有 revision、前端任何文件。

---

## 一、依赖与环境

```toml
# pyproject.toml dependencies 追加
    "sqlite-vec>=0.1.9",
    "fastembed>=0.8.0",
```

- 安装：`python -m pip install "sqlite-vec>=0.1.9" "fastembed>=0.8.0"`
- 验证：`python -c "import sqlite_vec; print(sqlite_vec.__version__)"` → 0.1.9；`python -c "import fastembed; print(fastembed.__version__)"` → 0.8.0
- 嵌入模型首次下载：`python -c "from fastembed import TextEmbedding; m=TextEmbedding('BAAI/bge-small-en-v1.5'); print(len(m.embed(['test']).__next__()))"` → 384（需网络一次；失败不阻断——语义层降级）

## 二、向量层（`core/knowledge/vector.py`，≤200 行）

```python
"""BrainFact 语义检索 — sqlite-vec + 本地 BGE（WO-24）。"""

_EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5"   # 384 维
_VECTOR_DIM = 384
_VTABLE = "fact_embeddings"

def ensure_vector_schema(engine) -> None:
    """幂等创建 vec0 虚拟表（CREATE VIRTUAL TABLE IF NOT EXISTS）；不入 Alembic（受控例外，注释说明）。"""

def embed_text(text: str) -> list[float] | None:
    """本地嵌入（fastembed，384 维）。调用前必须已 desensitize；失败返回 None（降级）。"""

def rebuild_fact_embeddings(db) -> dict:
    """全量重建：扫描 brain_facts（valid_to IS NULL）→ desensitize(value) → embed → upsert fact_embeddings。
    幂等：两次运行结果一致。返回 {"facts": n, "embedded": n, "failed": n}。"""

def semantic_search(db, query: str, case_id: str | None, track: str = "internal", limit: int = 5) -> list[dict]:
    """向量 top-k：query 先 desensitize → embed → vec0 查询（facts 过滤 track/valid_to IS NULL/case 可选）。
    返回 [{fact_id, key, value, category, track, score, case_id}]（value 已 rehydrate）。嵌入不可用返回 []。"""
```

- 降级纪律：任何一步失败（模型未下载/onnx 异常/向量表缺失）→ 返回 None/[]，recall 走既有路径，日志 warning，绝不抛错阻断对话
- 重建脚本 `tools/rebuild_fact_embeddings.py`：`python -m tools.rebuild_fact_embeddings [--db path]`，默认 core/data/assistant.db；dry-run 支持；输出统计

## 三、召回与注入改造

### 3.1 `core/knowledge/recall.py` — recall_for_context 语义层

在现有「本地 knowledge_entries LIKE」之后、「Mem0 fallback」之前插入：

```python
# ── 1.5 BrainFact 语义检索（sqlite-vec，本地 BGE；不可用自动跳过） ──
from core.knowledge.vector import semantic_search
try:
    semantic_hits = semantic_search(db, query, case_id=case_id, track="internal", limit=5)
except Exception as exc:  # noqa: BLE001 — 语义层失败不阻断，回退既有路径
    logger.warning("semantic recall failed: %s", exc)
    semantic_hits = []
for hit in semantic_hits:
    results.append((0.9, f"[语义] {hit['key']}: {hit['value']}", True))
```

- 排序：语义命中（0.9 权重）排在 LIKE 结果之后、Mem0 结果之前；保留既有前缀风格
- Mem0 fallback 维持现状（现有逻辑不动）

### 3.2 `core/ai/case_context.py` — build_case_context 最小接入

- 在 `_build_track_memory` 之后（或 team_experience 组装处），追加语义召回片段（≤300 字符预算，超了截断）：

```python
def _build_semantic_memory(case_id: str, db: Session, track: str) -> str:
    """语义召回（BrainFact 向量 top-5），并入 team_experience 槽；不可用返回空串。"""
```

- 只做 internal 轨（external 轨不注入语义召回，防内线泄漏——红线）；响应字段不新增，语义内容并入既有 `team_experience` 键

## 四、测试

### 4.1 tests/test_core/test_vector_memory.py（≥10）
1. ensure_vector_schema 幂等（跑两次不报错）；临时库存在 fact_embeddings 表
2. embed_text 返回 384 维向量；空文本返回 None
3. embed_text 失败（monkeypatch fastembed 抛异常）→ None（降级）
4. rebuild_fact_embeddings：造 3 条 BrainFact → 重建 → fact_embeddings 3 行；幂等（两次一致）
5. rebuild 只处理 valid_to IS NULL（失效事实不嵌入）
6. semantic_search：构造相关/无关 BrainFact → query 命中相关 top-1
7. semantic_search track 过滤（internal 不返回 external）
8. semantic_search case_id 过滤（null=全案，指定=单案）
9. 向量表缺失 → semantic_search 返回 []（不抛）
10. rehydrate：value 含 PERSON_1 → 返回时还原真实值（含 pii_map 场景）

### 4.2 tests/test_safety/test_vector_pii.py（≥4，红线）
1. embed_text 前 monkeypatch core.pii.gateway.desensitize 记录调用 → 断言 embed 输入必先过 desensitize（含中文名/金额样例）
2. 语义结果中不含 PERSON_ 占位符（已 rehydrate）
3. fastembed 加载失败 → recall 整体降级不报错（构造 monkeypatch）
4. 重建脚本 dry-run 不写库

### 4.3 tests/test_core/test_recall_semantic.py（≥5）
1. 有语义命中时 recall_for_context 返回含「[语义]」前缀行
2. 语义层失败（monkeypatch semantic_search 抛异常）→ 返回 LIKE 结果，不抛
3. LIKE 无结果 + 语义命中 → 仍返回语义行
4. 全部无结果 → 空串（行为与现状一致）
5. 排序：LIKE > 语义 > Mem0（构造三路数据断言顺序）

## 五、验收标准（全量门禁）

- `python -m pytest tests/test_core/test_vector_memory.py tests/test_safety/test_vector_pii.py tests/test_core/test_recall_semantic.py -v` → 全绿
- `python -m pytest tests/ -q` → 701 基线 + 新增，0 failed / 0 skipped
- `ruff check`（本单文件）→ All checks passed
- `python -m tools.rebuild_fact_embeddings --dry-run` → 不写库；实跑两次第二次 0 变更（幂等）
- `python -c "import sqlite_vec, fastembed"` → 版本正常；`import core.knowledge.vector` 无循环导入
- 手动（TestClient）：给案件造 2 条 BrainFact（如「收入: 年薪 18 万」/「负债: 无」），GET /api/cases/{id}/context → team_experience 含语义召回片段
- uv.lock（若生成）含 sqlite-vec / fastembed；提交范围严格限定表内文件

## 提交建议（一次）

```
git add core/knowledge/vector.py core/knowledge/recall.py core/models/db.py core/ai/case_context.py
git add tools/rebuild_fact_embeddings.py pyproject.toml [uv.lock]
git add tests/test_core/test_vector_memory.py tests/test_safety/test_vector_pii.py tests/test_core/test_recall_semantic.py
git commit -m "feat: WO-24 记忆层语义检索 — BrainFact 向量化（sqlite-vec+BGE）+ recall 语义层 + PII 红线测试"
```

⚠️ 执行纪律：只改「改动范围」表内文件；Mem0（memory.py）与账本（CaseContextEvent）零改动；每步完成立即验证；失败停下报告。

## 备注（收尾联动）

- WO-09 遗留「摘要接入 Mem0 软记忆」：本单落地后改写为「摘要接入 BrainFact 向量记忆（sqlite-vec）」，Mem0 不再作为目标；BACKLOG 同步更新
- 银行×平台确认 PATCH 端点（原拟 WO-24）顺延为 **WO-25**
