"""流程包执行器 — 按 steps 顺序执行白名单工具，写事件，返回呈现契约（WO-26）。"""

from __future__ import annotations

from sqlalchemy.orm import Session

from core.agents.flows import flow_tool_whitelist
from core.logger import get_logger

logger = get_logger(__name__)


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
    key = flow.get("key", "unknown")
    name = flow.get("name", key)
    presentation = flow.get("presentation", "result_card")
    steps = flow.get("steps", [])

    try:
        last_res: dict = {}
        executed_any = False

        for step in steps:
            tool_name = step.get("tool")
            if tool_name not in flow_tool_whitelist():
                logger.warning(
                    "Flow '%s' step tool '%s' not in whitelist, skipping", key, tool_name
                )
                continue

            res: dict = {}
            if tool_name == "declaration_check":
                from core.agents.declaration_check import run_declaration_check
                files = args.get("files", [])
                folder = args.get("folder", None)
                cid = case_id or ""
                res = run_declaration_check(case_id=cid, files=files, folder=folder, db=db)

            elif tool_name == "calculator_assess":
                res = {"needs_form": True}

            elif tool_name == "policy_check":
                try:
                    from core.policy.engine import run_policy_check
                    res = run_policy_check(case_id=case_id, args=args, db=db)
                except (ImportError, AttributeError):
                    logger.warning("policy_check tool not implemented in policy engine")
                    res = {"status": "skipped", "message": "policy_check not implemented"}

            elif tool_name == "context_event_write":
                event_type = step.get("params", {}).get("event_type", "flow_triggered")
                content_str = f"流程【{name}】触发事件: {event_type}"
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

            last_res = res
            executed_any = True

            # 每步成功写一条 internal 事件（若 case_id 存在）
            if case_id:
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
