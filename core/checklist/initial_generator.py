"""首次材料清单种子 — 模板驱动（WO-74 Step 5）。

读 config/checklist_templates/preliminary_assessment.yaml + 案件画像裁剪，
写 CaseChecklist(phase="initial")；condition 项（银行/OS 追加）永不被动。
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from core.checklist.email_draft import (
    _apply_trim,
    _load_master_index,
    _load_template,
    _validate_refs,
)
from core.models.orm import Case, CaseChecklist


def generate_initial_checklist(
    case_id: str,
    db: Session,
    replace: bool = True,
) -> list[CaseChecklist]:
    """读首次模板 + 案件画像裁剪 → 写 CaseChecklist(phase="initial")。

    Args:
        case_id: 案件 ID。
        db: SQLAlchemy session。
        replace: True 时先删除该案既有 initial 项再重建（regenerate 语义）。

    Returns:
        新建的 CaseChecklist 行。

    Raises:
        ValueError: 案件不存在 / 模板 ref 或 trim add 未命中 master。
    """
    case = db.query(Case).filter(Case.id == case_id).first()
    if case is None:
        raise ValueError(f"case {case_id} not found")

    master_index = _load_master_index()
    template = _load_template()
    _validate_refs(template, master_index)

    trim_adds = [
        ref
        for rule in template.get("trim_rules", [])
        for ref in rule.get("add", [])
    ]
    for ref in trim_adds:
        if ref not in master_index:
            raise ValueError(f"template trim add '{ref}' not found in checklist_master")

    profile = {
        "employment_type": case.employment_type or "PAYG",
        "residency": case.residency or "PR",
        "purpose": case.purpose or "Purchase",
        "lender": case.lender or "",
    }

    sections: list[dict] = []
    for section in template.get("sections", []):
        documents: list[dict] = []
        info: list[dict] = []
        for raw in section.get("items", []):
            ref = raw["ref"] if isinstance(raw, dict) else raw
            kind = master_index.get(ref, {}).get("kind", "document")
            (info if kind == "info" else documents).append({"ref": ref})
        sections.append(
            {"id": section.get("id"), "documents": documents, "info": info}
        )

    sections = _apply_trim(sections, template.get("trim_rules", []), profile)

    if replace:
        db.query(CaseChecklist).filter(
            CaseChecklist.case_id == case_id,
            CaseChecklist.phase == "initial",
        ).delete(synchronize_session=False)

    rows: list[CaseChecklist] = []
    for sec in sections:
        for entry in sec.get("documents", []) + sec.get("info", []):
            ref = entry["ref"]
            master = master_index[ref]
            rows.append(
                CaseChecklist(
                    case_id=case_id,
                    item_name=master.get("name_zh", ref),
                    category=master.get("category", "special"),
                    is_required=True,
                    status="pending",
                    master_id=ref,
                    phase="initial",
                    item_kind=master.get("kind", "document"),
                )
            )
    db.add_all(rows)
    db.commit()
    for row in rows:
        db.refresh(row)
    return rows
