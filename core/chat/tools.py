"""对话工具白名单 — V1 两个工具：record_fact / suggest_submission。"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from core.context.accumulator import append_context_event
from core.escalation.service import create_escalation
from core.logger import get_logger
from core.pii.gateway import rehydrate
from core.task_engine.dispatcher import create_task

logger = get_logger(__name__)

TOOL_SCHEMAS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "record_fact_find",
            "description": (
                "提取或整理客户 Fact Find 信息（雇主历史/居住历史/律师信息/车辆资产/Super养老金），"
                "生成结构化草稿供 Vera 确认。确认前不直接写入正式账本。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "section": {
                        "type": "string",
                        "enum": [
                            "employment_history",
                            "living_history",
                            "solicitor_info",
                            "vehicle_asset",
                            "super_balance",
                        ],
                        "description": "采集板块",
                    },
                    "data": {
                        "type": "object",
                        "description": "结构化内容，符合各 section 契约",
                    },
                    "confirm_required": {
                        "type": "boolean",
                        "description": "是否需要 Vera 确认（恒为 true）",
                    },
                },
                "required": ["section", "data"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "record_fact",
            "description": (
                "把用户确认的事实记录进案件账本。"
                "金额/日期/银行名/明确姓名等无歧义信息 confidence=high 直接记录；"
                "判断性、模糊或需要 VERA 确认的信息 confidence=low 进入待确认。"
                "只在案件对话中使用。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "content": {"type": "string", "description": "要记录的事实原文（中文）"},
                    "confidence": {"type": "string", "enum": ["high", "low"]},
                },
                "required": ["content", "confidence"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "suggest_submission",
            "description": "检测到用户要写银行邮件/递交材料/翻译外线内容时调用，提示进入递交模式。",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "escalate_to_boss",
            "description": (
                "Vera 要把某个卡点/事项升级给老板拍板时调用：新建一条待老板拍板任务"
                "（assignee=brandon，进入老板队列）。可在对话里带截止时间。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "problem": {"type": "string", "description": "卡点问题描述（必填，中文）"},
                    "preference": {"type": "string", "description": "Vera 倾向的方案/建议（可选）"},
                    "deadline": {"type": "string", "description": "期望老板答复的截止时间（ISO 8601，可选）"},
                },
                "required": ["problem"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_task",
            "description": (
                "Vera 在对话里要创建任意任务（含截止时间/优先级/负责人）时调用。"
                "任务与当前案件自动关联；升级给老板用 escalate_to_boss，不要用本工具。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "任务标题（必填，中文）"},
                    "deadline": {"type": "string", "description": "截止时间 ISO 8601（可选）"},
                    "priority": {"type": "string", "enum": ["urgent", "high", "normal", "low"], "description": "默认 normal"},
                    "assignee": {"type": "string", "description": "负责人，默认 vera"},
                    "context": {"type": "object", "description": "补充上下文（可选）"},
                },
                "required": ["title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "checklist_query",
            "description": (
                "Vera 询问案件材料清单/缺口/进度时调用；"
                "use_ai=true 时按案件画像执行一次 AI 重选推荐（不覆盖已存清单）。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "use_ai": {"type": "boolean", "description": "默认 false；Vera 要求优化/智能推荐时 true"}
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "folder_lookup",
            "description": (
                "当 Vera 要求查阅、扫描或总结案卷本地文件夹中的实际文件（如对账单、工资单、流水、税单、护照等）时调用。"
                "会自动检索本地客户目录并解析提取文件真实的文本内容与数据。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "要检索的文件类型或关键词（如 '对账单'、'statement'、'工资单'、'payslip'、'流水' 等）",
                    },
                },
                "required": ["query"],
            },
        },
    },
]


def execute_tool(
    name: str,
    arguments: dict,
    case_id: str,
    track: str,
    db: Session,
) -> dict:
    """白名单工具执行（V1 只允许 TOOL_SCHEMAS 内名称）。

    Args:
        name: 工具名（record_fact | suggest_submission | folder_lookup 等）。
        arguments: 工具参数（LLM 生成，已处脱敏环境）。
        case_id: 案件 ID（全局对话为空串）。
        track: internal | external。
        db: SQLAlchemy session。

    Returns:
        结构化结果（回注给 LLM / 生成卡片）。
    """
    if name == "record_fact":
        return _record_fact(arguments, case_id, track, db)
    if name == "suggest_submission":
        return {"suggest": True}
    if name == "escalate_to_boss":
        return _escalate_to_boss(arguments, case_id, db)
    if name == "create_task":
        return _create_task(arguments, case_id, db)
    if name == "checklist_query":
        return _checklist_query(arguments, case_id, db)
    if name == "folder_lookup":
        return _folder_lookup(arguments, case_id, db)
    if name == "calculator_assess":
        return _calculator_assess(arguments, case_id, db)
    if name == "declaration_check":
        return _declaration_check(arguments, case_id, db)
    if name == "gap_analysis":
        return _gap_analysis(arguments, case_id, db)
    if name == "policy_check":
        return _policy_check(arguments, case_id, db)
    if name == "draft_email":
        return _draft_email(arguments, case_id, db, track=track)
    if name == "record_fact_find":
        return _record_fact_find(arguments, case_id, db)
    return {"ok": False, "error": f"unknown tool: {name}"}


def _calculator_assess(arguments: dict, case_id: str, db: Session) -> dict:
    """贷款能力测算：支持 arguments 显式槽位覆写案件画像。
    返回统一为 {"status": "result"|"needs_form", "card": {...}, "summary": str}。"""
    if not case_id or db is None:
        return {"status": "needs_form", "card": {"type": "calculator_form", "missing": ["case_id"]}, "summary": "需要关联案件以执行借贷额度评估。"}

    try:
        from core.bank_registry import resolve_lender_key
        from core.calculator import profiles as profiles_mod
        from core.calculator.assess import assess
        from core.calculator.models import (
            ApplicantIn,
            AssessRequest,
            HouseholdIn,
            LoanIn,
            LoanPortionIn,
        )
        from core.models.orm import Case

        case = db.query(Case).filter(Case.id == case_id).first()
        if not case:
            return {"status": "needs_form", "card": {"type": "calculator_form", "missing": ["case"]}, "summary": "未找到案件档案。"}

        # 加载银行真实档案（含 parameters），槽位显式覆写画像
        bank = resolve_lender_key(case.lender or "") or "cba"
        profile = profiles_mod.load_profile(bank)

        base_income = float(arguments.get("employment_income") or 100000.0)
        spouse_income = float(arguments.get("spouse_income") or 0.0)
        rate_pct = float(arguments.get("interest_rate") or 6.89)
        rate = rate_pct / 100.0 if rate_pct > 1 else rate_pct
        target_loan = float(arguments.get("target_loan") or (case.loan_amount or 400000.0))
        security = float(getattr(case, "property_value", 0.0) or 0.0)

        applicants = [ApplicantIn(base=base_income)]
        if spouse_income > 0:
            applicants.append(ApplicantIn(base=spouse_income))
        req = AssessRequest(
            bank=bank,
            applicants=applicants,
            loan=LoanIn(
                portions=[LoanPortionIn(amount=target_loan, rate=rate, term_years=30)],
                security_value=security,
            ),
            household=HouseholdIn(status="Single"),
        )
        res = assess(req, profile)
        return {
            "status": "result",
            "card": {"type": "calculator_result", "data": res},
            "summary": f"精算结果: 最大贷款能力 ${res.get('max_loan', 0):,.0f}, 月供 ${res.get('monthly_repayment', 0):,.0f}" if isinstance(res, dict) else str(res),
        }
    except Exception as e:  # noqa: BLE001
        logger.warning("calculator_assess failed: %s", e)
        return {"status": "needs_form", "card": {"type": "calculator_form", "error": str(e)}, "summary": f"测算降级: {e}"}


def _declaration_check(arguments: dict, case_id: str, db: Session) -> dict:
    """申报一致性检查：调 run_declaration_check（文件为空时按清单缺口给提示）。"""
    if not case_id or db is None:
        return {"ok": False, "summary": "需要案件 ID 执行申报检查"}
    try:
        from core.agents.declaration_check import run_declaration_check
        # 签名 (case_id, files, folder, db)：意图驱动未指定具体文件时按案件文件夹全量检查
        res = run_declaration_check(case_id, [], None, db)
        return {
            "ok": True,
            "card": {"type": "declaration_check", "data": res},
            "summary": str(res)[:600] if res else "申报材料一致性核对完成",
        }
    except Exception as e:  # noqa: BLE001
        logger.warning("declaration_check failed: %s", e)
        return {"ok": False, "summary": f"申报检查失败: {e}"}


def _gap_analysis(arguments: dict, case_id: str, db: Session) -> dict:
    """材料缺口分析：analyze_gaps(case, db)。"""
    if not case_id or db is None:
        return {"ok": False, "summary": "需要案件 ID 执行缺口分析"}
    try:
        from core.case_folder.gap_analysis import analyze_gaps
        from core.models.orm import Case

        case = db.query(Case).filter(Case.id == case_id).first()
        if not case:
            return {"ok": False, "summary": "案件不存在"}
        res = analyze_gaps(case, db)
        return {
            "ok": True,
            "card": {"type": "gap_analysis", "data": res},
            "summary": f"材料缺口分析完成: 识别到 {len(res.get('missing', []))} 项缺件" if isinstance(res, dict) else "材料缺口分析完成",
        }
    except Exception as e:  # noqa: BLE001
        logger.warning("gap_analysis failed: %s", e)
        return {"ok": False, "summary": f"材料缺口分析失败: {e}"}


def _policy_check(arguments: dict, case_id: str, db: Session) -> dict:
    """政策查询：run_policy_check(case_id, {"query": arguments.get("query","")}, db)。"""
    if not case_id or db is None:
        return {"ok": False, "summary": "需要案件 ID 查询银行政策"}
    try:
        from core.policy.engine import run_policy_check
        q = str(arguments.get("query", "")).strip()
        res = run_policy_check(case_id, {"query": q}, db)
        return {
            "ok": True,
            "card": {"type": "policy_check", "data": res},
            "summary": f"银行政策核对完成: {res}" if isinstance(res, str) else "银行政策核对完成",
        }
    except Exception as e:  # noqa: BLE001
        logger.warning("policy_check failed: %s", e)
        return {"ok": False, "summary": f"政策查询失败: {e}"}


def _draft_email(arguments: dict, case_id: str, db: Session, track: str = "internal") -> dict:
    """邮件起草与微调：run_co_create(case_id, {"action": "generate", "message": ...}, db, track)。"""
    if not case_id or db is None:
        return {"ok": False, "summary": "需要案件 ID 起草邮件"}
    try:
        from core.agents.draft_email import run_co_create
        msg = str(arguments.get("message", "")).strip()
        res = run_co_create(case_id, {"action": "generate", "message": msg}, db, track)
        draft_info = res.get("draft") or {}
        card_payload = {
            "subject": draft_info.get("subject") or "邮件草稿",
            "body": draft_info.get("body") or "",
            "body_cn": draft_info.get("body_cn") or "",
            "version": draft_info.get("version") or "V1",
            "branch_label": draft_info.get("branch_label") or "main",
            "message_id": draft_info.get("message_id"),
            "disclosure": {"needs_review": False, "items": []},
        }
        return {
            "ok": True,
            "card": {"type": "draft", "payload": card_payload},
            "summary": res.get("reply") or f"邮件草稿已起草 ({card_payload['version']}): {card_payload['subject']}",
        }
    except Exception as e:  # noqa: BLE001
        logger.warning("draft_email failed: %s", e)
        return {"ok": False, "summary": f"邮件起草失败: {e}"}


def _folder_lookup(arguments: dict, case_id: str, db: Session) -> dict:
    """folder_lookup：扫描本地案卷文件夹并解析提取指定文件的文本内容。"""
    if not case_id:
        return {"ok": False, "error": "需要案件 ID"}

    from core.case_folder.lookup import lookup_files, parse_one
    from core.models.orm import Case

    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        return {"ok": False, "error": "案件不存在"}

    query = (arguments.get("query") or "").strip()
    if not case.folder_path:
        return {
            "ok": False,
            "folder_connected": False,
            "message": "当前案卷尚未关联本地文件夹路径，请先在案卷全景中关联文件夹。",
        }

    try:
        # 1. 检索匹配文件
        matched_files = lookup_files(case, query)
        if not matched_files:
            # 宽泛重试常见的英文词根
            synonyms = {
                "对账单": "statement",
                "贷款": "loan",
                "工资单": "payslip",
                "流水": "statement",
                "税单": "noa",
            }
            alt_q = synonyms.get(query, "")
            if alt_q:
                matched_files = lookup_files(case, alt_q)

        if not matched_files:
            return {
                "ok": True,
                "folder_connected": True,
                "folder_path": case.folder_path,
                "query": query,
                "files_count": 0,
                "message": f"在本地文件夹中未检索到与「{query}」匹配的文件。",
            }

        # 2. 对匹配到的首个/关键文件执行深度解析
        parsed_contents = []
        for f_meta in matched_files[:3]:
            try:
                p_res = parse_one(case, f_meta["rel_path"], db)
                parsed_contents.append({
                    "rel_path": f_meta["rel_path"],
                    "doc_type": f_meta.get("doc_type"),
                    "summary": p_res.get("summary", "")[:1500],
                })
            except Exception as pe:  # noqa: BLE001
                parsed_contents.append({
                    "rel_path": f_meta["rel_path"],
                    "doc_type": f_meta.get("doc_type"),
                    "error": str(pe),
                })

        return {
            "ok": True,
            "folder_connected": True,
            "folder_path": case.folder_path,
            "query": query,
            "files_found": matched_files,
            "parsed_documents": parsed_contents,
        }
    except Exception as e:  # noqa: BLE001
        logger.warning("folder_lookup failed for case %s: %s", case_id, e)
        return {"ok": False, "error": str(e)}


def _escalate_to_boss(arguments: dict, case_id: str, db: Session) -> dict:
    """escalate_to_boss：升级卡点到老板队列（新建 ESCALATION Action）。"""
    if not case_id:
        return {"ok": False, "error": "升级老板必须在案件对话中进行"}
    problem = str(arguments.get("problem", "")).strip()
    if not problem:
        return {"ok": False, "error": "problem 不能为空"}
    preference = str(arguments.get("preference", "")).strip() or None
    deadline_raw = arguments.get("deadline")
    try:
        action = create_escalation(
            db=db,
            case_id=case_id,
            problem=problem,
            preference=preference,
            source="ai_chat",
            context=f"聊天升级：{problem[:80]}",
        )
        deadline = None
        if deadline_raw:
            deadline = datetime.fromisoformat(str(deadline_raw))
            action.scheduled_at = deadline
            db.commit()
            db.refresh(action)
        return {
            "ok": True,
            "action_id": action.id,
            "title": action.title,
            "escalated_at": action.escalated_at.isoformat() if action.escalated_at else None,
            "deadline": deadline.isoformat() if deadline else None,
            "assignee": "brandon",
        }
    except Exception as exc:  # noqa: BLE001 — 工具失败不阻断对话
        logger.warning("escalate_to_boss failed: %s", exc)
        return {"ok": False, "error": str(exc)}


def _create_task(arguments: dict, case_id: str, db: Session) -> dict:
    """create_task：对话里创建任意任务（WO-41）。"""
    if not case_id:
        return {"ok": False, "error": "创建任务必须在案件对话中进行"}
    title = str(arguments.get("title", "")).strip()
    if not title:
        return {"ok": False, "error": "title 不能为空"}
    deadline = None
    if arguments.get("deadline"):
        try:
            deadline = datetime.fromisoformat(str(arguments["deadline"]))
        except ValueError:
            return {"ok": False, "error": "deadline 不是合法 ISO 时间"}
    try:
        action = create_task(
            case_id=case_id,
            task_type="general",
            source_channel="manual",
            title=title,
            context=arguments.get("context") or {},
            deadline=deadline,
            priority=arguments.get("priority") or "normal",
            assignee=arguments.get("assignee"),
            db=db,
        )
        return {
            "ok": True,
            "task_id": action.id,
            "title": action.title,
            "priority": action.priority,
            "deadline": action.scheduled_at.isoformat() if action.scheduled_at else None,
            "assignee": action.assignee,
        }
    except Exception as exc:  # noqa: BLE001 — 工具失败不阻断对话
        logger.warning("create_task failed: %s", exc)
        return {"ok": False, "error": str(exc)}


def _record_fact(arguments: dict, case_id: str, track: str, db: Session) -> dict:
    """record_fact 实现：高置信直接 confirmed，低置信 pending（#6）+ 防串案归属校验（②）。"""
    if not case_id:
        return {"ok": False, "error": "全局对话禁止写事实"}
    content = str(arguments.get("content", "")).strip()
    if not content:
        return {"ok": False, "error": "content 不能为空"}
    confidence = arguments.get("confidence", "low")
    status = "confirmed" if confidence == "high" else "pending"
    try:
        real_content = rehydrate(content, case_id, db)
        conflict = _find_attribution_conflict(real_content, case_id, db)
        if conflict:
            logger.info(
                "防串案：事实归属冲突，未写入 case=%s matched=%s",
                case_id,
                conflict["matched_client"],
            )
            return {
                "ok": False,
                "attribution": conflict,
                "content": real_content,
                "track": track,
            }
        event = append_context_event(
            case_id=case_id,
            source_type="manual_note",
            content=content,
            db=db,
            trigger_distill=status == "confirmed",
            track=track,
            status=status,
        )
        if status == "confirmed":
            try:
                from core.facts.extract import sync_brain_facts
                sync_brain_facts(case_id, db, event=event)
            except Exception as se:  # noqa: BLE001
                logger.warning("sync_brain_facts on confirmed event failed (non-fatal): %s", se)

        return {
            "ok": True,
            "event_id": event.id,
            "status": event.status,
            "content": event.content,
            "source_type": event.source_type,
            "track": event.track,
        }
    except Exception as exc:  # noqa: BLE001 — 工具失败不阻断对话
        logger.warning("record_fact failed: %s", exc)
        return {"ok": False, "error": str(exc)}


def _find_attribution_conflict(content: str, case_id: str, db: Session) -> dict | None:
    """防串案协议②：内容中出现其他案件客户名 → 返回归属冲突信息（未确认不写入）。

    Args:
        content: 已还原为真实文本的事实原文。
        case_id: 当前会话绑定案件。
        db: SQLAlchemy session。

    Returns:
        {"matched_case_id", "matched_client", "matched_lender"}；无冲突返回 None。
    """
    from core.models.orm import Case

    norm = (content or "").replace(" ", "").lower()
    if not norm:
        return None
    others = db.query(Case).filter(Case.id != case_id).all()
    for case in others:
        name = (case.client_name or "").strip()
        name_norm = name.replace(" ", "").lower()
        if name_norm and name_norm in norm:
            return {
                "matched_case_id": case.id,
                "matched_client": name,
                "matched_lender": case.lender or "",
            }
    return None


def _checklist_query(arguments: dict, case_id: str, db: Session) -> dict:
    """checklist_query：查清单缺口/进度；use_ai=true 时附 AI 重选推荐（只推荐不落库，WO-43）。"""
    if not case_id:
        return {"ok": False, "error": "清单查询必须在案件对话中进行"}
    try:
        from core.models.orm import Case, CaseChecklist

        items = (
            db.query(CaseChecklist)
            .filter(CaseChecklist.case_id == case_id)
            .order_by(CaseChecklist.id)
            .all()
        )
        done = sum(1 for it in items if it.status == "received")
        total = len(items)
        missing = [it.item_name for it in items if it.status != "received"][:10]
        summary = f"清单进度 {done}/{total}；缺失：{'、'.join(missing) if missing else '无'}"
        if arguments.get("use_ai"):
            from core.checklist.master_picker import pick_checklist

            case_obj = db.query(Case).filter(Case.id == case_id).first()
            if case_obj:
                recs = pick_checklist(
                    {"case_id": case_id, "lender": case_obj.lender or "CBA",
                     "employment_type": case_obj.employment_type or "PAYG",
                     "residency": case_obj.residency or "PR", "purpose": case_obj.purpose or "Purchase"},
                    db, use_ai=True,
                )
                if recs:
                    summary += "；AI 推荐补充：" + "、".join(f"{p['name_zh']}" for p in recs[:5])
        return {"ok": True, "done": done, "total": total, "missing": missing, "summary": summary}
    except Exception as exc:  # noqa: BLE001 — 工具失败不阻断对话
        logger.warning("checklist_query failed: %s", exc)
        return {"ok": False, "error": str(exc)}

def _record_fact_find(arguments: dict, case_id: str | None, db: Session) -> dict:
    """record_fact_find：对话中提取 Fact Find 结构化草稿（WO-77）。"""
    if not case_id:
        return {
            "status": "error",
            "tool": "record_fact_find",
            "message": "Fact Find 信息必须关联具体案件，当前未选择案件。",
        }

    from server.api.schemas import VALID_FACT_FIND_SECTIONS
    section = arguments.get("section")
    data = arguments.get("data")
    if section not in VALID_FACT_FIND_SECTIONS:
        return {
            "status": "error",
            "tool": "record_fact_find",
            "message": f"非法板块 '{section}'，有效值为 {sorted(VALID_FACT_FIND_SECTIONS)}",
        }

    # 脱敏还原/处理（若入参有占位符）
    import json
    if isinstance(data, (dict, list)):
        try:
            raw_str = json.dumps(data, ensure_ascii=False)
            raw_str = rehydrate(raw_str, case_id, db)
            data = json.loads(raw_str)
        except Exception:  # noqa: BLE001, S110
            pass

    return {
        "status": "ok",
        "tool": "record_fact_find",
        "action": "confirm_required",
        "card": {
            "type": "fact_find_confirm",
            "title": "Fact Find 结构化信息确认",
            "payload": {
                "case_id": case_id,
                "section": section,
                "data": data,
                "confirm_required": True,
            },
        },
        "summary": f"已提取 Fact Find [{section}] 结构化草稿，请在卡片中核对确认。",
    }
