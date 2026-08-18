"""core/case_folder/topology.py — 客户目录拓扑扫描与案卷目录名语义解析（WO-53）。

扫描客户根目录，识别所有案卷子目录（多案卷/重递轮次），并从目录名中
解析序号、房产地址、目标机构、方案类型与显式状态（withdrawn / onhold）
及卡点原因。按房产地址聚合、按序号与活跃度排序，推荐最新活跃主案卷。
只读，不写库。
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from core.case_folder.legacy_import import find_broker_notes
from core.facts.prefill import build_prefill_from_text
from core.pipeline.parser import parse_file

# 忽略的文件列表
_IGNORED_FILES = frozenset({".DS_Store", "Thumbs.db", "desktop.ini", "processed_ids.txt"})

# 常见机构关键字
KNOWN_LENDERS = (
    "ORDE", "Zank Financial", "Zank", "Brighten", "Latrobe", "La Trobe",
    "CBA", "ANZ", "Westpac", "NAB", "Macquarie", "St George", "Bankwest",
    "Suncorp", "Pepper", "Liberty", "RedZed", "Resimac", "Firstmac"
)

# 方案类型关键字
DOC_TYPES = ("Alt Doc", "Alt doc", "Lite Doc", "Lite doc", "Full Doc", "Full doc", "Low Doc")

_CJK = "\u4e00-\u9fff"

_SEQ_RE = re.compile(r"^\s*(\d+)[\.\s、_-]")
_RESUB_RE = re.compile(r"resub|重递|转成", re.IGNORECASE)
_WITHDRAWN_RE = re.compile(r"withdrawn|撤回", re.IGNORECASE)
_ONHOLD_RE = re.compile(
    r"onhold|on-hold|暂停|fees not paid|fee not paid|poor val|conflict|unacceptable",
    re.IGNORECASE,
)
_SUBMITTED_RE = re.compile(r"submitted|已递交", re.IGNORECASE)

_ADDR_KEYWORDS = (
    "Street", "St", "Road", "Rd", "Avenue", "Ave", "Parade", "Pde",
    "Drive", "Dr", "Highway", "Hwy", "Boulevard", "Blvd", "Court", "Ct",
    "Place", "Pl", "Crescent", "Cres", "Lane", "Ln", "Granville",
    "Parramatta", "Sydney", "NSW", "VIC", "QLD",
)
_ADDR_KEYWORD_RE = re.compile(
    r"\b(?:" + "|".join(re.escape(k) for k in _ADDR_KEYWORDS) + r")\b",
    re.IGNORECASE,
)

# 方案类型规范化：小写 key → 展示值（取 DOC_TYPES 首个大小写）
_DOC_CANON: dict[str, str] = {}
for _doc in DOC_TYPES:
    _DOC_CANON.setdefault(_doc.lower(), _doc)


def _extract_loan_type(lower: str) -> str:
    """从目录名提取业务方案类型。"""
    if re.search(r"purchase|买房|置业", lower):
        return "Purchase"
    if re.search(r"commercial|商铺", lower):
        return "Commercial"
    if re.search(r"construction|建房|建筑|build", lower):
        return "Construction"
    if re.search(r"refi|refinance|转贷|换行", lower):
        return "Refinance & cash out" if "cash" in lower else "Refinance"
    return "Refinance"


def _match_lender(name: str) -> str | None:
    """遍历 KNOWN_LENDERS 做不区分大小写前缀/单词匹配（允许后接中文）。"""
    for lender in KNOWN_LENDERS:
        pattern = rf"{re.escape(lender)}(?=\W|$|[{_CJK}])"
        if re.search(pattern, name, re.IGNORECASE):
            return lender
    return None


def _extract_doc_type(lower: str) -> str | None:
    """提取方案类型（Alt Doc / Lite Doc / Full Doc / Low Doc）。"""
    for key, canon in _DOC_CANON.items():
        if key in lower:
            return canon
    return None


def _extract_address(name: str) -> str | None:
    """按分隔符切分并找出地址片段，去掉尾部括号备注后合并。"""
    hits: list[str] = []
    for part in re.split(r"\s*[-–—]\s*", name):
        part = part.strip()
        if not part:
            continue
        starts_with_number = bool(re.match(r"^\d+\s+[A-Za-z]", part))
        if not (starts_with_number or _ADDR_KEYWORD_RE.search(part)):
            continue
        cleaned = re.sub(r"\s*\([^)]*\)\s*$", "", part).strip(" ,;:-–—")
        if cleaned:
            hits.append(cleaned)
    return ", ".join(hits) if hits else None


def _extract_onhold_reason(name: str) -> str:
    """提取 onhold 卡点原因：优先映射已知短语，否则回退到原始目录文字。"""
    lower = name.lower()
    if "poor val" in lower:
        return "估价过低阻断，进入复议"
    if "fees not paid" in lower or "fee not paid" in lower:
        return "估价费未支付"
    if "conflict" in lower:
        return "利益冲突/政策合规阻断"
    if "unacceptable" in lower:
        return "物业评估不合规"
    for part in re.split(r"\s*[-–—]\s*", name):
        if re.search(r"onhold|on-hold|暂停", part, re.IGNORECASE):
            return part.strip(" -()") or name
    return name


def parse_case_folder_name(dir_name: str) -> dict[str, Any]:
    """解析单个案卷子目录名称的语义元数据。

    示例输入：
    "8. Refi & cash - ORDE小号 - 84 Louis St (Alt doc) - onhold due to poor val"
    "2. Resub - Refinance & cash out - Zank Financial - 84 Louis Street, Granville NSW 2142 - Withdrawn"
    "5. Resub - Refinance & cash out - Brighten - 84 Louis St (Alt Doc) - Val Fees Not Paid"

    返回字典结构：
    {
      "sequence": int | None,          # 8
      "is_resub": bool,                # False / True (是否有 Resub / 重递)
      "loan_type": str,                # "Refinance & cash out" / "Purchase" / "Commercial" 等
      "lender": str | None,            # "ORDE" / "Zank Financial" 等
      "property_address": str | None,  # "84 Louis St" / "84 Louis Street, Granville NSW 2142"
      "doc_type": str | None,          # "Alt Doc" / "Lite Doc" / "Full Doc"
      "status": str,                   # "active" / "withdrawn" / "onhold" / "submitted"
      "onhold_reason": str | None,     # "估价过低阻断" / "估价费未支付" / "利益冲突" / 原始文字
    }
    """
    name = dir_name.strip()
    lower = name.lower()

    seq_match = _SEQ_RE.match(name)
    sequence = int(seq_match.group(1)) if seq_match else None
    is_resub = bool(_RESUB_RE.search(lower))

    if _WITHDRAWN_RE.search(lower):
        status = "withdrawn"
    elif _ONHOLD_RE.search(lower):
        status = "onhold"
    elif _SUBMITTED_RE.search(lower):
        status = "submitted"
    else:
        status = "active"

    return {
        "sequence": sequence,
        "is_resub": is_resub,
        "loan_type": _extract_loan_type(lower),
        "lender": _match_lender(name),
        "property_address": _extract_address(name),
        "doc_type": _extract_doc_type(lower),
        "status": status,
        "onhold_reason": _extract_onhold_reason(name) if status == "onhold" else None,
    }


def _is_case_dir(name: str) -> bool:
    """判定是否为案卷子目录：数字序号开头，或包含已知机构名。"""
    return bool(_SEQ_RE.match(name)) or _match_lender(name) is not None


def _count_files(folder: Path) -> int:
    """递归统计有效文件数（忽略 _IGNORED_FILES）。"""
    return sum(
        1 for f in folder.rglob("*")
        if f.is_file() and f.name not in _IGNORED_FILES
    )


def _submitted_platforms(folder: Path) -> list[str]:
    """枚举 "Send to *" 目录，返回有递交文件的平台名（不含 Lender）。"""
    platforms: list[str] = []
    try:
        dirs = sorted(
            p for p in folder.iterdir()
            if p.is_dir() and p.name.lower().startswith("send to ")
        )
    except OSError:
        return platforms
    for d in dirs:
        if d.name.lower() == "send to lender":
            continue
        count = sum(
            1 for f in d.rglob("*")
            if f.is_file() and f.name not in _IGNORED_FILES
        )
        if count > 0:
            platforms.append(d.name[len("Send to "):])
    return platforms


def _build_case_meta(case_dir: Path, db: Session | None) -> dict[str, Any]:
    """构建单个案卷的元数据字典（含 Broker Notes 画像与平台递交）。"""
    parsed = parse_case_folder_name(case_dir.name)
    notes = find_broker_notes(case_dir)
    prefilled: dict = {}
    if notes is not None and db is not None:
        try:
            parsed_doc = parse_file(notes)
            result = build_prefill_from_text(parsed_doc.text[:8000], db)
            prefilled = result.get("prefilled") or {}
        except Exception:  # noqa: BLE001 — 解析/画像失败降级为空预填，不阻断
            prefilled = {}
    return {
        "dir_name": case_dir.name,
        "folder_path": str(case_dir),
        "sequence": parsed["sequence"],
        "is_resub": parsed["is_resub"],
        "loan_type": parsed["loan_type"],
        "lender": parsed["lender"],
        "property_address": parsed["property_address"],
        "doc_type": parsed["doc_type"],
        "status": parsed["status"],
        "onhold_reason": parsed["onhold_reason"],
        "is_recommended_active": False,
        "has_broker_notes": notes is not None,
        "broker_notes_name": notes.name if notes is not None else None,
        "file_count": _count_files(case_dir),
        "prefilled": prefilled,
        "submitted_platforms": _submitted_platforms(case_dir),
    }


def scan_customer_topology(folder_path: str, db: Session | None = None) -> dict[str, Any]:
    """扫描客户根目录，发现所有案卷子目录并返回结构化拓扑信息。

    规则：
    1. 根目录不存在 ➔ 返回 {"ok": False, "message": "..."}
    2. 客户姓名 client_name 取根目录名称（如 "Yingkun CHEN"）。
    3. 枚举根目录下所有子目录：
       - 若子目录名以数字序号开头（如 "1. ...", "8. ..."）或包含已知机构名，判定为案卷子目录；
       - 统计子目录内有效文件数（递归忽略 _IGNORED_FILES）；
       - 检查是否存在 Broker Notes（find_broker_notes）；若有且传入 db，提取 prefilled 画像；
       - 识别最新活跃推荐案卷：排除 status == "withdrawn" 的案卷，按 sequence 倒序、
         文件数倒序，排在第一的标记 is_recommended_active = True。
    4. 若根目录下没有发现案卷子目录（即本身就是单案卷目录），将当前目录作为唯一案卷返回。
    """
    root = Path(folder_path)
    if not root.is_dir():
        return {"ok": False, "message": f"文件夹不存在: {folder_path}"}

    try:
        subdirs = sorted(p for p in root.iterdir() if p.is_dir())
    except OSError:
        subdirs = []

    case_dirs = [p for p in subdirs if _is_case_dir(p.name)]
    if not case_dirs:
        case_dirs = [root]

    cases = [_build_case_meta(case_dir, db) for case_dir in case_dirs]

    active = [c for c in cases if c["status"] != "withdrawn"]
    active.sort(key=lambda c: (c["sequence"] or 0, c["file_count"]), reverse=True)
    if active:
        active[0]["is_recommended_active"] = True

    return {
        "ok": True,
        "message": None,
        "client_name": root.name,
        "client_root": str(root),
        "cases": cases,
    }