# WO-88: 案件文件夹路径全链路贯通与导入即关联持久化

## 一、背景与问题定义
- **问题 1（列表接口字段缺失）**：`POST /api/cases/topology-import/batch` 成功将 `case.folder_path` 写入 SQLite，但核心列表接口 `GET /api/cases/`（Pydantic 模型 `CaseResponse` 及转换函数 `_to_case_response`）未返回 `folder_path` 与 `folder_mode`，导致前端拉取在途案件后 `folderPath` 恒为 `null`，右侧工作台与文件柜假性展示【未关联文件夹 ⚠️】。
- **问题 2（手动关联未持久化）**：`CaseFolderCard.tsx` 在用户手动选文件夹后仅更新 React 本地 state，未调用 `associateCaseFolder`（`POST /api/cases/{id}/folder`），导致刷新页面后关联丢失。

## 二、修改清单与契约
1. **`server/api/schemas.py`**:
   - `CaseResponse`: 增加 `folder_path: str | None = None` 与 `folder_mode: str | None = None`。
2. **`server/api/cases.py`**:
   - `_to_case_response()`: 赋值 `folder_path=case.folder_path`, `folder_mode="existing" if case.folder_path else "auto"`。
3. **`frontend/src/types/api.ts`**:
   - `CaseResponse`: 确认补齐 `folder_path?: string | null; folder_mode?: string | null;`。
4. **`frontend/src/components/cases/CaseFolderCard.tsx`**:
   - `handleOpenFolderPicker`: 增加 `associateCaseFolder(caseId, { path: res.path, mode: resolvedMode })` 真实持久化与 Store 同步。
5. **版本升级**:
   - `pyproject.toml` (2.3.1 -> 2.3.2)
   - `frontend/package.json` (2.3.1 -> 2.3.2)
   - `electron/package.json` (2.3.1 -> 2.3.2)
   - `server/main.py` (`APP_VERSION = "2.3.2"`)

## 三、验收标准
- `pytest tests/test_api/test_cases.py` 0 error。
- `tsc --noEmit` & `vite build` 0 error。
- 打包生成 `Annie Setup 2.3.2.exe`，推送到 GitHub Release。
