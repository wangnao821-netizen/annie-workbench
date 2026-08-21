#!/usr/bin/env powershell
<#
.SYNOPSIS
    Vera Workbench packaging pre-step: build web (real-backend mode) + assemble self-contained runtime.

.DESCRIPTION
    Generates electron/staging:
      staging/backend  backend sources (run_backend.py / core / server / config / prompts /
                       alembic.ini / empty data / empty logs / .env.example)
      staging/runtime  portable CPython (full base copy) + trimmed site-packages
                       (no __pycache__, no spacy stack, no pip)
    The web dist is NOT copied here: electron-builder takes it from the ui dir via extraResources.

.PARAMETER WebDir
    Frontend project dir. Defaults to the newest "vera-*" folder under ui/.
.PARAMETER SkipBuild
    Skip the `npm run build` step (use when web dist is already built with the desired env).
.NOTES
    Must be run with a Node/npm available on PATH. VITE_USE_MOCK=false makes the build use the
    real local backend (empty-data delivery).
#>
param(
    [string]$WebDir = "",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
if (-not $WebDir) {
    $WebDir = Join-Path $root "frontend"
}
if (-not (Test-Path $WebDir)) { throw "web dir not found: $WebDir" }
Write-Host "[prepare] web dir: $WebDir"

$staging = Join-Path $PSScriptRoot "staging"

# ---- 1. build web (real backend mode) ----------------------------------
if (-not $SkipBuild) {
    Write-Host "[prepare] building web (VITE_USE_MOCK=false)..."
    $env:VITE_USE_MOCK = "false"
    Push-Location $WebDir
    try {
        npm run build -- --base=./ --mode production
        if ($LASTEXITCODE -ne 0) { throw "web build failed (exit $LASTEXITCODE)" }
    } finally {
        Pop-Location
    }
}

# ---- 2. reset staging ----------------------------------------------------
Write-Host "[prepare] staging -> $staging"
if (Test-Path $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $staging "backend") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $staging "runtime") -Force | Out-Null

# ---- 3. backend sources (empty-data delivery: keep only dir skeletons) ---
Write-Host "[prepare] copying backend sources..."
foreach ($item in @("run_backend.py", "alembic.ini", "core", "server", "config", "prompts", "data", "logs")) {
    Copy-Item -Path (Join-Path $root $item) -Destination (Join-Path $staging "backend") -Recurse -Force
}
Copy-Item -Path (Join-Path $root ".env.example") -Destination (Join-Path $staging "backend") -Force
Get-ChildItem (Join-Path $staging "backend\data") -Recurse -File -ErrorAction SilentlyContinue | Remove-Item -Force
Get-ChildItem (Join-Path $staging "backend\core\data") -Recurse -File -ErrorAction SilentlyContinue | Remove-Item -Force
Get-ChildItem (Join-Path $staging "backend\logs") -Recurse -File -ErrorAction SilentlyContinue | Remove-Item -Force
Get-ChildItem (Join-Path $staging "backend") -Recurse -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
# ---- 4. portable python + trimmed site-packages ---------------------------
Write-Host "[prepare] resolving base python..."
$basePy = $null

# 1. 尝试从 .venv/pyvenv.cfg 读取 home 目录
$pyvenvCfg = Join-Path $root ".venv\pyvenv.cfg"
if (Test-Path $pyvenvCfg) {
    Get-Content $pyvenvCfg | ForEach-Object {
        if ($_ -match '^\s*home\s*=\s*(.+)$') {
            $h = $matches[1].Trim()
            if (Test-Path (Join-Path $h "python.exe")) {
                $basePy = $h
            }
        }
    }
}

# 2. 尝试从 uv 的 Python 缓存目录中动态寻找 3.11
if (-not $basePy) {
    $uvPyDir = Join-Path $env:APPDATA "uv\python"
    if (Test-Path $uvPyDir) {
        $cpython = Get-ChildItem $uvPyDir -Directory -Filter "cpython-3.11*" | Select-Object -First 1
        if ($cpython) { $basePy = $cpython.FullName }
    }
}

# 3. 兜底：当前系统 PATH 里的 python 目录
if (-not $basePy) {
    $sysPy = (Get-Command python.exe -ErrorAction SilentlyContinue).Source
    if ($sysPy) { $basePy = (Split-Path $sysPy -Parent) }
}

if (-not $basePy -or -not (Test-Path $basePy)) {
    throw "Base Python 3.11 directory could not be automatically resolved. Please ensure .venv or Python 3.11 is installed."
}

Write-Host "[prepare] using base python from: $basePy"
Copy-Item -LiteralPath $basePy -Destination (Join-Path $staging "runtime\python") -Recurse -Force

# ---- 4b. OCR tessdata (eng + chi_sim; auto-download if missing) -------------
$tessSrc = Join-Path $PSScriptRoot "tessdata"
$tessDst = Join-Path $staging "runtime\tessdata"
if (-not (Test-Path (Join-Path $tessSrc "eng.traineddata"))) {
    Write-Host "[prepare] tessdata missing, downloading..."
    New-Item -ItemType Directory -Path $tessSrc -Force | Out-Null
    Invoke-WebRequest -Uri "https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata" -OutFile (Join-Path $tessSrc "eng.traineddata") -TimeoutSec 180
    Invoke-WebRequest -Uri "https://github.com/tesseract-ocr/tessdata/raw/main/chi_sim.traineddata" -OutFile (Join-Path $tessSrc "chi_sim.traineddata") -TimeoutSec 180
}
Copy-Item -LiteralPath $tessSrc -Destination $tessDst -Recurse -Force

Write-Host "[prepare] copying site-packages (may take a minute)..."
$spSrc = Join-Path $root ".venv\Lib\site-packages"
$spDst = Join-Path $staging "runtime\site-packages"
Copy-Item -LiteralPath $spSrc -Destination $spDst -Recurse -Force

Write-Host "[prepare] trimming site-packages..."
Get-ChildItem $spDst -Recurse -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
foreach ($name in @("spacy", "spacy-legacy", "spacy-loggers", "thinc", "blis", "preshed",
                    "cymem", "murmurhash", "srsly", "wasabi", "catalogue", "langcodes", "pip")) {
    Get-ChildItem $spDst -Filter "$name*" -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
}

$size = [math]::Round(((Get-ChildItem $staging -Recurse -File | Measure-Object Length -Sum).Sum) / 1MB, 1)
Write-Host "[prepare] done. staging size: $size MB"
