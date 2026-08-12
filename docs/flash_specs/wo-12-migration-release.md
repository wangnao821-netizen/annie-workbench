# 施工单 12：数据迁移 + 发布流水线

> 执行者：DeepSeek  
> 依赖：所有前序 WO  
> 预估：1.5 天

---

## 技术约束

- 迁移脚本放 `tools/`
- GitHub Actions 放 `.github/workflows/`
- 不删除旧数据，只读取并写入新 DB
- 版本号三处同步：pyproject.toml / package.json / main.py
- Python 文件行数 ≤ 200

---

## 目标

1. 旧 assistant.db → 新项目数据迁移
2. `.env` 合并工具（新增 SUPABASE_URL 等）
3. 版本三处同步脚本
4. GitHub Actions 打包发布
5. README 和 CHANGELOG 迁移

---

## 改动范围

| 文件 | 操作 | 说明 |
|------|------|------|
| `tools/migrate_from_v1.py` | 新建 | 旧 DB 迁移 |
| `tools/merge_env.py` | 新建 | .env 合并 |
| `scripts/version_bump.py` | 新建 | 版本同步 |
| `.github/workflows/release.yml` | 新建 | Electron 打包 |
| `README.md` | 新建/修改 | 新项目说明 |
| `CHANGELOG.md` | 新建 | 变更日志 |
| `docs/release_workflow.md` | 新建 | 发布指南 |

---

## 接口契约

### tools/migrate_from_v1.py

```python
"""旧 loan-assistant DB → vera-workbench DB 迁移。

Usage:
    python tools/migrate_from_v1.py --source D:/loan-assistant/data/assistant.db

功能：
1. 复制 cases / case_files / actions / case_checklists / inbox_messages 表
2. 新增 V2 字段填默认值（source_channel='email', received_file_ids='[]'）
3. 迁移 case_knowledge（保留所有历史）
4. 生成迁移报告

安全：
- 只读 source DB
- 目标写入 data/assistant.db（如已存在则备份）
"""
```

### tools/merge_env.py

```python
"""合并 .env 文件（保留用户已有配置，追加新变量）。

Usage:
    python tools/merge_env.py --template .env.example --existing D:/loan-assistant/.env

新增变量（追加到末尾）：
- SUPABASE_URL=
- SUPABASE_ANON_KEY=
- VERA_PORT=8000
- VERA_DATA_DIR=
"""
```

### scripts/version_bump.py

```python
"""版本号三处同步。

Usage:
    python scripts/version_bump.py 2.1.0

修改：
1. pyproject.toml: version = "2.1.0"
2. frontend/package.json: "version": "2.1.0"（如前端目录存在）
3. server/main.py: /version 返回 "2.1.0"

验证：三处一致后打印确认。
"""
```

### .github/workflows/release.yml

```yaml
name: Release Electron App
on:
  push:
    tags: ['v*']
jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install & Build Frontend
        run: |
          cd frontend
          npm ci
          npm run build
      - name: Install Electron deps
        run: |
          cd electron
          npm ci
      - name: Package
        run: |
          cd electron
          npx electron-builder --win
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: Upload Release
        uses: softprops/action-gh-release@v2
        with:
          files: electron/dist/*.exe
```

---

## 验证步骤

### Step 1：迁移测试（用测试 DB）
```python
python -c "
import sqlite3, shutil
# 创建临时测试 DB
src = 'test_v1.db'
conn = sqlite3.connect(src)
conn.execute('CREATE TABLE IF NOT EXISTS cases (id TEXT PRIMARY KEY, name TEXT)')
conn.execute(\"INSERT OR IGNORE INTO cases VALUES ('CASE-TEST1', 'Test Case')\")
conn.commit()
conn.close()

from tools.migrate_from_v1 import migrate
result = migrate(src)
assert result['cases_migrated'] >= 1
print(f'Migration OK: {result}')
"
```

### Step 2：版本同步
```bash
python scripts/version_bump.py 2.0.1
grep '2.0.1' pyproject.toml
grep '2.0.1' server/main.py
```

### Step 3：env 合并
```bash
python tools/merge_env.py --template .env.example --existing /dev/null
# 应输出包含 SUPABASE_URL 的内容
```

---

## 失败标准

- 迁移后目标 DB 的 cases 行数 != 源 DB → **FAIL**
- 迁移后新增字段 source_channel 不存在 → **FAIL**
- `version_bump.py 2.1.0` 后三处有任一不一致 → **FAIL**
- `.github/workflows/release.yml` 无法通过 `act --dryrun` → **FAIL**
- merge_env 覆盖了用户已有的 GEMINI_API_KEY → **FAIL**
- 任何文件 > 200 行 → **FAIL**

---

⚠️ 执行纪律：
1. 迁移脚本必须幂等（重复运行不重复插入）
2. 迁移前自动备份目标 DB
3. VBA 宏的 _Inbox 路径不需要改（指向 NAS，跨项目通用）
4. release.yml 中 GH_TOKEN 使用 repo secret，不硬编码
5. CHANGELOG 格式遵循 Keep a Changelog
