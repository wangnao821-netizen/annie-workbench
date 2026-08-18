"""Pydantic AI 编排内核 — 流程包执行 + 模型路由（WO-26b）。V1 只吃核心能力，不碰
Harness/MCP/Logfire；红线/缓存纪律见施工单；任何失败回退轻量执行器。"""

from __future__ import annotations

import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from core.config import get_config
from core.logger import get_logger
from core.models.orm import AiUsageLog
from core.pii.gateway import desensitize, rehydrate

if TYPE_CHECKING:
    from pydantic_ai import RunContext  # noqa: F401

logger = get_logger(__name__)

_AGENTS: dict[str, Any] = {}
_gemini_failures = 0
_gemini_skipped_until = 0.0
_TOOL_NAMES = frozenset({"declaration_check", "calculator_assess", "policy_check", "context_event_write", "draft_email", "folder_lookup", "gap_analysis", "task_create", "checklist_query", "checklist_preview", "file_ops_open"})
_DEFAULT_TIMEOUT_S = 30
_SYSTEM_PROMPT = "你是澳洲贷款经纪团队的 AI 助手。按流程包意图调用白名单工具，回答具体到这个客户，不要给通用建议。"


class FlowDeps(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    db: Session
    case_id: str
    track: str


def _system_prompt(flow: dict) -> str:
    key = str(flow.get("key", "unknown"))
    tools = ", ".join(str(s.get("tool", "?")) for s in flow.get("steps", [])) or "无"
    return f"{_SYSTEM_PROMPT}\n【流程包】{flow.get('name', key)}（{key}）\n【步骤工具】{tools}\n只能调用上述白名单工具；参数不足时返回可读原因，绝不编造。"


def _declaration_check(ctx, files: list[str] | None = None, folder: str | None = None) -> dict:
    if not files and not folder:
        return {"status": "blocked", "reason": "扫描/读文件类工具必须由 Vera 显式指定路径"}
    from core.agents.declaration_check import run_declaration_check
    return run_declaration_check(case_id=ctx.deps.case_id, files=files or [], folder=folder, db=ctx.deps.db)


def _calculator_assess(bank: str = "", request: str = "") -> dict:
    return {"needs_form": True, "bank": bank} if bank else {"status": "invalid", "reason": "工具参数校验失败：缺少 bank"}


def _policy_check(ctx, query: str = "") -> dict:
    try:
        from core.policy.engine import run_policy_check
        return run_policy_check(case_id=ctx.deps.case_id, args={"query": query}, db=ctx.deps.db)
    except (ImportError, AttributeError):
        return {"status": "skipped", "message": "policy_check not implemented"}


def _context_event_write(ctx, event_type: str = "flow_triggered", content: str = "") -> dict:
    from core.context.accumulator import append_context_event
    append_context_event(case_id=ctx.deps.case_id, source_type=f"flow:{event_type}",
                         content=content or f"流程触发事件：{event_type}", db=ctx.deps.db, track=ctx.deps.track)
    return {"status": "success", "event_type": event_type}


def _folder_lookup(ctx, query: str = "") -> dict:
    if ".." in query:
        return {"status": "error", "message": "路径穿越拒绝：query 包含 '..' 字符"}
    from core.case_folder.lookup import lookup_files
    from core.models.orm import Case
    case_obj = ctx.deps.db.query(Case).filter(Case.id == ctx.deps.case_id).first() if ctx.deps.case_id else None
    if not case_obj or not case_obj.folder_path:
        return {"status": "error", "message": "案件未关联文件夹"}
    try:
        found = lookup_files(case_obj, query)
        return {"status": "success", "count": len(found), "files": found, "summary": f"找到 {len(found)} 个匹配文件"}
    except ValueError as ve:
        return {"status": "error", "message": str(ve)}


def _gap_analysis(ctx) -> dict:
    from core.case_folder.gap_analysis import analyze_gaps
    from core.models.orm import Case
    if not ctx.deps.case_id:
        return {"status": "skipped", "message": "案件未关联文件夹", "summary": "案件未关联文件夹", "missing": [], "matched": [], "suggestions": []}
    case_obj = ctx.deps.db.query(Case).filter(Case.id == ctx.deps.case_id).first()
    if not case_obj or not case_obj.folder_path:
        return {"status": "skipped", "message": "案件未关联文件夹", "summary": "案件未关联文件夹", "missing": [], "matched": [], "suggestions": []}
    return analyze_gaps(case_obj, ctx.deps.db)


def _task_create(ctx) -> dict:
    """创建任务（WO-41）。"""
    title = str(ctx.get("title") or "").strip()
    if not title:
        return {"status": "error", "message": "任务标题不能为空", "summary": "任务标题不能为空"}
    if not ctx.get("case_id"):
        return {"status": "error", "message": "创建任务必须在案件对话中进行", "summary": "创建任务必须在案件对话中进行"}
    from core.task_engine.dispatcher import create_task as create_task_action
    action = create_task_action(
        case_id=ctx["case_id"],
        task_type="general",
        source_channel="manual",
        title=title,
        context={"wo41": True},
        deadline=ctx.get("deadline"),
        priority=str(ctx.get("priority") or "normal"),
        assignee=ctx.get("assignee"),
        db=ctx.get("db"),
    )
    return {"status": "success", "task_id": action.id, "title": action.title, "summary": f"已创建任务：{action.title}"}


def _checklist_query(ctx, use_ai: bool = False) -> dict:
    """查询清单缺口/进度，可选 AI 重选推荐（WO-43，只推荐不落库）。"""
    case_id = ctx.deps.case_id
    db = ctx.deps.db
    if not case_id:
        return {"ok": False, "error": "清单查询必须在案件对话中进行"}
    from core.models.orm import Case, CaseChecklist
    items = db.query(CaseChecklist).filter(CaseChecklist.case_id == case_id).order_by(CaseChecklist.id).all()
    done = sum(1 for it in items if it.status == "received")
    total = len(items)
    missing = [it.item_name for it in items if it.status != "received"][:10]
    summary = f"清单进度 {done}/{total}；缺失：{'、'.join(missing) if missing else '无'}"
    if use_ai:
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


def _checklist_preview(ctx, lender: str = "") -> dict:
    """按案件画像纯规则预选推荐（WO-43，不覆盖已存清单）。"""
    case_id = ctx.deps.case_id
    db = ctx.deps.db
    if not case_id:
        return {"status": "error", "message": "清单预选必须在案件对话中进行", "summary": "清单预选必须在案件对话中进行", "items": []}
    from core.checklist.master_picker import pick_checklist
    from core.models.orm import Case
    case_obj = db.query(Case).filter(Case.id == case_id).first()
    if not case_obj:
        return {"status": "error", "message": "案件不存在", "summary": "案件不存在", "items": []}
    preview = pick_checklist(
        {"case_id": case_id, "lender": lender or case_obj.lender or "CBA",
         "employment_type": case_obj.employment_type or "PAYG",
         "residency": case_obj.residency or "PR", "purpose": case_obj.purpose or "Purchase"},
        db, use_ai=False,
    )
    items_summary = "、".join(f"{p['name_zh']}" for p in preview[:10])
    return {"status": "success", "count": len(preview), "items": preview[:10],
            "summary": f"按画像预选 {len(preview)} 项：{items_summary}"}


def _file_ops_open(ctx, action: str = "browse", target: str = "") -> dict:
    """打开文件操作面板（WO-44）：dialog 卡由前端消费，参数由抽屉补全，Vera 确认后走 API。"""
    case_id = ctx.deps.case_id
    if not case_id:
        return {"ok": False, "case_id": "", "status": "error",
                "summary": "文件操作必须在案件对话中进行"}
    return {"ok": True, "case_id": case_id, "status": "success",
            "summary": "已打开文件操作面板，请在弹窗中选择要预览/改名/移动/放入的文件"}


def _tool_defs() -> list[Any]:
    return [_declaration_check, _calculator_assess, _policy_check, _context_event_write, _folder_lookup, _gap_analysis, _task_create, _checklist_query, _checklist_preview, _file_ops_open]


def _pick_provider(task_text: str, cfg) -> str:
    routing = getattr(cfg.settings.ai, "routing", None)
    if routing is None:
        return "deepseek"
    gemini_ok = (bool(cfg.settings.ai.fallback and os.getenv(cfg.settings.ai.fallback.api_key_env, ""))
                 and time.time() > _gemini_skipped_until and _gemini_failures < routing.gemini_skip_after_failures)
    if task_text and any(p in task_text for p in routing.english_task_prefixes) and gemini_ok:
        return "gemini"
    return routing.default_provider or "deepseek"


def _build_agent(provider: str, cfg) -> Any | None:
    if provider in _AGENTS:
        return _AGENTS[provider]
    try:
        from pydantic_ai import Agent
        from pydantic_ai.models.openai import OpenAIChatModel
        from pydantic_ai.providers.openai import OpenAIProvider
    except ImportError:
        return None
    pcfg = cfg.settings.ai.primary if provider == "deepseek" else cfg.settings.ai.fallback
    if pcfg is None or not os.getenv(pcfg.api_key_env, ""):
        return None
    _AGENTS[provider] = Agent(
        OpenAIChatModel(pcfg.model, provider=OpenAIProvider(api_key=os.getenv(pcfg.api_key_env, ""), base_url=pcfg.base_url)),
        system_prompt=_SYSTEM_PROMPT,
        tools=_tool_defs(),
        deps_type=FlowDeps,
    )
    return _AGENTS[provider]


def _run_agent(agent: Any, prompt: str, timeout_s: float, deps: FlowDeps) -> Any:
    with ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(agent.run_sync, prompt, deps=deps).result(timeout=timeout_s)


def _confirm_gate(flow: dict, args: dict) -> str | None:
    if flow.get("confirm_required") and not args.get("confirmed"):
        return "confirm_required：本流程需要 Vera 确认后才执行"
    return "扫描/读文件类工具必须由 Vera 显式指定路径" if (any(s.get("tool") == "declaration_check" for s in flow.get("steps", [])) and not args.get("files") and not args.get("folder")) else None


def _log_usage(db: Session, case_id: str | None, track: str, provider: str, model: str, result: Any, latency_ms: int, flow_key: str) -> None:
    try:
        usage = getattr(result, "usage", lambda: None)()
        p = int(getattr(usage, "input_tokens", 0) or 0) if usage else 0
        c = int(getattr(usage, "output_tokens", 0) or 0) if usage else 0
        hit = int(getattr(usage, "cache_read_tokens", 0) or 0) if usage else 0
        db.add(AiUsageLog(case_id=case_id, scope="case" if case_id else "global", track=track, provider=provider, model=model,
                          prompt_tokens=p, completion_tokens=c, prompt_cache_hit_tokens=hit, prompt_cache_miss_tokens=max(p - hit, 0),
                          cost_usd=(p * 0.0001 / 1000) + (c * 0.0002 / 1000), latency_ms=latency_ms,
                          layer_names=json.dumps([f"flow:{flow_key}"], ensure_ascii=False)))
        db.commit()
    except Exception:  # 用量记录失败不阻断
        logger.warning("failed to write ai_usage_log", exc_info=True)


def run_flow_with_pai(flow: dict, case_id: str | None, args: dict, db: Session, track: str = "internal") -> dict | None:
    """用 Pydantic AI 执行流程包；失败返回 None（调用方回退轻量执行器）。"""
    global _gemini_failures, _gemini_skipped_until
    if os.getenv("PYTEST_CURRENT_TEST") and os.getenv("VERA_PAI_TEST") != "1":
        return None  # 测试环境默认不发真实 LLM；置 VERA_PAI_TEST=1 可显式走 PAI
    provider = "deepseek"
    routing = None
    try:
        cfg = get_config()
        routing = getattr(cfg.settings.ai, "routing", None)
        raw_input = json.dumps(args, ensure_ascii=False) if args else ""
        provider = _pick_provider(raw_input, cfg)
        gate_reason = _confirm_gate(flow, args)
        if gate_reason:
            return {"reply": f"已阻断：{gate_reason}", "tool_cards": [], "recorded_facts": [], "presentation": flow.get("presentation", "result_card")}
        agent = _build_agent(provider, cfg)
        if agent is None:
            return None
        timeout = routing.gemini_timeout_seconds if provider == "gemini" and routing else _DEFAULT_TIMEOUT_S
        safe_input = desensitize(raw_input, case_id or "global", db) if raw_input else ""
        prompt = _system_prompt(flow) + (f"\n【用户输入】{safe_input}" if safe_input else "")
        start = time.time()
        result = _run_agent(
            agent,
            prompt,
            timeout,
            FlowDeps(db=db, case_id=case_id or "", track=track),
        )
        latency_ms = int((time.time() - start) * 1000)
        model = cfg.settings.ai.fallback.model if provider == "gemini" and cfg.settings.ai.fallback else cfg.settings.ai.primary.model
        _log_usage(db, case_id, track, provider, model, result, latency_ms, str(flow.get("key", "unknown")))
        if provider == "gemini":
            _gemini_failures = 0
        name = str(flow.get("name", flow.get("key", "unknown")))
        reply = rehydrate(str(getattr(result, "output", "") or "流程执行完成"), case_id or "global", db)
        payload: dict = {}
        for msg in result.all_messages():
            for part in getattr(msg, "parts", []):
                if isinstance(getattr(part, "content", None), dict):
                    payload = part.content
        return {"reply": reply or f"{name}执行完成。",
                "tool_cards": [{"type": f"flow_{flow.get('key', 'unknown')}", "title": name, "presentation": flow.get("presentation", "result_card"), "payload": payload}],
                "recorded_facts": [], "presentation": flow.get("presentation", "result_card")}
    except Exception as exc:  # noqa: BLE001 — PAI 失败回退，绝不阻断对话
        if provider == "gemini":
            _gemini_failures += 1
            if routing is not None and _gemini_failures >= routing.gemini_skip_after_failures:
                _gemini_skipped_until = time.time() + routing.gemini_skip_seconds
        logger.warning("pai runner failed for flow %s: %s", flow.get("key"), exc)
        return None


def reset_health() -> None:
    global _gemini_failures, _gemini_skipped_until, _AGENTS
    _gemini_failures = 0
    _gemini_skipped_until = 0.0
    _AGENTS = {}
