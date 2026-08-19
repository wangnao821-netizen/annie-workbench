# WO-62 存量案卷拓扑导入全链路修复（字段贯通 · 清单即刻关联 · 事实沉淀 · 编码修复）执行规范

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / `pathlib.Path`（禁止 `os.path.join`）
- 前端：React 18 / TypeScript / Tailwind CSS / Lucide React
- 禁止：引入任何新的 pip 或 npm 依赖
- 禁止：创建"改动范围"表以外的文件；禁止修改表以外任何文件
- 禁止：访问/读取真实客户文件夹（`D:\EverStones_Test_Clients\...`），测试一律用 `tmp_path` 构造虚拟测试数据
- 严格遵循安全纪律：测试隔离，不向测试目录外写文件

## 背景（为什么要做）

在测试与打包运行中，发现通过「存量客户批量拓扑导入」建档的案件存在如下严重断层：
1. **清单未自动关联（未打勾）**：由于 `auto_folder=False`，建案时 `folder_path` 初始为空，导致内部自动清单匹配被跳过；外部回填路径后遗漏了触发 `match_checklist_files_for_case`，造成清单无法自动关联已存在的文件（如 `ID Passport.pdf` 等）；
2. **个人信息与画像字段严重丢失**：拓扑扫描（`topology.py`）已成功提取 Broker Notes 中的电话、邮箱、自雇/PAYG、居留身份、物业估值等，但前端 `FolderTopologyScanner.tsx` 组装参数时将上述字段丢弃，后端 `BatchTopologyImportItem` 亦未定义接收；
3. **事实库（Brain Facts）未沉淀**：存量导入仅写入 Case 表部分字段，未同步写入初始 `brain_facts`，导致进入案件详情页后客户全景与脑图事实大面积显示“未设定”；
4. **清单配置编码乱码**：`config/checklist_master.yaml` 存在非 UTF-8 损坏字符，导致 Windows 打包环境下部分清单项与阶段名乱码（如 `?????????`）。

## 改动范围（严禁超出）

| 模块 | 文件 | 操作 | 说明 |
|------|------|------|------|
| 配置 | `config/checklist_master.yaml` | 修改 | 全量转为标准 UTF-8 编码，消除乱码字符 |
| 后端 | `server/api/schemas.py` | 修改 | 扩充 `BatchTopologyImportItem` 结构（补充 phone/email/employment/residency/property_value 等） |
| 后端 | `server/api/cases.py` | 修改 | `batch_topology_import` 贯通全量字段、即刻触发 `match_checklist_files_for_case`、沉淀初始 `brain_facts` |
| 后端 | `tests/test_api/test_topology_import_repair.py` | **新建** | 覆盖存量导入全字段入库、清单自动匹配与事实沉淀的完整端到端测试 |
| 前端 | `ui/vera-工作台 (96)/src/types/api.ts` | 修改 | 对齐 `BatchTopologyImportItem` 扩展契约 |
| 前端 | `ui/vera-工作台 (96)/src/components/cases/FolderTopologyScanner.tsx` | 修改 | 映射并提交 `prefilled` 中的电话、邮箱、雇佣、身份、估值等完整字段 |

---

## 详细设计与契约规范

### 1. 后端数据契约：`server/api/schemas.py`

扩充 `BatchTopologyImportItem`：
```python
class BatchTopologyImportItem(BaseModel):
    folder_path: str
    client_name: str
    lender: str | None = None
    loan_amount: float | None = None
    property_address: str | None = None
    stage: str = "收集资料"
    is_imported: bool = True
    platform_submissions: list[str] = Field(default_factory=list)
    # ── 新增贯通字段 ──
    client_phone: str | None = None
    client_email: str | None = None
    employment_type: str | None = None
    residency: str | None = None
    property_value: float | None = None
    interest_rate: float | None = None
    doc_type: str | None = None
    loan_type: str | None = None
    onhold_reason: str | None = None
```

---

### 2. 后端接口实现：`server/api/cases.py` (`batch_topology_import`)

```python
@router.post("/topology-import/batch", response_model=BatchTopologyImportResponse)
def batch_topology_import(
    req: BatchTopologyImportRequest,
    db: Session = Depends(get_db),
) -> BatchTopologyImportResponse:
    """批量从识别出的拓扑案卷中建档（贯通画像、即刻匹配清单、沉淀事实）。"""
    created: list[dict] = []
    for item in req.items:
        case = create_case_from_source(
            client_name=item.client_name,
            source="topology_import",
            db=db,
            lender=item.lender,
            loan_amount=item.loan_amount,
            client_phone=item.client_phone or "",
            client_email=item.client_email or "",
            employment_type=item.employment_type,
            residency=item.residency,
            property_value=item.property_value,
            interest_rate=item.interest_rate,
            purpose=item.loan_type,
            is_imported=item.is_imported,
            platform_submissions=item.platform_submissions,
            auto_folder=False,
        )
        case.folder_path = item.folder_path
        if item.stage:
            case.stage = item.stage
        if item.doc_type:
            case.case_type = item.doc_type
        if item.onhold_reason:
            case.special_circumstances = f"暂停原因：{item.onhold_reason}"
        db.flush()

        # 核心修复 1：路径回填后立即触发清单文件快速匹配与自动勾选
        if item.folder_path and Path(item.folder_path).is_dir():
            try:
                from core.checklist.matcher import match_checklist_files_for_case
                match_checklist_files_for_case(case.id, db)
            except Exception as exc:
                logging.getLogger("server.api.cases").warning(
                    "match checklist files on topology import failed for %s: %s", case.id, exc
                )

        # 核心修复 2：沉淀初始 Brain Facts（交易/房产/身份/职业）
        _seed_initial_brain_facts_for_import(case, item, db)

        created.append({
            "case_id": case.id,
            "client_name": item.client_name,
            "folder_path": item.folder_path,
        })

    db.add(
        ImportRecord(
            source="topology_import",
            status="done",
            file_count=len(req.items),
            started_at=datetime.now(UTC),
            finished_at=datetime.now(UTC),
            note=f"批量拓扑导入 {len(req.items)} 案卷",
        )
    )
    db.commit()
    return BatchTopologyImportResponse(ok=True, created_cases=created)
```

---

### 3. 前端实现：`FolderTopologyScanner.tsx`

在 `handleBatchImport` 映射提交对象时，完整提取 `c.prefilled` 与案卷级元数据：
```typescript
const importItems: BatchTopologyImportItem[] = selectedCases.map((c) => ({
  folder_path: c.folder_path,
  client_name: scanResult.client_name || c.prefilled?.client_name || '客户',
  lender: c.lender || c.prefilled?.lender || 'CBA',
  loan_amount: c.prefilled?.loan_amount,
  property_address: c.property_address || c.prefilled?.property_address,
  stage: c.status === 'submitted' ? '已递交银行' : (c.status === 'onhold' ? '预审准备' : '资料收集'),
  is_imported: true,
  platform_submissions: c.submitted_platforms || [],
  // 补齐字段
  client_phone: c.prefilled?.client_phone || '',
  client_email: c.prefilled?.client_email || '',
  employment_type: c.prefilled?.employment_type,
  residency: c.prefilled?.residency,
  property_value: c.prefilled?.property_value,
  interest_rate: c.prefilled?.interest_rate,
  doc_type: c.doc_type || c.prefilled?.doc_type,
  loan_type: c.loan_type || c.prefilled?.loan_type,
  onhold_reason: c.onhold_reason,
}));
```
