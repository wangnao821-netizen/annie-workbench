"""Vera Workbench 后端标准启动器 — 加载 .env → 启动前检查 → uvicorn。

用法：
    python run_backend.py              # 默认 0.0.0.0:8000
    python run_backend.py --port 9000  # 指定端口
    python run_backend.py --reload     # 开发热重载

启动前检查 CLIENT_FILES_ROOT 缺失时给出人话提示并退出（配置 fail-fast）。
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def load_dotenv(env_path: Path | None = None) -> dict[str, str]:
    """极简 .env 加载（不覆盖已存在的环境变量）。

    Args:
        env_path: .env 路径；默认项目根/.env。

    Returns:
        本次加载的键值对（用于日志）。
    """
    path = env_path or (PROJECT_ROOT / ".env")
    loaded: dict[str, str] = {}
    if not path.exists():
        return loaded
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value
            loaded[key] = value
    return loaded


def main() -> int:
    parser = argparse.ArgumentParser(description="Vera Workbench 后端启动器")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=int(os.getenv("VERA_PORT", "8000")))
    parser.add_argument("--reload", action="store_true", help="开发热重载")
    args = parser.parse_args()

    loaded = load_dotenv()
    if loaded:
        print(f"[启动] 已从 .env 加载变量: {', '.join(sorted(loaded))}")

    # 2026-08-17：CLIENT_FILES_ROOT 可选（案件文件夹 = 每 case 手动选择的绝对路径）
    if not os.getenv("CLIENT_FILES_ROOT"):
        print("[启动检查] CLIENT_FILES_ROOT 未配置（可选）：文件 Agent 功能在案件关联文件夹后使用。")

    import uvicorn

    print(f"[启动] uvicorn http://{args.host}:{args.port} (reload={args.reload})")
    uvicorn.run("server.main:app", host=args.host, port=args.port, reload=args.reload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
