# WO-73: 案件文件夹关联全链路贯通、重命名智能自愈与路径失效预警 (Case Folder Resilience & Relink Spec)

> **工单状态**：📝 待终审批准 (Draft)  
> **所属版本**：Annie Workbench v2.2.0+  
> **目标**：彻底解决新建/导入案件后文件夹状态误显示为“未关联”的问题，并为经纪人日常在 Windows 中手动重命名文件夹的习惯提供智能寻回与韧性预警机制。

---

## 〇、问题背景与真实业务痛点

### 1. 痛点一：导入/新建已有文件夹，案件详情却显示「未关联文件夹」
- **现象**：Vera 从文件夹拓扑导入或新建客户时已指定了文件夹路径，后端数据库 `cases.folder_path` 也成功写入，但打开案件详情时右上角依然显示黄色的「未关联文件夹」。
- **根因**：`server/api/cases.py` 中的 `_to_case_response` 在将 `Case` ORM 转换为 `CaseResponse` Pydantic 对象时，**漏传了 `folder_path` 和 `folder_mode` 字段**。导致前端案件列表缓存中的 `folderPath` 全部为 `undefined`。

### 2. 痛点二：Vera 手动重命名案件文件夹导致路径物理断链
- **业务习惯**：Vera 随办件推进，常在 Windows 资源管理器中修改案件文件夹名称（例如：`D:\Loans\Alice` 改名为 `D:\Loans\Alice - 已递交CBA` 或 `D:\Loans\[Approved] Alice`）。
- **技术事实**：文件夹改名后，旧路径在 Windows 文件系统上已不存在。系统若仅做静态字符串比对，会导致材料无法读取或报错。
- **治理目标**：系统在检测到原路径不可达时，自动嗅探同级父目录；若发现包含该客户姓名的重命名目录，主动给出智能寻回建议，支持一键恢复更新，无需手动重新找目录。

---

## 一、技术约束与边界 (Boundary)

- **后端**：Python 3.11+ / FastAPI / SQLAlchemy 2.x / pathlib.Path
- **前端**：TypeScript Strict / React 18 / Vite / Tailwind CSS 变量（`var(--*)`）
- **红线遵守**：
  - 不做未经授权的物理重命名；
  - 路径校验必须经 `PathGuard`，禁止跨案件越界；
  - 绝不硬编码路径分隔符，使用 `pathlib.Path`。

---

## 二、架构设计与工作流 (Architecture & Flow)

```mermaid
graph TD
    A[案件详情载入 / CaseFolderCard 渲染] --> B{读取 case.folder_path}
    B -->|路径为空| C[状态: 灰黄色 未关联文件夹]
    B -->|路径不为空| D{Path.exists() 物理检查}
    D -->|✅ 物理存在| E[状态: 绿色 已关联 (显示真实路径与更改按钮)]
    D -->|❌ 物理不存在| F[后端父目录智能嗅探 Parent Heuristic Search]
    F --> G{父目录下是否存在包含客户姓名的重命名文件夹?}
    G -->|🎯 嗅探命中| H[状态: 蓝紫色 💡检测到文件夹已更名, 提示[一键同步新路径]]
    G -->|❌ 未命中| I[状态: 橙红色 ⚠️原文件夹不可达 (原路径: ...), 提供[重新定位]]
```

---

## 三、前后端契约与具体实现规范

### 1. 后端修改

#### 1.1 修复 `server/api/cases.py` 中的 `_to_case_response`
在 `_to_case_response` 的返回字典中补充 `folder_path` 与 `folder_mode`：
```python
# server/api/cases.py
def _to_case_response(case: Case, db: Session) -> CaseResponse:
    ...
    return CaseResponse(
        case_id=case.id,
        client_name=case.client_name,
        lender=case.lender or "",
        loan_amount=case.loan_amount or 0.0,
        stage=case.stage or "",
        stage_days=max(days, 0),
        checklist_done=done,
        checklist_total=total,
        progress_pct=round(done / total * 100.0, 1) if total else 0.0,
        last_activity=last.created_at if last else None,
        finance_deadline=case.finance_deadline,
        has_boss_pending=has_boss,
        os_pending_count=os_pending,
        folder_path=case.folder_path,          # 👈 补齐
        folder_mode=case.folder_mode or "link", # 👈 补齐
    )
```

#### 1.2 新增/增强文件夹探活与自愈接口
`POST /api/cases/{case_id}/folder-health`：
```python
class FolderHealthResponse(BaseModel):
    ok: bool
    status: Literal["healthy", "renamed_candidate_found", "broken", "unlinked"]
    current_path: str | None = None
    suggested_path: str | None = None
    suggested_folder_name: str | None = None
    message: str

@router.post("/{case_id}/folder-health", response_model=FolderHealthResponse)
def check_case_folder_health(case_id: str, db: Session = Depends(get_db)) -> FolderHealthResponse:
    """检查案件关联文件夹健康度，当检测到改名时提供候选建议。"""
    case = _get_case_or_404(case_id, db)
    if not case.folder_path:
        return FolderHealthResponse(ok=True, status="unlinked", message="未关联文件夹")
    
    p = Path(case.folder_path)
    if p.is_dir():
        return FolderHealthResponse(ok=True, status="healthy", current_path=str(p), message="文件夹正常")
    
    # 智能自愈嗅探：尝试在父目录中查找
    parent = p.parent
    if parent.is_dir():
        client_keyword = case.client_name.strip()
        # 分词与拼音/英文提取
        keywords = [k for k in [client_keyword, case.id] if k]
        for sub in parent.iterdir():
            if sub.is_dir() and sub != p:
                name_lower = sub.name.lower()
                if any(kw.lower() in name_lower for kw in keywords):
                    return FolderHealthResponse(
                        ok=True,
                        status="renamed_candidate_found",
                        current_path=str(p),
                        suggested_path=str(sub),
                        suggested_folder_name=sub.name,
                        message=f"检测到文件夹可能已重命名为：{sub.name}",
                    )
    
    return FolderHealthResponse(
        ok=True,
        status="broken",
        current_path=str(p),
        message=f"原文件夹路径不可达：{case.folder_path}",
    )
```

---

### 2. 前端修改

#### 2.1 增强 `CaseFolderCard.tsx`
- 支持 4 种视觉状态：
  1. **健康已关联（`healthy` / 绿色）**：`✅ 已关联` + 路径截断显示 + 复制按钮 + 更改按钮；
  2. **智能寻回候选（`renamed_candidate_found` / 蓝紫色）**：`💡 疑似更名为 [新目录名]` + `[一键同步]` 按钮 + `[手动选择]`；
  3. **路径断开失效（`broken` / 橙红色）**：`⚠️ 路径失效（原路径不存在）` + `[重新定位]` 按钮；
  4. **未关联（`unlinked` / 黄色）**：`未关联文件夹` + `[关联文件夹]` 按钮。

#### 2.2 强化数据流缓存一致性
- `CaseDetail.tsx` 与 `OverviewFacts.tsx`：统一优先读取已探活的最新 `folderPath`，在执行一键同步或重新定位后，立即刷新 `useCaseStore` 并重新触发文件与清单匹配。

---

## 四、测试用例与验收标准 (Verification & DoD)

### 1. 自动化单元测试 (`tests/test_case_folder_resilience.py`)
- **用例 1**：创建案件并指定存在的目录 ➔ `GET /api/cases` 返回正确 `folder_path`，`folder-health` 返回 `healthy`。
- **用例 2**：在临时目录下创建 `Alice`，建档后重命名为 `Alice - Approved` ➔ `folder-health` 准确返回 `renamed_candidate_found`，`suggested_path` 包含新名称。
- **用例 3**：删除测试文件夹 ➔ `folder-health` 返回 `broken`。
- **用例 4**：调用 `update_case_folder` 更新路径 ➔ 数据库成功持久化且返回 `healthy`。

### 2. 人工验收标准
1. 从拓扑批量导入 2 宗案卷，进入任意案件详情，右上角立即显示绿色的 `已关联`，路径正确，0 延迟；
2. 新建一个客户并绑定目录，进入案件详情直接显示 `已关联`；
3. 在本地将该客户文件夹后面加上 ` - 已批复`，刷新案件界面，右上角弹出蓝紫色智能提示 `💡 疑似更名为 ...`，点击 `一键同步` 即可无缝切换为绿色正常状态。

---
*施工单已归档至 docs/flash_specs/wo-73-case-folder-resilience-relink.md*
