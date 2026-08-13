"""申报一致性检查 — 外线申报画像 vs 指定材料，结论分层（主文档②）。"""

from __future__ import annotations

import json
import re
from pathlib import Path

from sqlalchemy.orm import Session

from core.agents.evidence import extract_signals
from core.ai.gateway import ApiGateway
from core.config import get_config
from core.context.accumulator import append_context_event
from core.logger import get_logger
from core.models.orm import BrainFact, Case
from core.models.types import DesensitizedText
from core.pii.gateway import desensitize, rehydrate
from core.pipeline import parser

logger = get_logger(__name__)

STATUS_PASS, STATUS_WARNING, STATUS_FAIL, STATUS_UNPARSEABLE = "pass", "warning", "fail", "unparseable"
_MAX_FILE_CHARS = 8000

_ENHANCE_SYSTEM = ("你是贷款申报一致性检查助手。对照申报画像与文件信号找出不一致的额外项目，"
                   '只输出 JSON 数组，每项为 {"item": "维度", "evidence": "证据", "level": "warning" | "fail", "suggestion": "建议"}。')
_ENHANCE_PROMPT = "请找出申报画像与文件信号之间不一致的额外项目，只输出 JSON 数组。"
_EXPLAIN_SYSTEM = "你是贷款经纪人的助理，为银行写一封简短专业的解释信草稿（中文）。"
_EXPLAIN_PROMPT = "客户申报材料与佐证文件存在以下差异，请生成解释信草稿（中文 200 字内，礼貌专业）："
_EXPLAIN_FALLBACK = "就申报材料与佐证文件之间的差异，我们正在整理一致的信息并尽快补充，请贵行谅解。"


def _amount(text: str) -> float:
    m = re.search(r"\d+(?:\.\d+)?", (text or "").replace(",", ""))
    return float(m.group(0)) if m else 0.0


def _target_paths(files: list[str], folder: str | None) -> list[Path]:
    root = get_config().client_files_root if any(not Path(f).is_absolute() for f in files) else None
    targets: list[Path] = []
    seen: set[str] = set()
    for raw in files:
        p = Path(raw)
        if not p.is_absolute():
            p = root / p
        if str(p.absolute()) not in seen:
            seen.add(str(p.absolute()))
            targets.append(p)
    if folder:
        d = Path(folder)
        if not d.is_absolute():
            if root is None:
                root = get_config().client_files_root
            d = root / d
        if d.is_dir():
            for p in sorted(d.iterdir()):
                if p.is_file() and str(p.absolute()) not in seen:
                    seen.add(str(p.absolute()))
                    targets.append(p)
    return targets


def _parse_files(files: list[str], folder: str | None) -> list[tuple[str, str]]:
    results: list[tuple[str, str]] = []
    for p in _target_paths(files, folder):
        try:
            result = parser.parse_file(p)
        except Exception as exc:  # noqa: BLE001 — 单文件解析失败跳过，不阻断
            logger.warning("declaration check: parse failed %s: %s", p, exc)
            continue
        text = (result.text or "")[:_MAX_FILE_CHARS]
        if text.strip():
            results.append((p.name, text))
    return results


def _rule_compare(declaration: dict[str, str], signals: dict[str, list[str]]) -> list[dict]:
    findings: list[dict] = []
    if signals.get("dependents") and _amount(declaration.get("identity.dependents", "")) == 0:
        findings.append({"item": "dependents", "evidence": signals["dependents"][0], "level": "warning",
                         "suggestion": "请确认是否申报子女"})
    if signals.get("income"):
        declared_amt = _amount(" ".join(v for k, v in declaration.items() if k.startswith("income.") and v))
        file_amt = _amount(" ".join(signals["income"]))
        if declared_amt and file_amt and max(declared_amt, file_amt) / min(declared_amt, file_amt) <= 10 and abs(declared_amt - file_amt) / max(declared_amt, file_amt) > 0.2:
            findings.append({"item": "income", "evidence": signals["income"][0], "level": "warning",
                             "suggestion": "文件金额与申报收入差异较大，请确认申报口径"})
    if signals.get("liability"):
        declared_text = " ".join(declaration.get(k, "") for k in ("liability.debt", "liability.credit_cards", "liability.existing_loans"))
        if not declared_text.strip() or _amount(declared_text) == 0:
            findings.append({"item": "liability", "evidence": signals["liability"][0], "level": "warning",
                             "suggestion": "文件含负债相关关键词，请确认是否申报该负债"})
    if signals.get("occupation"):
        declared = (declaration.get("employment.occupation", "") or "").lower()
        file_text = " ".join(signals["occupation"]).lower()
        self_kw = ("自雇", "self-employed", "abn", "董事", "director")
        if declared and any(k in declared for k in self_kw) != any(k in file_text for k in self_kw):
            findings.append({"item": "occupation", "evidence": signals["occupation"][0], "level": "warning",
                             "suggestion": "文件职业信息与申报职业不一致，请确认"})
    if signals.get("visa"):
        declared_res = (declaration.get("identity.residency", "") or "").lower()
        file_text = " ".join(signals["visa"]).lower()
        temp_kw = ("临时", "temp", "visa")
        if declared_res and any(k in declared_res for k in temp_kw) != any(k in file_text for k in temp_kw):
            findings.append({"item": "visa", "evidence": signals["visa"][0], "level": "warning",
                             "suggestion": "文件签证信息与申报身份不一致，请确认"})
    return findings


def _llm_enhance(case_id: str, declaration: dict[str, str], signals: dict[str, list[str]],
                 db: Session) -> list[dict]:
    try:
        payload = ["申报画像："] + [f"- {k}: {v}" for k, v in declaration.items()]
        payload += ["文件信号："] + [f"- {k}: {'；'.join(v)}" for k, v in signals.items() if v]
        safe = desensitize("\n".join(payload), case_id, db)
        result = ApiGateway(get_config()).call_llm(
            text=DesensitizedText(safe), prompt_template=_ENHANCE_PROMPT, system_prompt=_ENHANCE_SYSTEM)
        items = json.loads(rehydrate(result.response_text.strip(), case_id, db))
    except Exception as exc:  # noqa: BLE001 — 补强失败忽略，规则结果保底
        logger.warning("declaration check: LLM enhance failed: %s", exc)
        return []
    keys = ("item", "evidence", "level", "suggestion")
    return [{k: str(it[k]) for k in keys} for it in (items if isinstance(items, list) else [])
            if isinstance(it, dict) and all(k in it for k in keys)]


def _explanation_draft(case_id: str, findings: list[dict], db: Session) -> str:
    lines = "\n".join(f"- {f['item']}: {(f['evidence'] or '')[:80]}" for f in findings[:5])
    try:
        safe = desensitize(lines, case_id, db)
        result = ApiGateway(get_config()).call_llm(
            text=DesensitizedText(safe), prompt_template=_EXPLAIN_PROMPT + lines, system_prompt=_EXPLAIN_SYSTEM)
        return rehydrate((result.response_text or "").strip(), case_id, db) or _EXPLAIN_FALLBACK
    except Exception as exc:  # noqa: BLE001 — 解释信失败回退模板
        logger.warning("declaration check: explanation draft failed: %s", exc)
        return _EXPLAIN_FALLBACK


def _write_event(case_id: str, status: str, findings: list[dict], db: Session) -> None:
    lines = [f"申报一致性检查：{status}"]
    lines += [f"- {f['item']} [{f['level']}]: {(f['evidence'] or '')[:60]}" for f in findings[:5]]
    append_context_event(case_id=case_id, source_type="declaration_check",
                         content="\n".join(lines), db=db, track="internal")


def run_declaration_check(
    case_id: str,
    files: list[str],
    folder: str | None,
    db: Session,
) -> dict:
    """执行申报一致性检查（外线画像 vs 指定材料）：画像→解析→规则比对→LLM补强→status→解释信→写internal事件。"""
    declaration: dict[str, str] = {}
    case = db.query(Case).filter(Case.id == case_id).first()
    if case is not None:
        for fact in (db.query(BrainFact).filter(BrainFact.case_id == case_id,
                                                BrainFact.track == "external",
                                                BrainFact.valid_to.is_(None)).all()):
            declaration[fact.key] = fact.value
        if case.submission_summary:
            declaration["submission_summary"] = case.submission_summary
    if not declaration:
        return {"status": STATUS_FAIL, "findings": [], "summary": "暂无外线申报画像，请先在递交模式建立",
                "draft_explanation": None}

    parsed = _parse_files(files, folder)
    seen: dict[str, int] = {}
    for p in _target_paths(files, folder):
        seen[p.name] = seen.get(p.name, 0) + 1
    for name, _text in parsed:
        seen[name] = seen.get(name, 0) - 1
    unparsed_findings = [{"item": n, "evidence": "文件无法解析", "level": "unparseable",
                          "suggestion": "请人工查看该文件或确认路径"} for n, c in seen.items() if c > 0]

    if not parsed:
        _write_event(case_id, STATUS_UNPARSEABLE, unparsed_findings, db)
        return {"status": STATUS_UNPARSEABLE, "findings": unparsed_findings,
                "summary": "申报一致性检查无法解析指定文件，请人工查看", "draft_explanation": None}

    signals: dict[str, list[str]] = {}
    for _name, text in parsed:
        for dim, hits in extract_signals(text).items():
            for h in hits:
                if h not in signals.setdefault(dim, []):
                    signals[dim].append(h)

    findings = _rule_compare(declaration, signals) + _llm_enhance(case_id, declaration, signals, db)
    findings += unparsed_findings

    status = (STATUS_FAIL if any(f["level"] == "fail" for f in findings)
              else STATUS_WARNING if any(f["level"] == "warning" for f in findings) else STATUS_PASS)
    draft = _explanation_draft(case_id, findings, db) if status in (STATUS_WARNING, STATUS_FAIL) else None
    n = sum(1 for f in findings if f["level"] in ("warning", "fail"))
    summary = "申报一致性检查通过，未发现申报不一致。" if status == STATUS_PASS else (
        f"申报一致性检查发现 {n} 项不一致（预警）。" if status == STATUS_WARNING
        else "申报一致性检查发现不一致项（红色预警），请尽快处理。")
    _write_event(case_id, status, findings, db)
    return {"status": status, "findings": findings, "summary": summary, "draft_explanation": draft}
