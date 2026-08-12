# 施工单 05：Electron 桌面壳

> 执行者：DeepSeek  
> 依赖：WO-03（后端可启动） + WO-04（前端 dist 可构建）  
> 预估：2 天  
> 项目根目录：`d:\vera-workbench\`

---

## 技术约束

- Electron 30+
- electron-builder 打包（不用 electron-forge）
- Node.js 20+
- 所有 JS 文件 ≤ 200 行
- Python 进程由 Electron 管理生命周期
- contextIsolation: true + nodeIntegration: false

---

## 目标

将 Vera Workbench 打包为 Windows 桌面应用：
1. 启动时自动拉起 Python 后端
2. 首次安装引导（选 CLIENT_FILES_ROOT + API Key）
3. 端口冲突检测（8000 → 8001 → ... 最多试 5 次）
4. 系统托盘最小化
5. 自动更新（GitHub Release）

---

## 改动范围（完整文件清单）

| 文件 | 操作 | 行数上限 | 说明 |
|------|------|---------|------|
| `electron/package.json` | 新建 | — | Electron 依赖 |
| `electron/main.js` | 新建 | 180 | 主进程 |
| `electron/preload.js` | 新建 | 50 | 安全桥接 |
| `electron/python-manager.js` | 新建 | 150 | Python 后端管理 |
| `electron/port-finder.js` | 新建 | 40 | 端口检测 |
| `electron/setup-wizard.html` | 新建 | 100 | 首次安装引导 UI |
| `electron/setup-wizard.js` | 新建 | 80 | 引导逻辑（preload） |
| `electron/tray.js` | 新建 | 80 | 系统托盘 |
| `electron/electron-builder.yml` | 新建 | — | 打包配置 |
| `electron/assets/icon.ico` | 新建 | — | 应用图标（256x256） |
| `electron/.gitignore` | 新建 | — | node_modules/dist/ |

---

## Step 1：`electron/package.json`

```json
{
  "name": "vera-workbench",
  "version": "2.0.0",
  "description": "Vera Workbench - AI Mortgage Assistant",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder",
    "build:dir": "electron-builder --dir"
  },
  "dependencies": {
    "electron-updater": "^6.2.0"
  },
  "devDependencies": {
    "electron": "^30.0.0",
    "electron-builder": "^24.13.0"
  }
}
```

---

## Step 2：`electron/main.js`

```javascript
/**
 * Vera Workbench — Electron 主进程
 * 
 * 启动流程：
 * 1. 检查是否首次运行（.env 是否存在）
 * 2. 首次 → 显示 setup-wizard
 * 3. 非首次 → 找可用端口 → 启动 Python → 等待就绪 → 加载前端
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { PythonManager } = require('./python-manager');
const { createTray } = require('./tray');

let mainWindow = null;
let pythonManager = null;

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(PROJECT_ROOT, '.env');
const FRONTEND_PATH = path.join(PROJECT_ROOT, 'frontend', 'dist', 'index.html');

function isFirstRun() {
  return !fs.existsSync(ENV_PATH);
}

async function createMainWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    title: 'Vera Workbench',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 生产模式：加载本地 dist；开发模式：代理到 Vite
  if (fs.existsSync(FRONTEND_PATH)) {
    await mainWindow.loadFile(FRONTEND_PATH);
  } else {
    await mainWindow.loadURL(`http://localhost:5173`);
  }

  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow.hide(); // 关闭 → 最小化到托盘
  });
}

async function showSetupWizard() {
  const wizardWindow = new BrowserWindow({
    width: 600,
    height: 500,
    resizable: false,
    title: 'Vera Workbench — 首次设置',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'setup-wizard.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await wizardWindow.loadFile(path.join(__dirname, 'setup-wizard.html'));

  return new Promise((resolve) => {
    ipcMain.once('setup-complete', (_event, config) => {
      // 写入 .env
      const envContent = Object.entries(config)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');
      fs.writeFileSync(ENV_PATH, envContent, 'utf-8');
      wizardWindow.close();
      resolve();
    });
  });
}

app.whenReady().then(async () => {
  // 首次运行 → 引导
  if (isFirstRun()) {
    await showSetupWizard();
  }

  // 启动 Python 后端
  pythonManager = new PythonManager(PROJECT_ROOT);
  const port = await pythonManager.start();

  // 创建主窗口
  await createMainWindow(port);

  // 创建托盘
  createTray(mainWindow, () => {
    pythonManager.stop();
    app.exit(0);
  });
});

app.on('window-all-closed', () => {
  // macOS: 保持运行；Windows: 最小化到托盘，不退出
});
```

---

## Step 3：`electron/python-manager.js`

```javascript
/**
 * Python 后端进程管理
 * 
 * 职责：
 * - 找到可用端口
 * - spawn Python 进程
 * - 等待后端就绪（轮询 /api/version）
 * - 关闭时 graceful shutdown
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { findAvailablePort } = require('./port-finder');

class PythonManager {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.process = null;
    this.port = null;
    this.logPath = path.join(
      process.env.APPDATA || process.env.HOME,
      'vera-workbench', 'logs', 'python.log'
    );
  }

  async start(preferredPort = 8000) {
    // 找可用端口
    this.port = await findAvailablePort(preferredPort);

    // 确保日志目录存在
    const logDir = path.dirname(this.logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // 找 Python 可执行文件
    const pythonPath = this._findPython();
    const logStream = fs.createWriteStream(this.logPath, { flags: 'a' });

    // 启动 Python
    this.process = spawn(pythonPath, [
      '-m', 'uvicorn',
      'server.main:app',
      '--host', '127.0.0.1',
      '--port', String(this.port),
      '--no-access-log',
    ], {
      cwd: this.projectRoot,
      env: {
        ...process.env,
        PYTHONPATH: this.projectRoot,
        VERA_PORT: String(this.port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.process.stdout.pipe(logStream);
    this.process.stderr.pipe(logStream);

    this.process.on('exit', (code) => {
      console.log(`[PythonManager] Process exited with code ${code}`);
    });

    // 等待就绪
    await this.waitForReady();
    console.log(`[PythonManager] Backend ready on port ${this.port}`);
    return this.port;
  }

  async waitForReady(timeoutMs = 15000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      try {
        const res = await fetch(`http://127.0.0.1:${this.port}/api/version`);
        if (res.ok) return;
      } catch { /* not ready yet */ }
      await new Promise(r => setTimeout(r, 500));
    }
    throw new Error(`Backend did not start within ${timeoutMs}ms`);
  }

  stop() {
    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM');
      // Windows: SIGTERM 可能不够
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
      }, 3000);
    }
  }

  _findPython() {
    // 优先 .venv
    const venvPython = path.join(this.projectRoot, '.venv', 'Scripts', 'python.exe');
    if (fs.existsSync(venvPython)) return venvPython;
    // fallback
    return 'python';
  }
}

module.exports = { PythonManager };
```

---

## Step 4：`electron/port-finder.js`

```javascript
/**
 * 端口可用性检测
 */

const net = require('net');

async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findAvailablePort(preferred = 8000, maxAttempts = 5) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = preferred + i;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found (tried ${preferred}-${preferred + maxAttempts - 1})`);
}

module.exports = { isPortAvailable, findAvailablePort };
```

---

## Step 5：`electron/preload.js`

```javascript
/**
 * Preload — 安全桥接（contextIsolation: true）
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('get-version'),
  getPythonPort: () => ipcRenderer.invoke('get-python-port'),
  openFolder: (path) => ipcRenderer.invoke('open-folder', path),
  onBackendReady: (callback) => ipcRenderer.on('backend-ready', callback),
});
```

---

## Step 6：`electron/tray.js`

```javascript
/**
 * 系统托盘
 */

const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');

let tray = null;

function createTray(mainWindow, onQuit) {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  tray = new Tray(nativeImage.createFromPath(iconPath));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => mainWindow.show(),
    },
    { type: 'separator' },
    {
      label: '退出 Vera Workbench',
      click: () => onQuit(),
    },
  ]);

  tray.setToolTip('Vera Workbench');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow.show();
  });

  return tray;
}

module.exports = { createTray };
```

---

## Step 7：`electron/setup-wizard.html`

```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <title>Vera Workbench — 首次设置</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, 'Segoe UI', sans-serif;
      background: #0a0a14;
      color: #f0f0f5;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      padding: 40px;
    }
    h1 { font-size: 24px; margin-bottom: 32px; letter-spacing: -0.02em; }
    .field { width: 100%; margin-bottom: 24px; }
    label { display: block; font-size: 13px; color: #8888a0; margin-bottom: 8px; }
    input, .folder-input {
      width: 100%; padding: 12px 16px; border-radius: 12px;
      border: 1px solid #333; background: #12121f; color: #f0f0f5;
      font-size: 14px; outline: none;
    }
    input:focus { border-color: #6366f1; }
    .folder-row { display: flex; gap: 8px; }
    .folder-row input { flex: 1; }
    .folder-row button {
      padding: 12px 16px; border-radius: 12px; border: none;
      background: #6366f1; color: white; cursor: pointer; font-size: 14px;
    }
    .submit-btn {
      width: 100%; padding: 14px; border-radius: 12px; border: none;
      background: #6366f1; color: white; font-size: 16px;
      cursor: pointer; margin-top: 16px;
    }
    .submit-btn:hover { background: #818cf8; }
    .step-indicator { font-size: 12px; color: #555; margin-bottom: 16px; }
  </style>
</head>
<body>
  <h1>欢迎使用 Vera Workbench</h1>
  <p class="step-indicator">首次设置 — 完成后即可使用</p>

  <div class="field">
    <label>客户文件根目录 (CLIENT_FILES_ROOT)</label>
    <div class="folder-row">
      <input type="text" id="clientRoot" placeholder="D:\Clients" readonly>
      <button id="btnSelectFolder">选择</button>
    </div>
  </div>

  <div class="field">
    <label>Gemini API Key</label>
    <input type="password" id="apiKey" placeholder="AIza...">
  </div>

  <div class="field">
    <label>数据目录（留空使用默认）</label>
    <input type="text" id="dataDir" placeholder="默认: 项目内 data/">
  </div>

  <button class="submit-btn" id="btnSubmit">完成设置</button>

  <script>
    document.getElementById('btnSelectFolder').addEventListener('click', async () => {
      const folder = await window.setupAPI.selectFolder();
      if (folder) document.getElementById('clientRoot').value = folder;
    });

    document.getElementById('btnSubmit').addEventListener('click', () => {
      const config = {
        CLIENT_FILES_ROOT: document.getElementById('clientRoot').value,
        GEMINI_API_KEY: document.getElementById('apiKey').value,
        VERA_DATA_DIR: document.getElementById('dataDir').value,
      };
      window.setupAPI.complete(config);
    });
  </script>
</body>
</html>
```

---

## Step 8：`electron/setup-wizard.js`（setup preload）

```javascript
/**
 * Setup Wizard preload
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('setupAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  complete: (config) => ipcRenderer.send('setup-complete', config),
});
```

---

## Step 9：`electron/electron-builder.yml`

```yaml
appId: com.vera.workbench
productName: Vera Workbench
win:
  target: nsis
  icon: assets/icon.ico
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  perMachine: false
directories:
  output: dist
extraResources:
  - from: "../frontend/dist"
    to: "frontend"
  - from: "../server"
    to: "server"
  - from: "../core"
    to: "core"
  - from: "../config"
    to: "config"
  - from: "../prompts"
    to: "prompts"
  - from: "../pyproject.toml"
    to: "."
publish:
  provider: github
  private: true
```

---

## Step 10：图标 + .gitignore

### `electron/assets/icon.ico`
- 使用任何 256x256 的 .ico 文件（可暂用占位图标）
- 推荐：深蓝/紫色背景 + "V" 字母

### `electron/.gitignore`
```
node_modules/
dist/
```

---

## Step 11：在 main.js 中注册 IPC handlers

在 `app.whenReady()` 内添加：

```javascript
const { dialog } = require('electron');

ipcMain.handle('get-version', () => '2.0.0');
ipcMain.handle('get-python-port', () => pythonManager?.port);
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: '选择客户文件根目录',
  });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('open-folder', (_event, folderPath) => {
  require('electron').shell.openPath(folderPath);
});
```

---

## 验证步骤

### Step A：结构检查
```bash
cd d:\vera-workbench\electron
ls *.js *.html *.yml | wc -l  # 应有 8+ 文件
test -f assets/icon.ico
cat package.json | grep electron
```

### Step B：安装依赖
```bash
cd d:\vera-workbench\electron
npm install
```

### Step C：端口检测单元测试
```javascript
// 在 Node.js REPL 中测试：
const { isPortAvailable, findAvailablePort } = require('./port-finder');
(async () => {
  console.log('8000 available:', await isPortAvailable(8000));
  const port = await findAvailablePort(8000);
  console.log('Found port:', port);
})();
```

### Step D：打包结构测试（不做完整打包）
```bash
cd d:\vera-workbench\electron
npx electron-builder --dir 2>&1 | tail -5
# 检查 dist/ 目录是否生成
```

### Step E：文件行数检查
```bash
find . -name "*.js" -exec wc -l {} \; | sort -n
# 每个文件应 ≤ 200 行
```

---

## 失败标准

- `electron/main.js` 不存在 → **FAIL**
- `electron/python-manager.js` 不存在 → **FAIL**
- 硬编码端口 8000 且无冲突检测 → **FAIL**
- `extraResources` 缺少 `frontend/dist` → **FAIL**
- 无首次安装引导 → **FAIL**
- `assets/icon.ico` 不存在 → **FAIL**
- `contextIsolation` 不是 `true` → **FAIL**
- Python spawn 命令缺少 `--port` 参数 → **FAIL**
- 任何 .js 文件 > 200 行 → **FAIL**
- `package.json` version != "2.0.0" → **FAIL**

---

⚠️ 执行纪律：
1. Electron 主进程不处理业务逻辑，只管 Python 生命周期 + 窗口
2. preload.js 只暴露 `window.electronAPI`（contextIsolation: true）
3. Python 进程 stdout/stderr 写入 `%APPDATA%/vera-workbench/logs/python.log`
4. 关闭窗口 → 最小化到托盘（不退出）
5. 托盘右键 → 退出时先 stop Python 再 app.quit()
6. setup-wizard 写入的 .env 在项目根目录（与后端共用）
7. 生产模式加载 `frontend/dist/index.html`，开发模式加载 `http://localhost:5173`
