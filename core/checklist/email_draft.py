"""Preliminary Assessment 邮件草稿引擎 — 模板驱动、固定措辞、不调 LLM。

设计（WO-75 §三.3）：
    - 从 config/checklist_templates/preliminary_assessment.yaml 读取首次材料模板；
    - 模板 items 的 ref 必须命中 config/checklist_master.yaml，否则抛 ValueError
      （端点层转 422，禁止静默跳过）；
    - 按 trim_rules + 案件画像（employment_type / residency / purpose / lender）裁剪；
    - 固定措辞（Q2=方案A），不调用 LLM，不做个性化润色；
    - 只生成草稿并落草稿箱（status=draft），绝不自动发送。

信息项（kind: info）在邮件中以「Please provide the following information」小节列出，
不写成文档项。
"""

from __future__ import annotations

from pathlib import Path

import yaml
from sqlalchemy.orm import Session

from core.logger import get_logger
from core.models.orm import BrainFact, Case, EmailDraft

logger = get_logger(__name__)

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
_MASTER_PATH = _PROJECT_ROOT / "config" / "checklist_master.yaml"
_TEMPLATE_PATH = (
    _PROJECT_ROOT / "config" / "checklist_templates" / "preliminary_assessment.yaml"
)

# 固定业务地址（公司/经纪邮箱，非客户 PII）：落草稿 cc，绝不外发。
DEFAULT_CC_EMAIL = "Brandon.He@everstones.com.au"
_DRAFT_TYPE = "preliminary"
_SUBJECT_PREFIX = "EVERSTONES Preliminary Assessment"


def _load_master_index() -> dict[str, dict]:
    """加载 checklist_master.yaml 为 {id: item}，透传 kind 等可选字段。"""
    data = yaml.safe_load(_MASTER_PATH.read_text(encoding="utf-8"))
    return {it["id"]: it for it in data["items"]}


def _load_template() -> dict:
    return yaml.safe_load(_TEMPLATE_PATH.read_text(encoding="utf-8"))


def _resolve_property_address(case_id: str, db: Session) -> str:
    """property_address 非 Case 列，存于 brain_facts（key=property.address）。"""
    fact = (
        db.query(BrainFact)
        .filter(BrainFact.case_id == case_id, BrainFact.key == "property.address")
        .first()
    )
    if fact and fact.value:
        return fact.value
    return ""


def _profile_matches(when: dict, profile: dict) -> bool:
    """trim_rules 的 when 多键同时满足才命中。"""
    for key, allowed in when.items():
        pv = str(profile.get(key) or "").strip().lower()
        if pv not in {str(v).strip().lower() for v in allowed}:
            return False
    return True


def _validate_refs(template: dict, master_index: dict[str, dict]) -> None:
    """模板所有 section 的 ref 必须命中 master，否则抛 ValueError。"""
    for section in template.get("sections", []):
        for raw in section.get("items", []):
            ref = raw["ref"] if isinstance(raw, dict) else raw
            if ref not in master_index:
                raise ValueError(
                    f"template ref '{ref}' not found in checklist_master"
                )


def _apply_trim(
    sections: list[dict], trim_rules: list[dict], profile: dict
) -> list[dict]:
    """按 trim_rules 删除/追加项目，返回裁剪后的 sections。"""
    drop: set[str] = set()
    adds: list[str] = []
    for rule in trim_rules:
        when = rule.get("when") or {}
        if not when or _profile_matches(when, profile):
            drop.update(rule.get("drop", []))
            adds.extend(rule.get("add", []))

    for sec in sections:
        sec["documents"] = [d for d in sec["documents"] if d["ref"] not in drop]
        sec["info"] = [i for i in sec["info"] if i["ref"] not in drop]

    for ref in adds:
        # Refinance 追加的 settlement 文档归入 liability 板块
        target = next((s for s in sections if s["id"] == "liability"), sections[-1])
        if not any(d["ref"] == ref for d in target["documents"]):
            target["documents"].append(
                {"ref": ref, "name": ref.replace("_", " ").title(), "kind": "document"}
            )
    return sections


def _render_body(
    case: Case,
    sections: list[dict],
    profile: dict,
) -> tuple[str, str]:
    """固定措辞渲染英文邮件正文（纯文本 + HTML）。"""
    first_name = (case.client_name or "Client").split()[0]
    purpose = profile.get("purpose") or "your loan"
    lines: list[str] = []
    html_blocks: list[str] = []

    lines.append(f"Hi {first_name},")
    lines.append("")
    lines.append(
        "Hope this email finds you well. To move forward with your "
        f"{purpose} application, please prepare and provide the following "
        "documents and information at your earliest convenience."
    )
    lines.append("")
    html_blocks.append(f"<p>Hi {first_name},</p>")
    html_blocks.append(
        "<p>Hope this email finds you well. To move forward with your "
        f"{purpose} application, please prepare and provide the following "
        "documents and information at your earliest convenience.</p>"
    )

    for idx, sec in enumerate(sections, start=1):
        heading = f"{idx}. {sec['title_en']} ({sec['title_zh']})"
        lines.append(heading)
        html_blocks.append(f"<h3>{heading}</h3><ul>")

        for doc in sec["documents"]:
            lines.append(f"   - {doc['name']}")
            html_blocks.append(f"<li>{doc['name']}</li>")

        if sec["info"]:
            lines.append("   Please provide the following information:")
            html_blocks.append("</ul><p>Please provide the following information:</p><ul>")
            for info in sec["info"]:
                lines.append(f"   - {info['name']}")
                html_blocks.append(f"<li>{info['name']}</li>")

        lines.append("")
        html_blocks.append("</ul>")

    lines.append("Best regards,")
    lines.append("Brandon He")
    lines.append("Everstones")
    html_blocks.append(
        "<p>Best regards,<br>Brandon He<br>Everstones</p>"
    )

    body_text = "\n".join(lines)
    body_html = "\n".join(html_blocks)
    return body_text, body_html


def generate_preliminary_assessment_email(
    case_id: str,
    db: Session,
) -> dict[str, str]:
    """根据案件画像与首次材料模板，生成裁剪后的标准 Preliminary Assessment 英文邮件草稿。

    固定措辞（Q2=方案A）：不调用 LLM，不做个性化润色，只按客户类型裁剪板块内项目。

    Returns:
        {
            "subject": str,
            "body_text": str,
            "body_html": str,
            "recipient_email": str,
            "cc_email": str,
        }

    Raises:
        ValueError: 案件不存在 / 模板 ref 未命中 master（端点层转 422）。
    """
    case = db.query(Case).filter(Case.id == case_id).first()
    if case is None:
        raise ValueError(f"case {case_id} not found")

    master_index = _load_master_index()
    template = _load_template()
    _validate_refs(template, master_index)

    profile = {
        "employment_type": case.employment_type or "",
        "residency": case.residency or "",
        "purpose": case.purpose or "",
        "lender": case.lender or "",
    }

    sections: list[dict] = []
    for section in template.get("sections", []):
        documents: list[dict] = []
        info: list[dict] = []
        for raw in section.get("items", []):
            if isinstance(raw, dict):
                ref = raw["ref"]
                kind = raw.get("kind") or master_index.get(ref, {}).get("kind", "document")
            else:
                ref = raw
                kind = master_index.get(ref, {}).get("kind", "document")
            master = master_index.get(ref, {})
            entry = {
                "ref": ref,
                "name": master.get("name_en") or master.get("name_zh", ref),
                "kind": kind,
            }
            if kind == "info":
                info.append(entry)
            else:
                documents.append(entry)
        sections.append(
            {
                "id": section.get("id"),
                "title_en": section.get("title_en", ""),
                "title_zh": section.get("title_zh", ""),
                "documents": documents,
                "info": info,
            }
        )

    sections = _apply_trim(sections, template.get("trim_rules", []), profile)

    subject = (
        f"{_SUBJECT_PREFIX} - {case.client_name} - {profile['purpose']} "
        f"- {_resolve_property_address(case_id, db)}"
    )
    body_text, body_html = _render_body(case, sections, profile)

    return {
        "subject": subject,
        "body_text": body_text,
        "body_html": body_html,
        "recipient_email": case.client_email or "",
        "cc_email": DEFAULT_CC_EMAIL,
    }


def save_preliminary_draft(
    case_id: str,
    db: Session,
    email: dict[str, str] | None = None,
) -> EmailDraft:
    """生成并落草稿箱（status=draft，绝不自动发送）。

    调用方负责事务边界；写入失败由端点层捕获并回滚。
    """
    if email is None:
        email = generate_preliminary_assessment_email(case_id, db)
    draft = EmailDraft(
        case_id=case_id,
        draft_type=_DRAFT_TYPE,
        subject=email["subject"],
        to_email=email["recipient_email"],
        body=email["body_text"],
        language="en",
        status="draft",
    )
    db.add(draft)
    db.commit()
    db.refresh(draft)
    return draft
