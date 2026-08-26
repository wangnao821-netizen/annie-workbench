"""core/case_folder/topology.py — 客户目录拓扑扫描与案卷目录名语义解析（WO-53 & 大规模批量存量升级）。

功能特性：
1. 自适应根目录识别：智能区分「单客户目录」与「多客户大根目录（包含几百位客户）」；
2. 三大形态智能分流：
   - 形态 A (Multi-case)：多案卷客户（1. Pre approval, 2. Purchase, 8. Refi 等）；
   - 形态 B (Single-case)：标准单案卷客户（直接存放 Send to Lender, Valuation 等）；
   - 形态 C (Lead / Consultation)：早期咨询/散装文件（Meeting Notes 等，标记为潜客）；
3. 四级状态精确识别：活跃在途 (active)、暂停卡点 (onhold)、已放款结案 (settled)、终止撤回 (closed)、咨询潜客 (lead)；
4. 客户名清洗、联名借款人拆解与推荐人渠道（Referral Source）智能提取；
5. 自动黑名单过滤（临时文件、测试目录、空目录等）；
6. 毫秒级性能保障，纯规则极速扫描数百位客户。只读，不写库。
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from core.case_folder.legacy_import import find_broker_notes
from core.logger import get_logger

logger = get_logger(__name__)

# 忽略的文件和目录黑名单
_IGNORED_FILES = frozenset({
    ".DS_Store", "Thumbs.db", "desktop.ini", "processed_ids.txt"
})

_BLACKLIST_DIR_NAMES = frozenset({
    "template", "anbc- test", "test", "0", ".davfs.tmp", "__pycache__",
    "process and template", "signature", "template - email", "create folder",
    "don't send", "dont send", "resend 2 - dl address"
})

# 常见机构关键字
KNOWN_LENDERS = (
    "ORDE", "Zank Financial", "Zank", "Brighten", "Latrobe", "La Trobe",
    "CBA", "ANZ", "Westpac", "NAB", "Macquarie", "St George", "Bankwest",
    "Suncorp", "Pepper", "Liberty", "RedZed", "Resimac", "Firstmac", "BOC",
    "AMP Bank", "AMP", "MyState", "Bank of China", "Heritage"
)

# 方案类型关键字
DOC_TYPES = ("Alt Doc", "Alt doc", "Lite Doc", "Lite doc", "Full Doc", "Full doc", "Low Doc")

_CJK = "\u4e00-\u9fff"

_SEQ_RE = re.compile(r"^\s*(\d+)[\.\s、_-]")
_RESUB_RE = re.compile(r"resub|重递|转成", re.IGNORECASE)
_SETTLED_RE = re.compile(r"settled|settle\s+on|done|cash\s+settled|已放款|已结算|放款", re.IGNORECASE)
_CLOSED_RE = re.compile(r"withdrawn|撤回|sold|stopped|stop\s+due|declined|rejected|cancel|0\.\s*stopped", re.IGNORECASE)
_ONHOLD_RE = re.compile(
    r"onhold|on-hold|暂停|fees?\s+not\s+paid|poor\s+val|conflict|unacceptable",
    re.IGNORECASE,
)
_SUBMITTED_RE = re.compile(r"submitted|已递交", re.IGNORECASE)

_ADDR_KEYWORDS = (
    "Street", "St", "Road", "Rd", "Avenue", "Ave", "Parade", "Pde",
    "Drive", "Dr", "Highway", "Hwy", "Boulevard", "Blvd", "Court", "Ct",
    "Place", "Pl", "Crescent", "Cres", "Lane", "Ln", "Circuit", "Cct",
    "Way", "Close", "Cl", "Granville", "Parramatta", "Sydney", "NSW", "VIC", "QLD", "ACT"
)
_ADDR_KEYWORD_RE = re.compile(
    r"\b(?:" + "|".join(re.escape(k) for k in _ADDR_KEYWORDS) + r")\b",
    re.IGNORECASE,
)

# 方案类型规范化
_DOC_CANON: dict[str, str] = {}
for _doc in DOC_TYPES:
    _DOC_CANON.setdefault(_doc.lower(), _doc)


def _is_broker_folder(name: str) -> bool:
    """判定是否为其他 Broker 汇聚目录（如 0. Lily S - Clients 或 Boning He (Brandon) Client）。"""
    lower = name.lower().strip()
    if _is_blacklisted_dir(name):
        return False
    return bool(re.search(r"[-_\s]clients?\b|\bclient\s*-\s*rb\b|\bclients\b", lower))


def _clean_broker_name(name: str) -> str:
    """清洗提取 Broker 姓名（如 '0. Lily S - Clients' ➔ 'Lily S'）。"""
    raw = re.sub(r"^\s*\d+[\.\s、_-]+", "", name).strip()
    raw = re.sub(r"[-_\s]*(?:clients?|client\s*-\s*rb)\b.*$", "", raw, flags=re.IGNORECASE).strip()
    return raw or name


def _parse_client_folder_name(name: str) -> dict[str, Any]:
    """从客户目录名中提取纯净客户姓名、联名借款人、转介绍渠道与昵称。"""
    raw = name.strip()
    # 1. 脱掉开头的数字序号（如 "1. ", "17. ", "01- " 等）
    raw = re.sub(r"^\s*\d+[\.\s、_-]+", "", raw).strip()

    referrer = None
    # 2. 提取推荐人 - ... 推荐 / ... Ref / ... referral
    ref_match = re.search(r"[-–—]\s*([^–—]+?)\s*(?:推荐|referral|refer|ref|的朋友|朋友)\b", raw, re.IGNORECASE)
    if ref_match:
        referrer = ref_match.group(1).strip()
        raw = raw[:ref_match.start()].strip(" -–—")

    co_borrowers: list[str] = []
    parts = re.split(r"\s*(?:&|\band\b|\+)\s*", raw)
    main_client = parts[0].strip()
    if len(parts) > 1:
        for p in parts[1:]:
            cleaned_p = re.sub(r"\s*\([^)]*\)\s*", "", p).strip(" -–—")
            if cleaned_p:
                co_borrowers.append(cleaned_p)

    clean_name = re.sub(r"\s*\([^)]*\)\s*", "", main_client).strip(" -–—")
    return {
        "client_name": clean_name or name,
        "raw_name": name,
        "co_borrowers": co_borrowers,
        "referrer_name": referrer,
    }


def _extract_loan_type(lower: str) -> str:
    """从目录名提取业务方案类型。"""
    if re.search(r"purchase|买房|置业", lower):
        return "Purchase"
    if re.search(r"commercial|商铺", lower):
        return "Commercial"
    if re.search(r"construction|建房|建筑|build", lower):
        return "Construction"
    if re.search(r"pre[\s-]?approval|预批", lower):
        return "Pre-approval"
    if re.search(r"refi|refinance|转贷|换行", lower):
        return "Refinance & cash out" if "cash" in lower else "Refinance"
    return "Refinance"


def _match_lender(name: str) -> str | None:
    """遍历 KNOWN_LENDERS 做不区分大小写前缀/单词匹配。"""
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
    """按分隔符切分并找出地址片段。"""
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
    """提取 onhold 卡点原因。"""
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
    """解析单个案卷子目录名称的语义元数据与四级状态。"""
    name = dir_name.strip()
    lower = name.lower()

    seq_match = _SEQ_RE.match(name)
    sequence = int(seq_match.group(1)) if seq_match else None
    is_resub = bool(_RESUB_RE.search(lower))

    if _SETTLED_RE.search(lower):
        status = "settled"
    elif _CLOSED_RE.search(lower):
        status = "closed"
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
    """判定是否为案卷子目录：包含明确贷款类型或已知机构名或业务阶段（解耦纯数字序号）。"""
    lower = name.lower().strip()
    if _is_blacklisted_dir(name):
        return False
    has_loan_kw = any(
        kw in lower for kw in [
            "refi", "refinance", "purchase", "cash out", "cashout",
            "pre approval", "pre-approval", "preapproval", "construction",
            "commercial", "car loan", "equity", "top up", "variation",
            "买房", "转贷", "预批", "商贷", "建房"
        ]
    )
    has_lender = _match_lender(name) is not None
    has_stage = _is_business_stage_dir(name)
    return has_loan_kw or has_lender or has_stage


def _is_business_stage_dir(name: str) -> bool:
    """判定是否为单案卷内的业务阶段文件夹。"""
    lower = name.lower()
    return any(kw in lower for kw in [
        "send to", "valuation", "approval", "settlement", "to be signed",
        "discharge", "loan documents", "internal compliance", "post settlement"
    ])


def _is_blacklisted_dir(dir_name: str) -> bool:
    """过滤黑名单和系统临时文件夹。"""
    lower = dir_name.lower().strip()
    if lower.startswith((".", ".davfs")) or lower.endswith("_caseconflict"):
        return True
    return lower in _BLACKLIST_DIR_NAMES


def _count_files(folder: Path) -> int:
    """快速统计顶层及直接业务子目录文件数（浅层统计，极速保障）。"""
    count = 0
    try:
        for p in folder.iterdir():
            if p.is_file() and p.name not in _IGNORED_FILES and not p.name.startswith("."):
                count += 1
            elif p.is_dir() and not p.name.startswith("."):
                try:
                    for sub in p.iterdir():
                        if sub.is_file() and sub.name not in _IGNORED_FILES and not sub.name.startswith("."):
                            count += 1
                except OSError:
                    pass
    except OSError:
        pass
    return count


def _submitted_platforms(folder: Path) -> list[str]:
    """枚举 "Send to *" 目录，返回有递交文件的平台名。"""
    platforms: list[str] = []
    try:
        dirs = [
            p for p in folder.iterdir()
            if p.is_dir() and p.name.lower().startswith("send to ")
        ]
        for d in dirs:
            if d.name.lower() == "send to lender":
                continue
            try:
                has_files = any(f.is_file() for f in d.iterdir() if f.name not in _IGNORED_FILES and not f.name.startswith("."))
                if has_files:
                    platforms.append(d.name[len("Send to "):])
            except OSError:
                pass
    except OSError:
        pass
    return platforms


def _quick_rule_extract_notes(notes_file: Path) -> dict[str, Any]:
    """快速从 Broker Notes 文件中正则提取画像（轻量毫秒级，异常静默跳过，绝不阻塞重试）。"""
    res: dict[str, Any] = {}
    text = ""
    try:
        suffix = notes_file.suffix.lower()
        if suffix == ".docx":
            import docx

            doc = docx.Document(str(notes_file))
            paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
            text = "\n".join(paragraphs[:60])
        elif suffix == ".txt":
            text = notes_file.read_text(encoding="utf-8", errors="ignore")[:4000]
        elif suffix == ".pdf":
            try:
                import pypdf

                reader = pypdf.PdfReader(str(notes_file))
                if reader.pages:
                    text = reader.pages[0].extract_text() or ""
            except Exception:  # noqa: BLE001
                text = ""
    except Exception:  # noqa: BLE001
        text = ""

    if not text:
        return res

    m_email = re.search(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", text)
    if m_email:
        res["client_email"] = m_email.group(0)
    m_phone = re.search(r"(?:04\d{2}[\s-]?\d{3}[\s-]?\d{3}|\+61[\s-]?4\d{2}[\s-]?\d{3}[\s-]?\d{3})", text)
    if m_phone:
        res["client_phone"] = m_phone.group(0)
    if re.search(r"\bPR\b|Permanent|永居|Citizen|公民", text, re.IGNORECASE):
        res["residency"] = "Citizen/PR"
    elif re.search(r"\bTR\b|Temporary|485|500|Visa", text, re.IGNORECASE):
        res["residency"] = "TR"
    if re.search(r"Self[\s-]?employed|自雇|ABN|Sole trader|S/E\b", text, re.IGNORECASE):
        res["employment_type"] = "Self-employed"
    elif re.search(r"PAYG|Full[\s-]?time|全职|Employee", text, re.IGNORECASE):
        res["employment_type"] = "PAYG"
    m_purpose = re.search(r"(?:LOAN\s+PURPOSE|PURPOSE|客户目标|贷款目的)\s*[:：\n_]+\s*([^\n_]+(?:\n[^\n_]+)?)", text, re.IGNORECASE)
    if m_purpose:
        clean_goal = " ".join(line.strip() for line in m_purpose.group(1).splitlines() if line.strip())
        if clean_goal and len(clean_goal) > 3:
            res["client_goal"] = clean_goal[:200]
    m_rate = re.search(r"(?:Rate|Interest\s*Rate|利率)\s*[:：\t\s]+([0-9]+(?:\.[0-9]+)?)\s*%", text, re.IGNORECASE)
    if m_rate:
        try:
            res["interest_rate"] = float(m_rate.group(1))
        except (ValueError, TypeError):
            pass
    m_amount = re.search(r"(?:Loan\s*Amount|Borrow|借款|贷款|Amount)[^\d]*\$?\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]{4,9})", text, re.IGNORECASE)
    if m_amount:
        try:
            res["loan_amount"] = float(m_amount.group(1).replace(",", ""))
        except (ValueError, TypeError):
            pass
    m_val = re.search(r"(?:Security\s*Value|Property\s*Value|房产价值|房屋估价|Estimated\s*Value)[^\d]*\$?\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]{4,9})", text, re.IGNORECASE)
    if m_val:
        try:
            res["property_value"] = float(m_val.group(1).replace(",", ""))
        except (ValueError, TypeError):
            pass
    m_sec = re.search(r"(?:Underlying\s*Security|Security\s*Address|Property\s*Address|抵押物地址|房产地址)\s*[:：\t\s]+([^\n_]+)", text, re.IGNORECASE)
    if m_sec:
        res["property_address"] = m_sec.group(1).strip()
    return res


def _build_case_meta(
    case_dir: Path,
    db: Session | None,
    client_name: str | None = None,
    client_category: str = "standard",
    referrer_name: str | None = None,
    co_borrowers: list[str] | None = None,
    broker_name: str | None = None,
) -> dict[str, Any]:
    """构建单个案卷的元数据字典。"""
    parsed = parse_case_folder_name(case_dir.name)
    notes = find_broker_notes(case_dir)
    prefilled: dict = {}
    if notes is not None:
        prefilled = _quick_rule_extract_notes(notes)

    already_imported = False
    existing_case_id = None
    existing_stage = None
    if db is not None:
        from core.models.orm import Case

        posix_path = case_dir.as_posix()
        str_path = str(case_dir)
        existing = (
            db.query(Case)
            .filter((Case.folder_path == posix_path) | (Case.folder_path == str_path))
            .first()
        )
        if existing is not None:
            already_imported = True
            existing_case_id = existing.id
            existing_stage = existing.stage

    return {
        "dir_name": case_dir.name,
        "folder_path": str(case_dir),
        "client_name": client_name,
        "client_category": client_category,
        "sequence": parsed["sequence"],
        "is_resub": parsed["is_resub"],
        "loan_type": parsed["loan_type"],
        "lender": parsed["lender"],
        "property_address": parsed["property_address"] or prefilled.get("property_address"),
        "doc_type": parsed["doc_type"],
        "status": parsed["status"],
        "onhold_reason": parsed["onhold_reason"],
        "is_recommended_active": False,
        "has_broker_notes": notes is not None,
        "broker_notes_name": notes.name if notes is not None else None,
        "file_count": _count_files(case_dir),
        "prefilled": prefilled,
        "submitted_platforms": _submitted_platforms(case_dir),
        "already_imported": already_imported,
        "existing_case_id": existing_case_id,
        "existing_stage": existing_stage,
        "referrer_name": referrer_name,
        "co_borrowers": co_borrowers or [],
        "broker_name": broker_name,
    }


def _scan_single_client(client_dir: Path, db: Session | None, broker_name: str | None = None) -> dict[str, Any]:
    """扫描单个客户文件夹下的案卷拓扑，自动识别多案卷/单案卷/潜客形态。"""
    c_info = _parse_client_folder_name(client_dir.name)
    clean_client_name = c_info["client_name"]
    referrer_name = c_info["referrer_name"]
    co_borrowers = c_info["co_borrowers"]

    try:
        subdirs = sorted(p for p in client_dir.iterdir() if p.is_dir() and not _is_blacklisted_dir(p.name))
        direct_files = [f for f in client_dir.iterdir() if f.is_file() and f.name not in _IGNORED_FILES and not f.name.startswith(".")]
    except OSError:
        subdirs, direct_files = [], []

    case_subdirs = [p for p in subdirs if _is_case_dir(p.name)]
    business_subdirs = [p for p in subdirs if _is_business_stage_dir(p.name)]

    cases: list[dict[str, Any]] = []
    category = "single_case"

    if case_subdirs:
        # 形态 A：多案卷客户
        category = "multi_case"
        for sub in case_subdirs:
            meta = _build_case_meta(
                sub, db,
                client_name=clean_client_name,
                client_category="multi_case",
                referrer_name=referrer_name,
                co_borrowers=co_borrowers,
                broker_name=broker_name,
            )
            cases.append(meta)
    elif business_subdirs or (len(direct_files) > 3):
        # 形态 B：标准单案卷
        category = "single_case"
        meta = _build_case_meta(
            client_dir, db,
            client_name=clean_client_name,
            client_category="single_case",
            referrer_name=referrer_name,
            co_borrowers=co_borrowers,
            broker_name=broker_name,
        )
        cases.append(meta)
    elif direct_files:
        # 形态 C：咨询潜客
        category = "lead"
        meta = _build_case_meta(
            client_dir, db,
            client_name=clean_client_name,
            client_category="lead",
            referrer_name=referrer_name,
            co_borrowers=co_borrowers,
            broker_name=broker_name,
        )
        meta["status"] = "lead"
        cases.append(meta)

    # 推荐主力活跃案卷（排除 closed / settled / lead 案卷）
    active_candidates = [c for c in cases if c["status"] in ("active", "onhold")]
    active_candidates.sort(key=lambda c: (c["sequence"] or 0, c["file_count"]), reverse=True)
    if active_candidates:
        active_candidates[0]["is_recommended_active"] = True

    return {
        "client_name": clean_client_name,
        "client_folder": str(client_dir),
        "client_category": category,
        "referrer_name": referrer_name,
        "co_borrowers": co_borrowers,
        "broker_name": broker_name,
        "total_cases": len(cases),
        "active_cases": sum(1 for c in cases if c["is_recommended_active"] or c["status"] in ("active", "onhold")),
        "cases": cases,
    }


def scan_customer_topology(folder_path: str, db: Session | None = None) -> dict[str, Any]:
    """智能扫描客户或多客户总根目录，自动识别层级并返回结构化拓扑信息。"""
    root = Path(folder_path)
    if not root.is_dir():
        return {"ok": False, "message": f"文件夹不存在: {folder_path}"}

    try:
        top_subdirs = sorted(p for p in root.iterdir() if p.is_dir() and not _is_blacklisted_dir(p.name))
    except OSError as e:
        return {"ok": False, "message": f"读取目录失败: {e}"}

    case_like_count = sum(1 for p in top_subdirs if _is_case_dir(p.name))
    total_subdirs = len(top_subdirs)

    # 智能判定是否为「多客户大根目录」：
    # 1. 包含 Broker 汇聚夹（如 0. Lily S - Clients）；
    # 2. 或包含多个子目录，且大部分子目录不是业务案卷（即它们是客户主体文件夹而非 Purchase/Refinance 案卷目录）。
    is_root_multi_client = bool(
        any(_is_broker_folder(p.name) for p in top_subdirs)
        or (total_subdirs >= 2 and (case_like_count / max(total_subdirs, 1)) < 0.5)
    )

    if is_root_multi_client:
        clients_meta: list[dict[str, Any]] = []
        all_cases: list[dict[str, Any]] = []
        summary = {
            "total_clients": 0,
            "multi_case_clients": 0,
            "single_case_clients": 0,
            "lead_clients": 0,
            "total_cases": 0,
            "recommended_active_cases": 0,
        }

        def _append_client(c_meta: dict[str, Any]) -> None:
            summary["total_clients"] += 1
            if c_meta["client_category"] == "multi_case":
                summary["multi_case_clients"] += 1
            elif c_meta["client_category"] == "single_case":
                summary["single_case_clients"] += 1
            elif c_meta["client_category"] == "lead":
                summary["lead_clients"] += 1

            summary["total_cases"] += c_meta["total_cases"]
            summary["recommended_active_cases"] += sum(1 for c in c_meta["cases"] if c.get("is_recommended_active"))
            clients_meta.append(c_meta)
            all_cases.extend(c_meta["cases"])

        for item in top_subdirs:
            if _is_broker_folder(item.name):
                # 穿透展开 Broker 文件夹
                b_name = _clean_broker_name(item.name)
                try:
                    broker_clients = sorted(p for p in item.iterdir() if p.is_dir() and not _is_blacklisted_dir(p.name))
                except OSError:
                    broker_clients = []

                for c_dir in broker_clients:
                    try:
                        c_meta = _scan_single_client(c_dir, db, broker_name=b_name)
                        if not c_meta["cases"]:
                            continue
                        _append_client(c_meta)
                    except Exception as exc:  # noqa: BLE001
                        logger.debug("scan client failed for %s: %s", c_dir, exc)
            else:
                try:
                    c_meta = _scan_single_client(item, db, broker_name=None)
                    if not c_meta["cases"]:
                        continue
                    _append_client(c_meta)
                except Exception as exc:  # noqa: BLE001
                    logger.debug("scan client failed for %s: %s", item, exc)

        return {
            "ok": True,
            "message": None,
            "is_root_multi_client": True,
            "client_name": root.name,
            "client_root": str(root),
            "summary": summary,
            "clients": clients_meta,
            "cases": all_cases,
        }

    # 单客户模式
    single_res = _scan_single_client(root, db)
    return {
        "ok": True,
        "message": None,
        "is_root_multi_client": False,
        "client_name": single_res["client_name"],
        "client_root": str(root),
        "summary": {
            "total_clients": 1,
            "multi_case_clients": 1 if single_res["client_category"] == "multi_case" else 0,
            "single_case_clients": 1 if single_res["client_category"] == "single_case" else 0,
            "lead_clients": 1 if single_res["client_category"] == "lead" else 0,
            "total_cases": single_res["total_cases"],
            "recommended_active_cases": sum(1 for c in single_res["cases"] if c.get("is_recommended_active")),
        },
        "clients": [single_res],
        "cases": single_res["cases"],
    }
