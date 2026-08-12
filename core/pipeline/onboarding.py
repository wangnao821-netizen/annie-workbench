import asyncio
import json
import os
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from core.case_creation import generate_or_match_client_id
from core.config import ConfigLoader
from core.context.accumulator import append_context_event
from core.logger import get_logger
from core.models.db import get_session
from core.models.orm import Case, CaseFile
from core.strategy.strategy import StrategyEngine

logger = get_logger(__name__)

# 画像摘要中强信号的客户类型 → 客户目标（供 Vera 核实的自动提取）
_GOAL_SIGNALS: tuple[tuple[str, str], ...] = (
    ("为**转贷客户**", "转贷（优化现有贷款）"),
    ("**转贷客户**", "转贷（优化现有贷款）"),
    ("转贷客户", "转贷（优化现有贷款）"),
    ("为**首次置业者**", "首次置业"),
    ("首次置业者", "首次置业"),
    ("首次置业客户", "首次置业"),
    ("为**投资客**", "投资房购买"),
    ("自建房客户", "自建房贷款"),
)

# 画像摘要中风险信号段落标记
_RISK_MARKERS: tuple[str, ...] = (
    "主要风险点：",
    "主要风险:",
    "风险点：",
    "风险提示：",
    "⚠️ 主要风险",
)


def _extract_client_goal(portrait_text: str) -> str:
    """从画像文本中提取客户目标。

    优先认以"客户目标："或"目标："开头的行（严格锚点，避免把描述性段落误填）；
    锚点未命中时，从画像摘要段落识别强信号客户类型（如"为**转贷客户**"）自动提炼。
    都提取不到返回空字符串，由调用方决定是否保持 NULL。

    Args:
        portrait_text: AI 生成的画像文本。

    Returns:
        提取到的目标文本（≤200 字），无则返回空串。
    """
    for line in portrait_text.splitlines():
        stripped = line.strip()
        for prefix in ("客户目标：", "客户目标:", "目标：", "目标:"):
            if stripped.startswith(prefix):
                candidate = stripped[len(prefix):].strip().lstrip("-*•# ").strip()
                if len(candidate) >= 2:
                    return candidate[:200]
    # 强信号客户类型自动提炼（画像摘要段落句式，误判风险低）
    for signal, goal in _GOAL_SIGNALS:
        if signal in portrait_text:
            return f"{goal}（自动提取，请核实）"[:200]
    return ""


def _extract_special_circumstances(portrait_text: str) -> str:
    """从画像文本中提取特殊情况/风险点。

    优先认以"特殊情况："或"风险点："开头的行（严格锚点），最多取前 3 条；
    锚点未命中时，从画像摘要的"主要风险点："段落提取第一句。
    都提取不到返回空字符串。

    Args:
        portrait_text: AI 生成的画像文本。

    Returns:
        提取到的特殊情况文本（≤500 字），无则返回空串。
    """
    collected: list[str] = []
    for line in portrait_text.splitlines():
        stripped = line.strip()
        for prefix in ("特殊情况：", "特殊情况:", "风险点：", "风险点:"):
            if stripped.startswith(prefix):
                candidate = stripped[len(prefix):].strip().lstrip("-*•# ").strip()
                if len(candidate) >= 5:
                    collected.append(candidate[:200])
                    break
    if collected:
        return "; ".join(collected[:3])[:500]
    # 画像摘要"主要风险点"段落（取第一句，避免把整段风险说明灌入）
    for marker in _RISK_MARKERS:
        idx = portrait_text.find(marker)
        if idx < 0:
            continue
        seg = portrait_text[idx + len(marker):].lstrip(" *").strip()
        if seg.startswith("**"):
            seg = seg[2:]
        cuts = [
            p for p in (seg.find("。"), seg.find("\n"), seg.find("；"), seg.find(";"), seg.find(","), seg.find("，"))
            if p > 0
        ]
        cut = min(cuts) if cuts else 200
        candidate = seg[:cut].strip().rstrip("*").strip()
        if len(candidate) >= 5:
            return candidate[:200]
    return ""

def _infer_lender_and_purpose(folder_name: str, filenames: list[str]) -> tuple[str, str]:
    full_str = (folder_name + " " + " ".join(filenames)).lower()

    lender = "Macquarie"  # Default
    if "orde" in full_str:
        lender = "ORDE"
    elif "cba" in full_str or "commbank" in full_str:
        lender = "CBA"
    elif "westpac" in full_str or "wbc" in full_str:
        lender = "Westpac"
    elif "anz" in full_str:
        lender = "ANZ"
    elif "nab" in full_str:
        lender = "NAB"
    elif "suncorp" in full_str:
        lender = "Suncorp"
    elif "prospa" in full_str:
        lender = "Prospa"
    elif "macquarie" in full_str or "mqb" in full_str:
        lender = "Macquarie"

    purpose = "自住购房"
    if "refi" in full_str or "refinance" in full_str:
        purpose = "转贷"
    elif "purchase" in full_str or "buy" in full_str:
        purpose = "自住购房"
    elif "invest" in full_str:
        purpose = "投资购房"
    elif "business" in full_str:
        purpose = "商业贷款"

    return lender, purpose

def _infer_doc_category(filename: str) -> str:
    fn = filename.lower().replace("-", "_").replace(" ", "_")

    # 优先高识别度特异关键字识别
    if any(k in fn for k in ["gift", "stat_dec", "statutory", "declaration", "gifted"]):
        return "Gift Letter"
    if any(k in fn for k in ["employment", "employer", "probation", "job_letter", "offer_letter"]):
        return "Employment Letter"
    if any(k in fn for k in ["rent", "rental", "lease", "tenancy", "ledger", "appraisal"]):
        return "Rental Document"
    if any(k in fn for k in ["approval", "aip", "conditional", "unconditional"]):
        return "Approval Letter"
    if any(k in fn for k in ["creditcard", "credit_card", "citibank", "amex", "visa", "mastercard"]):
        return "Credit Card Statement"
    if any(k in fn for k in ["mortgage_deed", "loan_doc", "loan_agreement", "facility"]):
        return "Loan Document"
    if any(k in fn for k in ["expense", "living", "hem"]):
        return "Living Expenses"

    # 基础 6 类识别
    if any(k in fn for k in ["payslip", "pay", "salary", "wages", "remuneration"]):
        return "Payslip"
    if any(k in fn for k in ["statement", "bank", "saver", "transaction", "savings"]):
        return "Bank Statement"
    if any(k in fn for k in ["id", "passport", "licence", "license", "medicare"]):
        return "ID Document"
    if any(k in fn for k in ["tax", "noa", "notice", "ato", "itr"]):
        return "Tax Return"
    if any(k in fn for k in ["contract", "cos", "sale", "section32"]):
        return "Contract of Sale"
    if any(k in fn for k in ["val", "valuation"]):
        return "Valuation Report"

    return "Other"


def _infer_stage_from_docs(scanned_files: list) -> str:
    """基于识别到的材料类型组合推断案件最可能的阶段。

    仅在当前阶段为'收集资料'时才自动推进，不覆盖 Vera 手动调整的阶段。
    优先级从高到低：已批准 > 估价中 > 已递交 > 内部审核 > 收集资料。

    Args:
        scanned_files: 案件关联的 CaseFile 记录列表。

    Returns:
        推断出的案件阶段字符串。
    """
    types = {getattr(f, 'assigned_type', '') or '' for f in scanned_files}

    # 最高优先级：有批准信 → 已批准
    if types & {"Approval Letter"}:
        return "已批准"
    # 有估价报告 → 估价中
    if types & {"Valuation Report"}:
        return "估价中"
    # 有贷款文件 → 已递交(等银行)
    if types & {"Loan Document"}:
        return "已递交(等银行)"
    # 核心材料齐备 → 内部审核
    core_docs = types & {"Contract of Sale", "Payslip", "Bank Statement", "ID Document"}
    if len(core_docs) >= 3:
        return "内部审核"
    # 默认
    return "收集资料"


class OnboardingPipeline:
    def __init__(self, config: ConfigLoader):
        self.config = config

    def create_stubs(self, folder_paths: list[str]) -> list[dict[str, Any]]:
        """瞬间建档并自动扫描物理文件导入系统。

        审计修复 v1.16.4：逐文件夹隔离——某个文件夹处理失败（特殊文件名、
        权限异常等）只跳过该文件夹并返回 error，不再让整批导入 500。
        """
        stubs = []
        with get_session() as session:
            for path_str in folder_paths:
                try:
                    stub = self._create_stub_for_folder(session, path_str)
                    session.commit()  # 每个成功文件夹立即提交：后续失败不影响已建案
                    stubs.append(stub)
                except Exception as exc:
                    session.rollback()  # 只回滚当前失败文件夹的未提交写入
                    logger.exception("create_stubs failed for %s — folder skipped", path_str)
                    stubs.append({
                        "case_id": None,
                        "client_name": "",
                        "broker_name": "",
                        "folder_path": path_str,
                        "status": "failed",
                        "file_count": 0,
                        "error": f"{type(exc).__name__}: {exc}",
                    })
        return stubs

    def _create_stub_for_folder(self, session, path_str: str) -> dict[str, Any]:
        """为单个案件文件夹建案并注册文件记录（供 create_stubs 逐文件夹调用）。"""
        folder_path = Path(path_str)
        case_folder_name = folder_path.name

        client_name = "Unknown"
        broker_name = "Brandon"  # 默认 Broker（Vera 指定：无 Broker 层时一律 Brandon）

        if len(folder_path.parts) >= 3:
            client_name = folder_path.parent.name
            # 两级结构 根/客户/案件 时，上级的上级是根目录而非 Broker
            candidate_broker = folder_path.parent.parent.name
            if candidate_broker != self.config.client_files_root.name:
                broker_name = candidate_broker

        try:
            relative_path = folder_path.resolve().relative_to(self.config.client_files_root.resolve())
            folder_rel = relative_path.as_posix()
        except Exception:
            folder_rel = f"{broker_name}/{client_name}/{case_folder_name}"

        timestamp = int(time.time() * 1000)
        clean_name = "".join(c for c in client_name if c.isalnum()).lower()
        case_id = f"case_{clean_name}_{timestamp}"

        # Scan physical files in folder
        file_list = []
        if folder_path.exists() and folder_path.is_dir():
            for root, _, files in os.walk(folder_path):
                for f in files:
                    if not f.startswith(".") and f.lower() not in ["desktop.ini", "thumbs.db"]:
                        file_list.append((Path(root) / f, f))

        filenames = [f[1] for f in file_list]
        lender, purpose = _infer_lender_and_purpose(case_folder_name, filenames)

        # Check if case already exists by folder_path
        existing_case = session.query(Case).filter(
            (Case.folder_path == folder_rel) | (Case.folder_path == str(folder_path))
        ).first()

        if existing_case:
            case_id = existing_case.id
            existing_case.stage = "收集资料"
            existing_case.lender = lender
            existing_case.purpose = purpose
            existing_case.is_imported = True
        else:
            new_case = Case(
                id=case_id,
                client_name=client_name,
                client_id=generate_or_match_client_id(client_name, "", session)[0],
                client_email="",
                client_phone="",
                loan_amount=0.0,
                purpose=purpose or "Refinance",
                employment_type="PAYG",
                residency="Citizen",
                property_value=0.0,
                lvr=0.0,
                broker_name=broker_name,
                stage="收集资料",  # 看板第一阶段
                folder_path=folder_rel,
                lender=lender,
                is_imported=True,  # 审计修复 v1.16.10：历史导入案件不生成"新案进件"任务
                created_at=datetime.utcnow()
            )
            session.add(new_case)

        # Save CaseFile entries into processed_files table
        from core.pipeline.archive import (
            generate_suggested_name,
            get_target_directory,
        )

        for full_p, fname in file_list:
            file_id = f"file_{uuid.uuid4().hex[:12]}"
            doc_cat = _infer_doc_category(fname)
            f_size = 0
            try:
                f_size = full_p.stat().st_size
            except Exception:  # noqa: S110
                pass

            # 生成建议规范文件名与目标路径
            suggested = generate_suggested_name(
                document_type=doc_cat,
                extracted_data={},
                original_name=fname,
                client_name=client_name
            )
            t_dir = get_target_directory(doc_cat)

            # Check if file already recorded
            existing_file = session.query(CaseFile).filter(
                CaseFile.case_id == case_id,
                CaseFile.original_name == fname
            ).first()

            if not existing_file:
                # 审计修复 v1.16.3：不再在同步导入里逐文件算 MD5——
                # 2861 个文件在 NAS 上会卡住导入（"秒级建档"失效）。
                # 哈希留空，后续由离线工具/后台深度扫描补算即可。
                file_hash = None
                c_file = CaseFile(
                    id=file_id,
                    case_id=case_id,
                    original_name=fname,
                    file_extension=full_p.suffix.lower(),
                    assigned_type=doc_cat,
                    suggested_name=suggested,
                    target_dir=t_dir,
                    confidence=0.92,
                    nas_path=str(full_p),
                    status="PENDING",
                    file_size=f_size,
                    file_hash=file_hash,
                    created_at=datetime.utcnow()
                )
                session.add(c_file)

        return {
            "case_id": case_id,
            "client_name": client_name,
            "broker_name": broker_name,
            "folder_path": str(folder_path),
            "status": "importing",
            "file_count": len(file_list),
        }

    async def run_deep_scan(self, folder_paths: list[str]):
        """异步深度唤醒流水线"""
        logger.info(f"Starting deep scan for {len(folder_paths)} folders...")
        for path_str in folder_paths:
            folder_path = Path(path_str)
            await asyncio.sleep(1)

            folder_rel = None
            try:
                folder_rel = folder_path.resolve().relative_to(self.config.client_files_root.resolve()).as_posix()
            except Exception:  # noqa: S110
                pass

            with get_session() as session:
                cases = session.query(Case).order_by(Case.created_at.desc()).all()
                target_case = None
                for c in cases:
                    if c.folder_path and folder_rel and (c.folder_path == folder_rel or Path(c.folder_path) == Path(folder_rel)):
                        target_case = c
                        break
                    if c.folder_path and (c.folder_path in str(folder_path) or folder_path.name in c.folder_path):
                        target_case = c
                        break

                if target_case:
                    # Step 1: 补充 Case 元数据默认值
                    if not hasattr(target_case, 'case_type') or not target_case.case_type:
                        target_case.case_type = "FullDoc"
                    if target_case.lender is None:
                        target_case.lender = ""
                    session.commit()
                    logger.info(f"Completed deep scan for case: {target_case.id}")

                    # 1. 自动初始化并生成清单
                    try:
                        from core.checklist.generator import (
                            generate_checklist_draft,
                            save_confirmed_checklist,
                        )
                        draft_items = generate_checklist_draft(target_case.id, session)
                        save_confirmed_checklist(target_case.id, draft_items, session)
                        logger.info(f"Checklist automatically generated and saved for case: {target_case.id}")
                    except Exception as e:
                        logger.error(f"Failed to auto generate checklist for case {target_case.id}: {e}")

                    # 2. 自动生成 AI 贷款策略报告
                    try:
                        from core.models.orm import CaseKnowledge
                        scanned_files = session.query(CaseFile).filter(CaseFile.case_id == target_case.id).all()

                        from core.pipeline.processing_center import DocumentProcessingCenter
                        from core.pipeline.parser import parse_file
                        from core.ai.gateway import ApiGateway
                        from core.pii.gateway import PiiManager

                        pii = PiiManager()
                        gw = ApiGateway(self.config)
                        center = DocumentProcessingCenter(
                            config=self.config,
                            pii_manager=pii,
                            gateway=gw,
                        )

                        for f_rec in scanned_files:
                            # 审计修复 v1.16.9：跳过已解析文件（断点续跑不重复处理）
                            if (
                                f_rec.extracted_data
                                and f_rec.extracted_data.strip() not in ("", "{}", "null")
                            ):
                                continue
                            if f_rec.nas_path:
                                full_p = Path(f_rec.nas_path) if Path(f_rec.nas_path).is_absolute() else (self.config.client_files_root / f_rec.nas_path)
                                if full_p.exists():
                                    try:
                                        # DPC 统一处理：OCR + AI分类 + regex fallback + 质量评分 + 写回DB
                                        dpc_result = center.process(full_p, f_rec.id, target_case.id, session)

                                        # .msg 邮件元数据补充（DPC 不处理邮件特有字段）
                                        if f_rec.file_extension == '.msg':
                                            parsed = parse_file(full_p)
                                            if parsed and parsed.metadata:
                                                try:
                                                    existing_data = json.loads(f_rec.extracted_data) if f_rec.extracted_data else {}
                                                    msg_subject = parsed.metadata.get('subject', '')
                                                    if msg_subject:
                                                        existing_data['邮件主题'] = msg_subject
                                                    existing_data['发件人'] = parsed.metadata.get('sender', '')
                                                    existing_data['邮件日期'] = parsed.metadata.get('date', '')
                                                    existing_data['邮件正文摘要'] = (parsed.text or '')[:200]
                                                    existing_data['附件数'] = str(len(parsed.attachments)) if hasattr(parsed, 'attachments') and parsed.attachments else '0'
                                                    f_rec.extracted_data = json.dumps(existing_data, ensure_ascii=False)
                                                except (json.JSONDecodeError, TypeError):
                                                    pass

                                        # 统一文件状态
                                        if (dpc_result.confidence or 0) >= 0.85 and (dpc_result.document_type or 'Unknown') != 'Unknown':
                                            f_rec.status = 'APPROVED'
                                        else:
                                            f_rec.status = 'NEEDS_MANUAL_REVIEW'
                                    except Exception as parse_err:
                                        logger.warning(f"Deep scan DPC failed for file {f_rec.id}: {parse_err}")
                                        f_rec.status = 'NEEDS_MANUAL_REVIEW'
                                        if not f_rec.extracted_data:
                                            f_rec.extracted_data = json.dumps({
                                                "文件名": f_rec.original_name,
                                                "材料类型": f_rec.assigned_type,
                                                "解析状态": "原始文件已扫入"
                                            }, ensure_ascii=False)
                        session.commit()

                        # Step 2: Checklist 联动 — OCR 完成后自动比对完整度
                        try:
                            from core.checklist.matcher import check_completeness
                            check_completeness(target_case.id, session, self.config)
                            logger.info(f"Checklist completeness checked for case: {target_case.id}")
                        except Exception as cl_err:
                            logger.warning(f"Checklist check failed for case {target_case.id}: {cl_err}")

                        # Step 3: 智能阶段推断 — 仅在默认阶段时才自动推进
                        if target_case.stage == "收集资料":
                            inferred = _infer_stage_from_docs(scanned_files)
                            if inferred != "收集资料":
                                target_case.stage = inferred
                                session.commit()
                                logger.info(f"Stage auto-advanced to '{inferred}' for case: {target_case.id}")

                        # ═══ WO-3: 将 OCR 提取的结构化数据汇总注入案件上下文 ═══
                        try:
                            extraction_lines = []
                            for f_rec in scanned_files:
                                if f_rec.extracted_data:
                                    try:
                                        data = json.loads(f_rec.extracted_data)
                                        valuable_keys = [
                                            k for k in data.keys()
                                            if k not in ("文件名", "解析路由", "文本字数", "解析状态")
                                        ]
                                        if valuable_keys:
                                            fields_str = ", ".join(
                                                f"{k}: {data[k]}" for k in valuable_keys[:8]
                                            )
                                            extraction_lines.append(
                                                f"[{f_rec.assigned_type}] {f_rec.original_name} → {fields_str}"
                                            )
                                    except (json.JSONDecodeError, TypeError):
                                        pass

                            if extraction_lines:
                                context_content = (
                                    "文件深度扫描完成，以下为各材料的结构化提取摘要:\n"
                                    + "\n".join(extraction_lines)
                                )
                                append_context_event(
                                    target_case.id,
                                    "file_deep_scan",
                                    context_content,
                                    session,
                                    trigger_distill=True,
                                )
                                logger.info(
                                    "Context event appended after deep scan: %d files summarized",
                                    len(extraction_lines),
                                )
                        except Exception as ctx_err:
                            logger.warning("Failed to append context after deep scan: %s", ctx_err)
                        # ═══ WO-3 END ═══

                        files_desc = "\n".join([f"- {f.original_name} (分类: {f.assigned_type})" for f in scanned_files])
                        safe_amount = target_case.loan_amount or 0.0
                        kb_init_text = f"""本案件已由物理归档文件夹扫描入库。
客户姓名: {target_case.client_name}
贷款金额: ${safe_amount:,.2f}
目标银行: {target_case.lender}
贷款目的: {target_case.purpose}
已发现物理文件清单如下:
{files_desc}"""

                        knowledge = CaseKnowledge(
                            case_id=target_case.id,
                            content=kb_init_text,
                            source="onboarding_deep_scan"
                        )
                        session.add(knowledge)
                        session.commit()

                        # 触发 StrategyEngine 生成策略报告
                        engine = StrategyEngine(session, gw, self.config, pii)
                        engine.generate_strategy(target_case.id)
                        logger.info(f"Strategy report automatically generated for case: {target_case.id}")
                    except Exception as e:
                        logger.error(f"Failed to auto generate strategy for case {target_case.id}: {e}")
                        if not target_case.strategy_report:
                            target_case.strategy_report = f"# 案件贷款策略分析报告 (本地预估版)\n**客户**: {target_case.client_name} | **银行**: {target_case.lender}\n\n- 已完成案卷深度唤醒与 OCR 结构化字段提炼。\n- 建议 Vera 人工核查材料完整度。"
                            session.commit()

                    # 3. 自动生成基于物理文件真实元数据的业务生命周期时间线记录
                    try:
                        from core.models.orm import CaseTimelineEvent
                        scanned_files = session.query(CaseFile).filter(CaseFile.case_id == target_case.id).all()
                        now = datetime.utcnow()

                        # 检查是否已存在时间线事件，避免重复生成
                        existing_events_count = session.query(CaseTimelineEvent).filter(CaseTimelineEvent.case_id == target_case.id).count()
                        if existing_events_count == 0:
                            # 提取物理文件的修改时间 (st_mtime) 与 .msg 历史邮件信息
                            file_timestamps = []
                            msg_events = []

                            if folder_path.exists() and folder_path.is_dir():
                                for root, _, files in os.walk(folder_path):
                                    for f in files:
                                        if not f.startswith(".") and f.lower() not in ["desktop.ini", "thumbs.db"]:
                                            p = Path(root) / f
                                            try:
                                                mtime = datetime.fromtimestamp(p.stat().st_mtime)
                                                file_timestamps.append(mtime)

                                                # 如果是 .msg 邮件，进行原生邮件头与日期解析
                                                if f.lower().endswith(".msg"):
                                                    p_res = parse_file(p)
                                                    if p_res and p_res.metadata:
                                                        sub = p_res.metadata.get("subject", f)
                                                        snd = p_res.metadata.get("sender", "未知发件人")
                                                        dt_str = p_res.metadata.get("date", "")

                                                        # 解析邮件时间
                                                        msg_dt = mtime
                                                        if dt_str:
                                                            try:
                                                                # 简单处理常见 ISO 或标准日期格式
                                                                cleaned_dt = dt_str.split("+")[0].strip()
                                                                msg_dt = datetime.fromisoformat(cleaned_dt)
                                                            except Exception:  # noqa: S110
                                                                pass

                                                        msg_events.append(CaseTimelineEvent(
                                                            case_id=target_case.id,
                                                            event_type="email_received",
                                                            title=f"历史邮件归档: {sub}",
                                                            description=f"解析存量物理邮件 [{f}]。发件人: {snd}。邮件生成于 {msg_dt.strftime('%Y-%m-%d %H:%M')}。",
                                                            created_at=msg_dt
                                                        ))
                                            except Exception:  # noqa: S110
                                                pass
                            file_timestamps.sort()

                            # 节点 1: 存量建立时间点 (取物理文件最早 modification time)
                            earliest_dt = file_timestamps[0] if file_timestamps else now - timedelta(days=1)
                            earliest_str = earliest_dt.strftime("%Y-%m-%d")
                            loan_amt_str = f"${target_case.loan_amount:,.2f}" if target_case.loan_amount else "待填额度"

                            session.add(CaseTimelineEvent(
                                case_id=target_case.id,
                                event_type="stage_advanced",
                                title="存量建立资产接入",
                                description=f"系统捕获客户 {target_case.client_name} 物理存量案卷（目录: {target_case.folder_path}，目标银行: {target_case.lender}，最早材料创建于 {earliest_str}）。",
                                created_at=earliest_dt
                            ))

                            # 节点 2: 注入解析出来的历史 .msg 邮件时间线节点
                            for m_evt in msg_events:
                                session.add(m_evt)

                            # 节点 3: 物理材料识别与归档 (实际文件数量与分类)
                            if scanned_files:
                                cat_counts: dict[str, int] = {}
                                for f_rec in scanned_files:
                                    cat_counts[f_rec.assigned_type] = cat_counts.get(f_rec.assigned_type, 0) + 1
                                cat_desc = " · ".join([f"{cat} ({count} 份)" for cat, count in cat_counts.items()])
                                material_dt = file_timestamps[-1] if len(file_timestamps) > 1 else earliest_dt + timedelta(minutes=10)
                                session.add(CaseTimelineEvent(
                                    case_id=target_case.id,
                                    event_type="document_received",
                                    title=f"收到客户材料 ({len(scanned_files)} 份)",
                                    description=f"收到借款人提供的物理证明材料共 {len(scanned_files)} 份。AI 分类识别结果：{cat_desc}。包含 Payslip 等文件，已完成合规脱敏与 OCR 结构化提炼。",
                                    created_at=material_dt
                                ))

                            # 节点 4: 存量唤醒与清单核实 (当下时刻)
                            items_count = len(draft_items) if 'draft_items' in locals() and draft_items else 0
                            session.add(CaseTimelineEvent(
                                case_id=target_case.id,
                                event_type="action_completed",
                                title="存量深度唤醒与核实清单就绪",
                                description=f"比对 {target_case.lender} 授信政策，自动规划出 {items_count} 项核实清单，供 Vera 人工签收复核。",
                                created_at=now
                            ))

                            session.commit()
                            logger.info(f"Enriched case-centric real timeline for: {target_case.id}")
                    except Exception as e:
                        logger.error(f"Failed to enrich timeline for case {target_case.id}: {e}")

                    # ═══ P2: 全局画像分析 — AI 一次性通览所有文件生成案件综合洞察 ═══
                    try:
                        all_files = session.query(CaseFile).filter(
                            CaseFile.case_id == target_case.id
                        ).all()

                        # 汇总所有文件的结构化提取数据
                        file_summaries = []
                        for f_rec in all_files:
                            summary_line = f"- {f_rec.original_name} [{f_rec.assigned_type}]"
                            if f_rec.extracted_data:
                                try:
                                    data = json.loads(f_rec.extracted_data)
                                    biz_fields = {
                                        k: v for k, v in data.items()
                                        if k not in ("文件名", "解析路由", "文本字数", "解析状态", "材料类型")
                                    }
                                    if biz_fields:
                                        fields_str = "; ".join(f"{k}={v}" for k, v in list(biz_fields.items())[:6])
                                        summary_line += f"  → {fields_str}"
                                except (json.JSONDecodeError, TypeError):
                                    pass
                            file_summaries.append(summary_line)

                        if file_summaries:
                            portrait_prompt = (
                                "你是一名资深贷款经纪人助手。根据以下案件信息和文件分析结果，生成一份案件综合画像。\n\n"
                                f"## 案件基本信息\n"
                                f"- 客户姓名: {target_case.client_name}\n"
                                f"- 目标银行: {target_case.lender or '未知'}\n"
                                f"- 贷款金额: ${(target_case.loan_amount or 0):,.0f}\n"
                                f"- 贷款目的: {target_case.purpose or '未知'}\n"
                                f"- 当前阶段: {target_case.stage}\n\n"
                                f"## 已识别文件清单 ({len(file_summaries)} 份)\n"
                                + "\n".join(file_summaries) + "\n\n"
                                "## 请输出以下三部分（用 Markdown）：\n\n"
                                "### 一、案件进度判断\n"
                                "根据已有文件判断：材料收集完整度约多少？还缺什么关键材料？当前阶段是否合理？\n\n"
                                "### 二、案件画像摘要\n"
                                "用 3-5 句话概括此案件的核心特征（客户类型、收入来源、贷款特点、风险点）。\n\n"
                                "### 三、关键时间线洞察\n"
                                "基于文件日期和内容，推断案件的关键时间节点和下一步行动建议。\n\n"
                                "### 四、客户目标与特殊情况\n"
                                "- 客户目标：用一句话概括客户的核心贷款目标（以\"客户目标：\"开头）\n"
                                "- 特殊情况：列出可能影响审批的特殊情况或风险点（以\"特殊情况：\"开头）\n"
                            )

                            from core.models.types import DesensitizedText
                            desensitized_prompt = DesensitizedText(portrait_prompt)

                            try:
                                from core.ai.gateway import ApiGateway as _GW
                                gw_portrait = _GW(self.config)
                                ai_result = gw_portrait.call_llm(
                                    text=desensitized_prompt,
                                    prompt_template="{text}",
                                    system_prompt="你是专业的澳洲贷款经纪人 AI 助手。请用简洁的中文回答。",
                                )
                                portrait_text = ai_result.response_text

                                if portrait_text and len(portrait_text.strip()) > 50:
                                    target_case.context_summary = portrait_text

                                    # 从画像中提取客户目标和特殊情况，回填到案件字段（严格锚点，提取不到保持 NULL）
                                    if not target_case.client_goal:
                                        _goal = _extract_client_goal(portrait_text)
                                        if _goal:
                                            target_case.client_goal = _goal
                                    if not target_case.special_circumstances:
                                        _special = _extract_special_circumstances(portrait_text)
                                        if _special:
                                            target_case.special_circumstances = _special

                                    session.commit()

                                    from core.models.orm import CaseKnowledge as _CK
                                    session.add(_CK(
                                        case_id=target_case.id,
                                        content=f"# AI 全局画像分析\n\n{portrait_text}",
                                        source="deep_scan_portrait",
                                    ))
                                    session.commit()
                                    logger.info(
                                        "Global portrait analysis completed for case %s (%d chars)",
                                        target_case.id, len(portrait_text),
                                    )
                                else:
                                    logger.warning(
                                        "Portrait analysis returned insufficient content for case %s",
                                        target_case.id,
                                    )
                            except Exception as ai_err:
                                logger.warning(
                                    "AI portrait analysis failed for case %s (non-fatal): %s",
                                    target_case.id, ai_err,
                                )
                    except Exception as portrait_err:
                        logger.error(
                            "Failed to run global portrait analysis for case %s: %s",
                            target_case.id, portrait_err,
                        )
                    # ═══ P2 END ═══

        logger.info("All deep scans completed.")


def run_import_job(job_id: str, config: ConfigLoader) -> None:
    """Execute a single import job: pending → running → done/failed.

    MVP 顺序队列：逐案件执行 AI 深度扫描，失败可重试。
    """
    from core.models.orm import ImportJob

    with get_session() as session:
        job = session.get(ImportJob, job_id)
        if not job:
            return
        job.status = "running"
        job.updated_at = datetime.utcnow()
        session.commit()
        case = session.get(Case, job.case_id)
        folder_str = case.folder_path if case else None

    if not folder_str:
        with get_session() as session:
            job = session.get(ImportJob, job_id)
            job.status = "failed"
            job.error = f"Case not found: {job.case_id}"
            job.updated_at = datetime.utcnow()
            session.commit()
        return

    folder = Path(folder_str)
    if not folder.is_absolute():
        folder = config.client_files_root / folder_str

    try:
        asyncio.run(OnboardingPipeline(config).run_deep_scan([str(folder)]))
    except Exception as exc:
        with get_session() as session:
            job = session.get(ImportJob, job_id)
            job.status = "failed"
            job.error = str(exc)
            job.updated_at = datetime.utcnow()
            session.commit()
        return

    with get_session() as session:
        job = session.get(ImportJob, job_id)
        job.status = "done"
        job.file_processed = job.file_total or 0
        job.updated_at = datetime.utcnow()
        session.commit()


def run_import_job_batch(job_ids: list[str], config: ConfigLoader) -> None:
    """Run import jobs sequentially (MVP: single-threaded queue)."""
    for job_id in job_ids:
        try:
            run_import_job(job_id, config)
        except Exception:
            logger.exception("Import job %s failed unexpectedly", job_id)

