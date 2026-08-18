"""core/case_folder/legacy_import.py — 存量导入预览（WO-50）。

存量案件导入时自动生成预览：找 Broker Notes 提取建档画像（prefilled），
并枚举顶层 "Send to *" 平台目录统计递交状态。只读，不写库。
"""

from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from core.facts.prefill import build_prefill_from_text
from core.pipeline.parser import parse_file

_IGNORED = frozenset({".DS_Store", "Thumbs.db", "desktop.ini", "processed_ids.txt"})


def find_broker_notes(folder: Path) -> Path | None:
    """在案件文件夹根目录或 Send to Lender 子目录查找 Broker Notes 文件。
    优先 .docx，其次 .pdf；glob 模式不区分大小写写法固定为：
    "*roker*otes*.docx" / "*roker*otes*.pdf" / "*roker*ote*.docx" / "*roker*ote*.pdf"。
    找不到返回 None；只读不解析。"""
    roots = [folder]
    try:
        for p in folder.iterdir():
            if p.is_dir() and p.name.lower() == "send to lender":
                roots.append(p)
                break
    except OSError:
        pass
    for pattern in ("*roker*otes*.docx", "*roker*ote*.docx"):
        for root in roots:
            for match in sorted(root.glob(pattern)):
                if match.is_file():
                    return match
    for pattern in ("*roker*otes*.pdf", "*roker*ote*.pdf"):
        for root in roots:
            for match in sorted(root.glob(pattern)):
                if match.is_file():
                    return match
    return None


def build_legacy_import_preview(folder_path: str, db: Session) -> dict:
    """存量导入预览（只读，不写库）：
    1. folder 不存在 → 返回 {"ok": False, "message": "文件夹不存在: {folder_path}"}
    2. 找 Broker Notes → parse_file → build_prefill_from_text(text[:8000], db)
       → prefilled 合并进返回（key 与 PreFillResponse 的 prefilled 一致）；
       Broker Notes 缺失时 prefilled = {}（不报错）。
    3. 枚举顶层 "Send to *" 目录（名不区分大小写、以 "send to " 开头），
       统计每个目录文件数（仅顶层文件 + 递归，含子目录全部文件，忽略 .DS_Store/Thumbs.db/desktop.ini）；
       "Send to Lender" 计入 submissions 但标记 is_lender=true。
    4. 返回：
    {
      "ok": True,
      "broker_notes_found": bool,
      "broker_notes_name": str | None,
      "prefilled": {...},            # 来自 build_prefill_from_text 的 prefilled
      "submissions": [               # 每个 "Send to *" 目录一条
        {"platform": "Lender", "dir_name": "Send to Lender", "file_count": int, "is_lender": bool}
      ],
      "submitted_platforms": [str]   # 非 Lender 且 file_count>0 的目录名（去 "Send to " 前缀）
    }
    """
    folder = Path(folder_path)
    if not folder.is_dir():
        return {"ok": False, "message": f"文件夹不存在: {folder_path}"}

    notes = find_broker_notes(folder)
    prefilled: dict = {}
    broker_notes_name: str | None = None
    if notes is not None:
        broker_notes_name = notes.name
        try:
            parsed = parse_file(notes)
            result = build_prefill_from_text(parsed.text[:8000], db)
            prefilled = result.get("prefilled") or {}
        except Exception:  # noqa: BLE001 — 解析/画像失败降级为空预填，不阻断
            prefilled = {}

    submissions: list[dict] = []
    submitted_platforms: list[str] = []
    try:
        dirs = sorted(
            p for p in folder.iterdir()
            if p.is_dir() and p.name.lower().startswith("send to ")
        )
    except OSError:
        dirs = []
    for d in dirs:
        file_count = 0
        for f in d.rglob("*"):
            if f.is_file() and f.name not in _IGNORED:
                file_count += 1
        is_lender = d.name.lower() == "send to lender"
        platform = d.name[len("Send to "):]
        submissions.append({
            "platform": platform,
            "dir_name": d.name,
            "file_count": file_count,
            "is_lender": is_lender,
        })
        if not is_lender and file_count > 0:
            submitted_platforms.append(platform)

    return {
        "ok": True,
        "broker_notes_found": notes is not None,
        "broker_notes_name": broker_notes_name,
        "prefilled": prefilled,
        "submissions": submissions,
        "submitted_platforms": submitted_platforms,
    }