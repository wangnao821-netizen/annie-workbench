"""Settlement and Compliance Archiving service for loan-assistant V4.

Handles settlement checklist generation, compliance archiving (file copying to safe project data folder),
experience consolidation via Mem0 global experience, and Level 3 final brief export.
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from core.config import get_config
from core.ai.brief import generate_layered_brief
from core.knowledge.memory import remember  # remember_experience → remember
from core.case_engine.progression import confirm_stage_advance  # was update_case_stage_and_milestones
from core.pii.gateway import desensitize
from core.ai.gateway import ApiGateway
from core.logger import get_logger
from core.security.path_guard import PathGuard
from core.models.orm import Case, CaseChecklist, CaseFile, CaseKnowledge, OsCondition
from core.models.types import DesensitizedText

logger = get_logger(__name__)


def settle_case_and_archive(
    case_id: str,
    db: Session,
) -> dict[str, Any]:
    """Execute settlement checks, transition case to settled, copy compliance files, and consolidate experience.

    Args:
        case_id: The case ID.
        db: SQLAlchemy session.

    Returns:
        Dictionary containing settlement status, message, and paths.

    Raises:
        ValueError: If case is not found or checklist is incomplete.
    """
    logger.info("Executing settlement action for case %s", case_id)

    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise ValueError(f"Case not found: {case_id}")

    from core.case_engine.progression import get_stage_key
    stage_key = get_stage_key(case.stage)

    # Stage 1: Transition to 'settling' and generate checklist if not already
    if stage_key not in ("settling", "settled"):
        # Auto-transition to 'settling'
        update_case_stage_and_milestones(case_id, "settling", db)

        # Generate 4 settlement checklist items
        settlement_items = [
            ("贷款合同已签", "loan_contract_signed"),
            ("保险已买", "insurance_purchased"),
            ("解押已安排", "discharge_arranged"),
            ("律师对账完成", "lawyer_reconciliation"),
        ]
        for name, cat in settlement_items:
            exists = (
                db.query(CaseChecklist)
                .filter(CaseChecklist.case_id == case_id, CaseChecklist.category == cat)
                .first()
            )
            if not exists:
                item = CaseChecklist(
                    case_id=case_id,
                    item_name=name,
                    category=cat,
                    status="pending",
                    is_required=True,
                )
                db.add(item)
        db.commit()
        return {
            "status": "结算中",
            "message": "已进入结算中阶段，并成功生成 4 项结算对账清单。",
        }

    # Stage 2: finalize settlement if already in 'settling'
    if stage_key == "settling":
        # Verify if all checklist items are completed (received or waived)
        all_items = db.query(CaseChecklist).filter(CaseChecklist.case_id == case_id).all()
        uncompleted = [it for it in all_items if it.status not in ("received", "waived")]
        if uncompleted:
            uncompleted_names = ", ".join(it.item_name for it in uncompleted)
            raise ValueError(f"结案失败：还有未完成的对账清单项 ({uncompleted_names})。")

        # 1. Update stage and milestones
        update_case_stage_and_milestones(case_id, "settled", db)

        # 2. Compliance Archiving
        config = get_config()
        project_root = Path(config.project_root)
        client_files_root = Path(os.getenv("CLIENT_FILES_ROOT", "."))
        path_guard = PathGuard(project_root=project_root, client_files_root=client_files_root)

        # Create settled archive directory under the safe data/ folder (Red Line #1 Compliance)
        archive_dir = project_root / "data" / "settled_archives" / case_id / "_Settled_Archive"
        path_guard.assert_write_allowed(archive_dir)
        archive_dir.mkdir(parents=True, exist_ok=True)

        # Query files marked to send to lender
        files_to_send = (
            db.query(CaseFile)
            .filter(CaseFile.case_id == case_id, CaseFile.send_to_lender == True)
            .all()
        )
        copied_files = []
        for cf in files_to_send:
            src_path = client_files_root / cf.nas_path
            if src_path.exists():
                dst_path = archive_dir / cf.original_name
                path_guard.assert_write_allowed(dst_path)
                shutil.copy2(src_path, dst_path)
                # Verify copy integrity (size check)
                if dst_path.stat().st_size != src_path.stat().st_size:
                    raise OSError(f"Archive file copy integrity check failed for {cf.original_name}: size mismatch")
                copied_files.append(cf.original_name)
                logger.info("Copied and verified compliance file to archive: %s", cf.original_name)
            else:
                logger.warning("Source file not found for archiving: %s", src_path)

        # 3. Experience Consolidation
        knowledges = db.query(CaseKnowledge).filter(CaseKnowledge.case_id == case_id).all()
        os_conds = db.query(OsCondition).filter(OsCondition.case_id == case_id).all()

        know_str = "\n".join(f"- {k.content} (来源: {k.source})" for k in knowledges)
        os_str = "\n".join(f"- {o.raw_text} (分类: {o.category}, 最终状态: {o.status})" for o in os_conds)

        experience_summary = "该案流程正常，无特殊经验需固化。"
        if knowledges or os_conds:
            # LLM Prompt to synthesize experience
            prompt_template = f"""你是一个资深的贷款经纪人。这个贷款案已经成功结案（Settled）。请根据以下案件的材料提取、退单条件历史和沟通细节，进行“经验固化”总结。

【沟通历史与案情事实】
{know_str or "无"}

【银行退单条件 (OS Conditions) 历史】
{os_str or "无"}

【任务】
请总结该案的“踩坑点”（如有）和“成功通过技巧/经验”，形成一条精简的全局经验总结。
要求：
1. 结合具体情节（例如：如何合理解释赌博流水，如何成功满足估值偏低的问题等）。
2. 保持通用性，以便在以后的类似案件中能被相似性检索到。
3. 必须是中文，长度限制在 150-300 字。
4. 如果信息太少无法总结，请直接说“该案流程正常，无特殊经验需固化。”"""

            # Desensitize prompt
            safe_prompt_str = desensitize(prompt_template, case_id, db)

            # Call LLM
            gateway = ApiGateway(config)
            try:
                res = gateway.call_llm(
                    text=DesensitizedText(safe_prompt_str),
                    prompt_template="Consolidate lessons learned into a short global experience summary.",
                    system_prompt="You are a senior mortgage broker extracting global knowledge.",
                )
                experience_summary = res.response_text.strip()
                # Double desensitize the summary output to ensure absolutely zero PII leaks into the global memory
                experience_summary = desensitize(experience_summary, case_id, db)
            except Exception as exc:
                logger.error("LLM experience synthesis failed: %s", exc)

        # Save to Mem0 global experience database
        remember_experience(experience_summary, db, case_id)

        # 4. Generate Final Case Brief (Level 3) as Markdown file
        try:
            brief_markdown = generate_layered_brief(case_id, level=3, db=db)
        except Exception as exc:
            logger.error("Failed to generate final brief: %s", exc)
            brief_markdown = "# Final Brief Generation Failed"

        brief_file_path = project_root / "data" / "settled_archives" / case_id / f"Final_Case_Brief_{case_id}.md"
        path_guard.assert_write_allowed(brief_file_path)
        brief_file_path.write_text(brief_markdown, encoding="utf-8")

        db.commit()
        return {
            "status": "已结算",
            "message": "案件已成功结案，归档及经验固化已完成。",
            "archive_path": str(archive_dir),
            "experience_summary": experience_summary,
            "copied_files": copied_files,
        }
    return {
        "status": case.stage,
        "message": "案件状态未改变。",
    }
