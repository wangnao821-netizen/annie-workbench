/* Vera 工作台 — Electron 主进程
 * 职责：无边框窗口 + 后端进程管理 + 托盘 + 首次配置引导 + IPC（窗口控制/版本/通知）
 * 红线：只写项目内 .env / config.json；不写客户文件夹；key 仅写入用户输入值。
 */
'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, nativeImage } = require('electron');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');

/* 路径双模式：开发态 __dirname = electron/（ROOT 指向仓库根）；
 * 打包态 __dirname = resources/app.asar，后端运行时按 extraResources 布局放在
 * resources/backend（源码 + run_backend.py + .env）、resources/runtime（便携 Python + site-packages）、
 * resources/web（前端 dist）。 */
const IS_PACKAGED = app.isPackaged;
const DEV_ROOT = path.resolve(__dirname, '..');
const APP_BACKEND = IS_PACKAGED ? path.join(process.resourcesPath, 'backend') : DEV_ROOT;
const CONFIG_PATH = IS_PACKAGED
  ? path.join(APP_BACKEND, 'electron-config.json')
  : path.join(__dirname, 'config.json');
const ENV_PATH = path.join(APP_BACKEND, '.env');
const ENV_EXAMPLE = path.join(APP_BACKEND, '.env.example');
const BACKEND_SCRIPT = path.join(APP_BACKEND, 'run_backend.py');
const DIST_DIR = IS_PACKAGED
  ? path.join(process.resourcesPath, 'web')
  : path.join(DEV_ROOT, 'ui', 'vera-工作台 (90)', 'dist');
const RUNTIME_PY = IS_PACKAGED
  ? path.join(process.resourcesPath, 'runtime', 'python', 'python.exe')
  : null;
const RUNTIME_SITE = IS_PACKAGED
  ? path.join(process.resourcesPath, 'runtime', 'site-packages')
  : null;
const IS_DEV = process.env.VERA_DEV === '1';
const DEV_URL = process.env.VERA_DEV_URL || 'http://localhost:3000';

let mainWindow = null;
let tray = null;
let backendProc = null;
let backendPort = 8000;
let isQuitting = false;

/* ── 配置 ─────────────────────────────────────────────── */
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
}

/* ── Python 探测 ───────────────────────────────────────── */
function findPython() {
  if (IS_PACKAGED && RUNTIME_PY && fs.existsSync(RUNTIME_PY)) return RUNTIME_PY;
  const candidates = [
    path.join(DEV_ROOT, '.venv', 'Scripts', 'python.exe'),
    path.join(DEV_ROOT, '.venv', 'bin', 'python'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  for (const cmd of ['python', 'python3']) {
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore', timeout: 3000 });
      return cmd;
    } catch {
      /* try next */
    }
  }
  return null;
}

/* ── 端口与健康检查 ────────────────────────────────────── */
function portInUse(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
  });
}

async function checkHealth(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureBackend() {
  const cfg = loadConfig();
  const python = cfg.pythonPath || findPython();
  const preferred = cfg.port || 8000;

  // 端口已被占用：是我们的后端 → 直接复用；否则向后探测空闲端口。
  let port = preferred;
  if (await portInUse(port)) {
    if (await checkHealth(port)) {
      backendPort = port;
      return;
    }
    let found = null;
    for (let p = preferred + 1; p < preferred + 11; p++) {
      if (!(await portInUse(p))) { found = p; break; }
    }
    if (!found) {
      dialog.showErrorBox('端口不可用', `端口 ${preferred}-${preferred + 10} 均被占用，请关闭占用程序后重试。`);
      return;
    }
    port = found;
  }

  if (!python) {
    dialog.showErrorBox(
      '未找到 Python',
      '未找到可用的 Python 环境。请安装 Python 3.11 并在 electron/config.json 中配置 pythonPath，或先通过 run_backend.py 手动启动后端。',
    );
    return;
  }

  const spawnEnv = { ...process.env };
  if (IS_PACKAGED && RUNTIME_SITE) {
    spawnEnv.PYTHONPATH = RUNTIME_SITE;
    spawnEnv.PYTHONDONTWRITEBYTECODE = '1';
  }
  if (IS_PACKAGED) {
    // OCR 语言包（liteparse 静态内嵌 tesseract，仅需 tessdata 目录）
    spawnEnv.TESSDATA_PREFIX = path.join(process.resourcesPath, 'runtime', 'tessdata');
  }
  backendProc = spawn(python, [BACKEND_SCRIPT, '--port', String(port)], {
    cwd: APP_BACKEND,
    env: spawnEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  backendProc.stdout.on('data', (d) => console.log(`[backend] ${String(d).trimEnd()}`));
  backendProc.stderr.on('data', (d) => console.error(`[backend:err] ${String(d).trimEnd()}`));
  backendProc.on('exit', (code) => {
    console.log(`[backend] exited code=${code}`);
    backendProc = null;
  });

  // 等待健康就绪（最多 60 秒）
  for (let i = 0; i < 120; i++) {
    if (await checkHealth(port)) {
      backendPort = port;
      if (port !== preferred) {
        cfg.port = port;
        saveConfig(cfg);
      }
      return;
    }
    if (backendProc && backendProc.exitCode !== null) break;
    await sleep(500);
  }
  dialog.showErrorBox('后端启动失败', '后端服务未能就绪，请查看日志或手动运行 run_backend.py 排查。');
}

/* ── 窗口 ──────────────────────────────────────────────── */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    frame: false,
    show: false,
    backgroundColor: '#0e1420',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const loadTarget = IS_DEV ? DEV_URL : path.join(DIST_DIR, 'index.html');
  if (IS_DEV) {
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadFile(loadTarget);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
  }, 1500);
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized-changed', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized-changed', false);
  });
  mainWindow.on('close', (e) => {
    if (!isQuitting && loadConfig().minimizeToTray !== false) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

/* ── 托盘 ──────────────────────────────────────────────── */
function createTray() {
  try {
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAcSURBVDhPY/z//z8DJYCJgUJACkAaGhoGGRgAG28fAfc5+T0AAAAASUVORK5CYII=';
    const icon = nativeImage.createFromBuffer(Buffer.from(pngBase64, 'base64'));
    tray = new Tray(icon);
    tray.setToolTip('Vera 工作台');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '显示主窗口', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]));
    tray.on('click', () => {
      if (mainWindow?.isVisible()) mainWindow.hide();
      else { mainWindow?.show(); mainWindow?.focus(); }
    });
  } catch (err) {
    console.warn('[tray] createTray warning:', err);
  }
}

/* 首次引导（2026-08-17 无总根）：不再强制选择 CLIENT_FILES_ROOT。
 * 案件文件夹 = 每 case 手动选择（应用内操作）；LLM key / OCR 稍后在 .env 配置即可。 */
async function ensureEnv() {
  if (fs.existsSync(ENV_PATH)) return;
  const lines = [
    '# Vera 工作台环境变量（可留空，按需补充）',
    'ENV=development',
    '# DEEPSEEK_API_KEY=',
    '# GEMINI_API_KEY=',
    '# TESSDATA_PREFIX=',
    '',
  ];
  fs.writeFileSync(ENV_PATH, lines.join('\n'), 'utf8');
  console.log('[env] 已生成 .env（占位，可按需补充 AI/OCR 配置）');
}

/* ── IPC ───────────────────────────────────────────────── */
function registerIpc() {
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:toggle-maximize', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.handle('window:close', () => {
    if (loadConfig().minimizeToTray !== false) {
      mainWindow?.hide();
    } else {
      isQuitting = true;
      mainWindow?.close();
    }
  });
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:api-base', () => `http://127.0.0.1:${backendPort}`);
  ipcMain.handle('app:is-maximized', () => mainWindow?.isMaximized() ?? false);
  // 原生目录选择器（F-45：案件文件夹关联 existing/create 共用）
  ipcMain.handle('dialog:choose-directory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: '选择案件文件夹',
      properties: ['openDirectory', 'createDirectory'],
    });
    return canceled ? null : (filePaths[0] ?? null);
  });
  // 系统通知骨架（后端/前端通知 → 系统托盘气泡；V1 接口就绪，接真实通知源后续）
  ipcMain.handle('notify:show', (_e, { title, body }) => {
    const { Notification } = require('electron');
    if (Notification.isSupported()) {
      new Notification({ title: title || 'Vera 工作台', body: body || '' }).show();
    }
  });
}

/* ── 生命周期 ──────────────────────────────────────────── */
app.whenReady().then(async () => {
  registerIpc();
  await ensureEnv();
  await ensureBackend();
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  // 托盘常驻；真正退出由托盘"退出"触发
  if (process.platform !== 'darwin') {
    // 不退出，保留托盘
  }
});

process.on('exit', () => {
  if (backendProc && backendProc.exitCode === null) {
    try { backendProc.kill(); } catch { /* ignore */ }
  }
});

app.on('quit', () => {
  if (backendProc && backendProc.exitCode === null) {
    try { backendProc.kill(); } catch { /* ignore */ }
  }
});
