"""core/case_folder/gap_analysis.py — 主动预判缺口分析（三档渐进第 3 档，WO-33）。

期望清单 vs CaseChecklist 已收 vs 案件文件夹已发现材料。
产物 = 结果卡 + 建议草稿（进 Action Inbox 语义）。红线：不自动改清单状态，无副作用。
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from core.checklist.master_picker import pick_checklist
from core.config import get_config
from core.logger import get_logger
from core.models.orm import Case, CaseChecklist, CaseFile

logger = get_logger(__name__)


def build_suggestion(missing: list[dict], declaration_findings: list[dict]) -> list[dict]:
    """生成建议草稿文案（不落库改状态）。"""
    suggestions: list[dict] = []
    for item in missing:
        name = item.get("name") or item.get("master_id") or "未知材料"
        reason = item.get("reason") or "期望清单要求"
        suggestions.append({
            "type": "missing_material",
            "title": f"建议补交材料：{name}",
            "description": f"缺口原因：{reason}",
            "action_type": "COLLECT_MATERIAL",
            "status": "draft",
            "item_name": name,
        })
    for finding in declaration_findings:
        item_name = str(finding.get("item") or "申报对比")
        evidence = str(finding.get("evidence") or "")
        sugg = str(finding.get("suggestion") or "")
        suggestions.append({
            "type": "declaration_mismatch",
            "title": f"申报一致性提醒：{item_name}",
            "description": f"发现点：{evidence}。建议：{sugg}".rstrip("。"),
            "action_type": "DECLARATION_CHECK",
            "status": "draft",
            "item_name": item_name,
        })
    return suggestions


def analyze_gaps(case: Case, db: Session) -> dict:
    """分析案件材料缺口并出具建议。无副作用（零改动 CaseChecklist 状态）。"""
    if not case or not case.folder_path:
        return {
            "status": "skipped",
            "message": "案件未关联文件夹",
            "summary": "案件未关联文件夹",
            "missing": [],
            "matched": [],
            "suggestions": [],
        }

    # 1. 已收清单项 & 文件夹已识别文件
    checklists = db.query(CaseChecklist).filter(CaseChecklist.case_id == case.id).all()
    received_mids = {c.master_id for c in checklists if c.status == "received" and c.master_id}
    received_names = {c.item_name for c in checklists if c.status == "received" and c.item_name}

    case_files = db.query(CaseFile).filter(CaseFile.case_id == case.id).all()
    file_doc_types = {f.assigned_type for f in case_files if f.assigned_type}

    all_received_types = received_mids | file_doc_types

    # 2. 期望清单预选
    case_info = {
        "case_id": case.id,
        "lender": getattr(case, "lender", None) or "CBA",
        "employment_type": getattr(case, "employment_type", None) or "PAYG",
        "residency": getattr(case, "residency", None) or "PR",
        "purpose": getattr(case, "purpose", None) or "Purchase",
    }
    try:
        expected = pick_checklist(case_info, db, use_ai=False)
    except Exception as exc:  # noqa: BLE001
        logger.warning("pick_checklist failed in gap analysis: %s", exc)
        expected = []

    matched: list[dict] = []
    missing: list[dict] = []

    for item in expected:
        mid = str(item.get("id") or "")
        name = str(item.get("name_zh") or mid)
        if mid in all_received_types or name in received_names:
            matched.append({"master_id": mid, "name": name})
        else:
            missing.append({"master_id": mid, "name": name, "reason": str(item.get("reason") or "")})

    for c in checklists:
        mid = c.master_id
        if c.status == "received":
            if not any(m.get("master_id") == mid or m.get("name") == c.item_name for m in matched):
                matched.append({"master_id": mid or "", "name": c.item_name})
        else:
            if mid and mid in file_doc_types:
                if not any(m.get("master_id") == mid for m in matched):
                    matched.append({"master_id": mid, "name": c.item_name})
            else:
                if not any((mid and m.get("master_id") == mid) or m.get("name") == c.item_name for m in missing + matched):
                    missing.append({"master_id": mid or "", "name": c.item_name, "reason": str(c.ai_suggestion or "")})

    # 3. 申报一致性检查（复用 WO-20 规则引擎）
    declaration_findings: list[dict] = []
    try:
        from core.agents.declaration_check import run_declaration_check
        decl_res = run_declaration_check(case_id=case.id, files=[], folder=str(case.folder_path), db=db)
        if isinstance(decl_res, dict):
            declaration_findings = decl_res.get("findings") or []
    except Exception as exc:  # noqa: BLE001
        logger.warning("declaration_check failed in gap analysis: %s", exc)

    # 4. 汇总建议草稿
    suggestions = build_suggestion(missing, declaration_findings)

    n_miss = len(missing)
    n_warn = len([f for f in declaration_findings if f.get("level") in ("warning", "fail")])
    if n_miss or n_warn:
        summary = f"发现 {n_miss} 项缺失材料" + (f"，{n_warn} 项申报不一致提醒" if n_warn else "")
    else:
        summary = "材料齐全，未发现异常"

    return {
        "status": "success",
        "missing": missing,
        "matched": matched,
        "suggestions": suggestions,
        "summary": summary,
    }


def scan_and_analyze_gaps(db: Session) -> list[dict]:
    """定时扫描全量关联案件进行缺口分析（开关 case_folder.auto_gap.enabled）。"""
    cfg = get_config().settings.case_folder.auto_gap
    if not cfg.enabled:
        return []
    cases = db.query(Case).filter(Case.folder_path.isnot(None), Case.folder_path != "").all()
    results: list[dict] = []
    for case in cases:
        res = analyze_gaps(case, db)
        results.append({"case_id": case.id, "result": res})
    return results
