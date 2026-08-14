"""流程包执行器 — 按 steps 顺序执行白名单工具，写事件，返回呈现契约（WO-26）。"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from core.agents.flows import flow_tool_whitelist
from core.logger import get_logger

logger = get_logger(__name__)

def _resolve_params(step: dict, args: dict, case_id: str | None, step_ctx: dict) -> tuple[dict, str | None]:
    """解析步骤参数绑定（WO-26c）。

    支持：$case_id / $arg.<field>（缺失宽松透传，兼容既有流程包）/
    $step.<output>（未产出即报可读错误）/ 字面量；step.required 声明必填参数。
    """
    raw = step.get("params") or {}
    resolved: dict = {}
    for key, expr in raw.items():
        if not isinstance(expr, str):
            resolved[key] = expr
        elif expr == "$case_id":
            resolved[key] = case_id
        elif expr.startswith("$arg."):
            resolved[key] = args.get(expr[len("$arg."):])
        elif expr.startswith("$step."):
            out = expr[len("$step."):]
            if out not in step_ctx:
                return {}, f"步骤上下文缺失：{expr}（上一步未产出该输出）"
            resolved[key] = step_ctx[out]
        else:
            resolved[key] = expr
    for req in step.get("required", []):
        if resolved.get(req) in (None, ""):
            return {}, f"参数缺失：{req}"
    return resolved, None

def run_flow(
    flow: dict,
    case_id: str | None,
    args: dict,
    db: Session,
    track: str = "internal",
) -> dict:
    """执行流程包。

    Args:
        flow: 流程包 dict（load_flows 产物）。
        case_id: 案件 ID（可为空，如全局建档）。
        args: 流程参数。
        db: SQLAlchemy session。
        track: 事件轨（默认 internal）。

    Returns:
        {"reply": str, "tool_cards": list[dict], "recorded_facts": list[dict],
         "presentation": "result_card" | "dialog"}
    """
    # WO-26b：优先 Pydantic AI 内核；失败/不可用回退轻量执行器
    # F-15：卡片动作（_force_lightweight）走确定性轻量执行器，不经 LLM
    if not args.get("_force_lightweight"):
        try:
            from core.agents.pai import run_flow_with_pai
            result = run_flow_with_pai(flow, case_id, args, db, track=track)
            if result is not None:
                return result
        except Exception as exc:  # noqa: BLE001 — PAI 失败回退，不阻断
            logger.warning("pai runner failed, fallback to lightweight: %s", exc)

    key = flow.get("key", "unknown")
    name = flow.get("name", key)
    presentation = flow.get("presentation", "result_card")
    steps = flow.get("steps", [])

    try:
        step_ctx: dict = {}
        last_res: dict = {}
        executed_any = False

        for step in steps:
            tool_name = step.get("tool")
            if tool_name not in flow_tool_whitelist():
                logger.warning(
                    "Flow '%s' step tool '%s' not in whitelist, skipping", key, tool_name
                )
                continue

            # WO-26c：解析 params 绑定（$arg.x / $case_id / $step.<output> / 字面量）
            params, resolve_err = _resolve_params(step, args, case_id, step_ctx)
            if resolve_err:
                return {
                    "reply": f"执行{name}时参数无效：{resolve_err}",
                    "tool_cards": [],
                    "recorded_facts": [],
                    "presentation": presentation,
                }

            res: dict = {}
            if tool_name == "declaration_check":
                from core.agents.declaration_check import run_declaration_check
                res = run_declaration_check(
                    case_id=case_id or "",
                    files=params.get("files") or [],
                    folder=params.get("folder"),
                    db=db,
                )

            elif tool_name == "calculator_assess":
                res = {"needs_form": True}
                if params.get("bank"):
                    res["bank"] = str(params["bank"])

            elif tool_name == "policy_check":
                merged = {k: v for k, v in params.items() if v is not None}
                merged.update({k: v for k, v in args.items() if k not in merged})
                try:
                    from core.policy.engine import run_policy_check
                    res = run_policy_check(case_id=case_id, args=merged, db=db)
                except (ImportError, AttributeError):
                    logger.warning("policy_check tool not implemented in policy engine")
                    res = {"status": "skipped", "message": "policy_check not implemented"}

            elif tool_name == "context_event_write":
                event_type = params.get("event_type") or "flow_triggered"
                content_str = str(params.get("content") or f"流程【{name}】触发事件: {event_type}")
                if case_id:
                    from core.context.accumulator import append_context_event
                    append_context_event(
                        case_id=case_id,
                        source_type=f"flow:{key}",
                        content=content_str,
                        db=db,
                        track=track,
                    )
                res = {"status": "success", "event_type": event_type}

            elif tool_name == "draft_email":
                from core.agents.draft_email import run_draft_email
                merged_draft = {k: v for k, v in params.items() if v is not None}
                merged_draft.update({k: v for k, v in args.items() if k not in merged_draft})
                res = run_draft_email(case_id=case_id, args=merged_draft, db=db, track=track)

            elif tool_name == "folder_lookup":
                from core.case_folder.lookup import lookup_files
                from core.models.orm import Case
                query = str(params.get("query") or args.get("query") or "").strip()
                if not case_id:
                    res = {"status": "error", "message": "案件未关联文件夹", "summary": "案件未关联文件夹"}
                else:
                    case_obj = db.query(Case).filter(Case.id == case_id).first()
                    if not case_obj or not case_obj.folder_path:
                        res = {"status": "error", "message": "案件未关联文件夹", "summary": "案件未关联文件夹"}
                    elif ".." in query:
                        res = {"status": "error", "message": f"路径穿越拒绝：query '{query}' 包含 '..' 字符", "summary": f"路径穿越拒绝：query '{query}' 包含 '..' 字符"}
                    else:
                        try:
                            found = lookup_files(case_obj, query)
                            if not found:
                                res = {"status": "success", "count": 0, "files": [], "summary": f"在案件文件夹中未找到匹配 '{query}' 的文件"}
                            else:
                                names_str = ", ".join(f["rel_path"] for f in found[:3])
                                res = {
                                    "status": "success",
                                    "count": len(found),
                                    "files": found,
                                    "summary": f"找到 {len(found)} 个匹配文件：{names_str}",
                                }
                        except ValueError as ve:
                            res = {"status": "error", "message": str(ve), "summary": str(ve)}

            elif tool_name == "gap_analysis":
                from core.case_folder.gap_analysis import analyze_gaps
                from core.models.orm import Case
                if not case_id:
                    res = {"status": "skipped", "message": "案件未关联文件夹", "summary": "案件未关联文件夹", "missing": [], "matched": [], "suggestions": []}
                else:
                    case_obj = db.query(Case).filter(Case.id == case_id).first()
                    if not case_obj or not case_obj.folder_path:
                        res = {"status": "skipped", "message": "案件未关联文件夹", "summary": "案件未关联文件夹", "missing": [], "matched": [], "suggestions": []}
                    else:
                        res = analyze_gaps(case_obj, db)

            elif tool_name == "task_create":
                from core.task_engine.dispatcher import (
                    create_task as create_task_action,
                )
                title = str(params.get("title") or args.get("title") or "").strip()
                if not title:
                    res = {"status": "error", "message": "任务标题不能为空", "summary": "任务标题不能为空"}
                elif not case_id:
                    res = {"status": "error", "message": "创建任务必须在案件对话中进行", "summary": "创建任务必须在案件对话中进行"}
                else:
                    deadline_raw = params.get("deadline") or args.get("deadline")
                    try:
                        deadline = datetime.fromisoformat(str(deadline_raw)) if deadline_raw else None
                    except ValueError:
                        deadline = None
                    action = create_task_action(
                        case_id=case_id,
                        task_type="general",
                        source_channel="manual",
                        title=title,
                        context={"wo41": True},
                        deadline=deadline,
                        priority=str(params.get("priority") or args.get("priority") or "normal"),
                        assignee=params.get("assignee") or args.get("assignee"),
                        db=db,
                    )
                    res = {"status": "success", "task_id": action.id, "title": action.title, "summary": f"已创建任务：{action.title}"}

            elif tool_name == "checklist_query":
                from core.models.orm import CaseChecklist
                if not case_id:
                    res = {"status": "error", "message": "清单查询必须在案件对话中进行", "summary": "清单查询必须在案件对话中进行", "missing": []}
                else:
                    items = db.query(CaseChecklist).filter(CaseChecklist.case_id == case_id).order_by(CaseChecklist.id).all()
                    done = sum(1 for it in items if it.status == "received")
                    missing = [it.item_name for it in items if it.status != "received"][:10]
                    use_ai = bool(params.get("use_ai") or args.get("use_ai"))
                    suggestion = ""
                    if use_ai:
                        from core.checklist.master_picker import pick_checklist
                        from core.models.orm import Case
                        case_obj = db.query(Case).filter(Case.id == case_id).first()
                        if case_obj:
                            recs = pick_checklist(
                                {"case_id": case_id, "lender": case_obj.lender or "CBA",
                                 "employment_type": case_obj.employment_type or "PAYG",
                                 "residency": case_obj.residency or "PR", "purpose": case_obj.purpose or "Purchase"},
                                db, use_ai=True,
                            )
                            if recs:
                                suggestion = "AI 推荐补充：" + "、".join(f"{p['name_zh']}" for p in recs[:5])
                    res = {"status": "success", "done": done, "total": len(items), "missing": missing,
                           "summary": f"清单进度 {done}/{len(items)}；缺失：{'、'.join(missing) if missing else '无'}" + (f"；{suggestion}" if suggestion else "")}
            elif tool_name == "checklist_preview":
                from core.checklist.master_picker import pick_checklist
                from core.models.orm import Case
                if not case_id:
                    res = {"status": "error", "message": "清单预选必须在案件对话中进行", "summary": "清单预选必须在案件对话中进行", "items": []}
                else:
                    case_obj = db.query(Case).filter(Case.id == case_id).first()
                    if not case_obj:
                        res = {"status": "error", "message": "案件不存在", "summary": "案件不存在", "items": []}
                    else:
                        preview = pick_checklist(
                            {"case_id": case_id, "lender": params.get("lender") or case_obj.lender or "CBA",
                             "employment_type": case_obj.employment_type or "PAYG",
                             "residency": case_obj.residency or "PR", "purpose": case_obj.purpose or "Purchase"},
                            db, use_ai=False,
                        )
                        items_summary = "、".join(f"{p['name_zh']}" for p in preview[:10])
                        res = {"status": "success", "count": len(preview), "items": preview[:10],
                               "summary": f"按画像预选 {len(preview)} 项：{items_summary}"}

            if step.get("output"):
                step_ctx[str(step["output"])] = res

            last_res = res
            executed_any = True

            # 每步成功写一条 internal 事件（若 case_id 存在；草稿未确认不蒸馏，WO-27）
            if case_id and tool_name != "draft_email":
                if isinstance(res, dict) and "summary" in res:
                    summary_text = str(res["summary"])
                else:
                    summary_text = f"流程【{name}】执行步骤 {tool_name} 完成"
                summary_text = summary_text[:200]
                try:
                    from core.context.accumulator import append_context_event
                    append_context_event(
                        case_id=case_id,
                        source_type=f"flow:{key}",
                        content=summary_text,
                        db=db,
                        track=track,
                    )
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Failed to write flow step internal event: %s", exc)

        if not executed_any:
            reply = f"流程包【{name}】无可执行步骤"
            tool_cards = []
        else:
            payload = last_res if isinstance(last_res, dict) else {}
            tool_cards = [
                {
                    "type": f"flow_{key}",
                    "title": name,
                    "presentation": presentation,
                    "payload": payload,
                }
            ]
            if isinstance(last_res, dict) and "summary" in last_res:
                reply = f"{name}：{last_res['summary']}"
            elif presentation == "dialog":
                reply = f"已触发{name}，请在弹窗中完成后续操作。"
            else:
                reply = f"{name}执行完成。"

        return {
            "reply": reply,
            "tool_cards": tool_cards,
            "recorded_facts": [],
            "presentation": presentation,
        }

    except Exception:
        logger.exception("Error executing flow '%s'", key)
        return {
            "reply": f"执行{name}时遇到问题，请稍后再试。",
            "tool_cards": [],
            "recorded_facts": [],
            "presentation": presentation,
        }
