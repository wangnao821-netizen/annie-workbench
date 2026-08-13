"""Checklist generator service for loan-assistant V4.

Integrates lender policies, base checklists, and Mem0 historical experience
to dynamically generate case-specific document checklists.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy.orm import Session

from core.ai.gateway import ApiGateway
from core.config import get_config
from core.knowledge.memory import recall
from core.logger import get_logger
from core.models.orm import Case, CaseChecklist
from core.models.types import DesensitizedText

# TODO: memory 接口对齐 # recall
from core.pii.gateway import desensitize, rehydrate

logger = get_logger(__name__)


def generate_checklist_draft(case_id: str, db: Session) -> list[dict[str, Any]]:
    """Generate a draft document checklist based on bank policy and historical memory.

    Args:
        case_id: Associated case ID.
        db: SQLAlchemy session.

    Returns:
        List of checklist item dicts (rehydrated with real names/details).

    Raises:
        ValueError: If case is not found.
    """
    logger.info("Generating checklist draft for case %s", case_id)

    # 1. Fetch case details
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise ValueError(f"Case not found: {case_id}")

    client_name = case.client_name
    loan_amount = case.loan_amount or 0.0
    employment_type = case.employment_type or "PAYG"
    residency = case.residency or "PR"
    lender = case.lender or "CBA"
    purpose = case.purpose or "Purchase"
    case_type = case.case_type or "FullDoc"

    # 2. Desensitize case-specific PII for prompt protection
    safe_client_name = desensitize(client_name, case_id, db)

    # 3. Load Lender Policy from config/lender_policies.yaml
    config = get_config()
    lender_policies_path = config.project_root / "config" / "lender_policies.yaml"
    lender_policy_yaml = ""
    try:
        with open(lender_policies_path, encoding="utf-8") as f:
            policies = yaml.safe_load(f)
            lender_data = policies.get("lenders", {}).get(lender)
            if lender_data:
                lender_policy_yaml = yaml.dump(lender_data, allow_unicode=True)
            else:
                logger.warning("No policy found in config for lender %s", lender)
    except Exception as exc:  # noqa: BLE001 — 政策加载失败降级
        logger.error("Failed to load lender policy: %s", exc)

    # 4. Load Base Checklist from config/checklist/{case_type}.yaml
    # Convert "FullDoc" -> "full_doc", "AltDoc" -> "alt_doc", "LiteDoc" -> "lite_doc"
    case_type_snake = case_type.lower().replace("doc", "_doc")
    checklist_path = config.project_root / "config" / "checklist" / f"{case_type_snake}.yaml"
    if not checklist_path.exists():
        # Fallback to full_doc
        checklist_path = config.project_root / "config" / "checklist" / "full_doc.yaml"

    base_checklist_yaml = ""
    try:
        base_checklist_yaml = checklist_path.read_text(encoding="utf-8")
    except Exception as exc:  # noqa: BLE001 — 基础清单加载失败降级
        logger.error("Failed to load base checklist: %s", exc)

    # 5. Recall experience from Mem0 (automatically rehydrated by recall)
    # Since prompt requires desensitization, we desensitize the recalled experience.
    try:
        recalled_experience = recall(case_id, "这类案件通常需要补充什么特殊材料", db)
        if recalled_experience:
            desensitized_experience = desensitize(recalled_experience, case_id, db)
        else:
            desensitized_experience = "无相关历史经验记录。"
    except Exception as exc:  # noqa: BLE001 — 记忆召回失败降级
        logger.warning("Failed to recall memory for case %s: %s", case_id, exc)
        desensitized_experience = "无法获取历史经验。"

    # 6. Master 全集预选（规则硬过滤 + AI 排序/理由，失败回退）— Phase 3 use_ai=True
    preselected_block = ""
    try:
        from core.checklist.master_picker import pick_checklist

        preselected = pick_checklist(
            {
                "case_id": case_id,
                "lender": lender,
                "employment_type": employment_type,
                "residency": residency,
                "purpose": purpose,
            },
            db,
            use_ai=True,
        )
        if preselected:
            preselected_block = "\n".join(
                f"- {p['name_zh']} | {p['id']} | required={p['required']} | {p['reason']}"
                for p in preselected
            )
    except Exception:
        logger.warning("Master checklist pre-selection failed, skip", exc_info=True)

    # 7. Construct prompt template
    prompt_template = f"""你是一个贷款经纪人助手。根据给出的案件详情、目标银行政策、基础材料清单、全集预选清单和历史经验，智能生成这个案件的材料清单。

【案件详情】
- 客户姓名（已脱敏）：{safe_client_name}
- 借款金额：${loan_amount:,.2f}
- 就业类型：{employment_type}
- 居民身份：{residency}
- 目标银行：{lender}
- 贷款目的：{purpose}

【银行政策 ({lender})】
{lender_policy_yaml}

【基础清单】
{base_checklist_yaml}

【全集预选清单（按案件画像从主库规则预选）】
{preselected_block or "无预选清单"}

【历史经验（来自记忆库）】
{desensitized_experience}

【任务】
请生成一份针对性的完整材料清单。要求：
1. 必须保留基础清单中的核心必要项（如工资单、身份证件、银行流水）。
2. 结合就业类型（如自雇）、银行政策和历史经验，智能添加可能需要的额外证明材料（例如：自雇不足2年需要会计师信，信托贷款需要信托契约，非PR客户需要Visa Grant Letter等）。
3. 对于新添加的建议项，在项名称中标注“（建议补充）”，并将 is_required 设为 false，并在理由（ai_suggestion）中说明具体原因，比如“基于历史案例经验：...”或“根据 {lender} 政策：...”。

4. category 字段必须使用以下标准化分类，确保与文件类型映射表（type_mapping.yaml）的 key 完全一致：identity / payslip / employment_letter / tax_return / bank_statement / home_loan_statement / credit_card_statement / council_rates / valuation_report / internal。不要使用自定义分类。

只返回 JSON 数组格式，不要包含任何 Markdown 格式代码块或额外说明字符。
JSON 格式要求：
[
  {{
    "item_name": "最新2期工资单",
    "category": "payslip",
    "is_required": true,
    "ai_suggestion": "基础清单必要项"
  }},
  {{
    "item_name": "会计师信（建议补充）",
    "category": "accountant_letter",
    "is_required": false,
    "ai_suggestion": "基于历史自雇案例经验：CBA 自雇审查对不满2年情况通常要求会计确认信"
  }}
]"""

    # 7. Call LLM via ApiGateway
    gateway = ApiGateway(config)
    try:
        api_result = gateway.call_llm(
            text=DesensitizedText(prompt_template),
            prompt_template="Analyze the case and output the JSON checklist array.",
            system_prompt="You are an expert Australian mortgage broker assistant that outputs clean JSON arrays.",
        )
        resp_text = api_result.response_text.strip()
    except Exception as exc:  # noqa: BLE001 — LLM 失败回退默认清单
        logger.warning("LLM checklist generation fallback to default checklist: %s", exc)
        resp_text = json.dumps([
            {"item_name": "身份证明 (Passport/DL)", "category": "ID", "is_required": True, "status": "pending", "ai_suggestion": "核对姓名拼写与有效期"},
            {"item_name": "近两个月工资单 (Payslips)", "category": "Income", "is_required": True, "status": "pending", "ai_suggestion": "核对雇主名与 YTD 累计收入"},
            {"item_name": "银行流水账单 (Bank Statements)", "category": "Income", "is_required": True, "status": "pending", "ai_suggestion": "核查 BSB 与账户余额"}
        ], ensure_ascii=False)
    resp_text = resp_text.removeprefix("```json")
    resp_text = resp_text.removeprefix("```")
    resp_text = resp_text.removesuffix("```")

    try:
        items = json.loads(resp_text.strip())
    except json.JSONDecodeError as exc:
        logger.error("Failed to parse LLM checklist JSON. Raw: %s", api_result.response_text)
        raise ValueError(f"AI 生成的 JSON 格式解析失败: {exc}") from exc

    # 9. Rehydrate items (restore real names from tokens) + 关联全集 master_id
    master_map = _master_id_map()
    rehydrated_items = []
    for item in items:
        name = item.get("item_name", "")
        category = item.get("category", "other")
        is_req = item.get("is_required", True)
        sugg = item.get("ai_suggestion", "")

        # Rehydrate both name and suggestion
        rehydrated_name = rehydrate(name, case_id, db)
        rehydrated_sugg = rehydrate(sugg, case_id, db)

        rehydrated_items.append({
            "item_name": rehydrated_name,
            "category": category,
            "is_required": is_req,
            "ai_suggestion": rehydrated_sugg,
            "master_id": master_map.get(_norm_checklist_name(rehydrated_name)),
        })

    return rehydrated_items


def _norm_checklist_name(name: str) -> str:
    """清单名称归一化（小写 + 去分隔符），用于与全集匹配。"""
    return re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "", (name or "").lower())


def _master_id_map() -> dict[str, str]:
    """全集清单项：归一化名称（name_zh/name_en）→ master id。

    Returns:
        {归一化名称: master id}；读取失败返回空 dict（不阻断流程）。
    """
    try:
        path = Path(__file__).resolve().parent.parent.parent / "config" / "checklist_master.yaml"
        items = yaml.safe_load(path.read_text(encoding="utf-8"))["items"]
    except Exception as exc:  # noqa: BLE001 — 映射失败不阻断
        logger.warning("master_id map load failed: %s", exc)
        return {}
    mapping: dict[str, str] = {}
    for it in items:
        mid = str(it.get("id") or "")
        if not mid:
            continue
        for name in (it.get("name_zh"), it.get("name_en")):
            key = _norm_checklist_name(str(name))
            if key:
                mapping.setdefault(key, mid)
    return mapping


def save_confirmed_checklist(
    case_id: str,
    items: list[dict[str, Any]],
    db: Session,
) -> None:
    """Save the confirmed checklist items to the database.

    Deletes any existing checklist items for the case to avoid duplicates
    (Redundancy Protection).

    Args:
        case_id: Case ID.
        items: List of checklist items.
        db: SQLAlchemy session.
    """
    logger.info("Saving confirmed checklist for case %s, count=%d", case_id, len(items))

    try:
        # Redundancy Protection: delete existing items first
        db.query(CaseChecklist).filter(CaseChecklist.case_id == case_id).delete()

        # Insert new items
        for it in items:
            cc = CaseChecklist(
                case_id=case_id,
                item_name=it.get("item_name"),
                category=it.get("category"),
                is_required=it.get("is_required", True),
                status="pending",
                ai_suggestion=it.get("ai_suggestion"),
                master_id=it.get("master_id"),
            )
            db.add(cc)

        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("Failed to save checklist to database: %s", exc)
        raise