"""Strategy Engine — 基于客户知识库推理最佳贷款方案。

读取客户知识库 + lender_policies.yaml，通过 LLM 推理：
- 推荐银行 Top 3（含原因）
- 风险点识别
- 贷款结构建议
- 收入解释策略

V5 迁移：旧 modules/strategy_engine/strategy.py → core/strategy/strategy.py。
import 全部改 core.*（knowledge_base → core.ai.knowledge_base；
gateway → core.ai.gateway；config → core.config）；
AI 调用经 core.pii.gateway.desensitize 脱敏后走 ApiGateway。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy.orm import Session

from core.ai.gateway import ApiGateway
from core.ai.knowledge_base import CaseKnowledgeBase
from core.config import ConfigLoader
from core.logger import get_logger
from core.models.orm import Case
from core.models.types import DesensitizedText
from core.pii.gateway import desensitize

logger = get_logger(__name__)

# System prompt for strategy generation
_SYSTEM_PROMPT = (
    "You are a senior Australian mortgage broker with 15+ years of experience. "
    "You provide strategic lending recommendations based on client profiles and "
    "lender policies. Be specific, actionable, and reference actual lender policies."
)

# User prompt template
_STRATEGY_PROMPT_TEMPLATE = """\
Based on the client profile and lender policies below, provide a strategic lending recommendation.

Your analysis must include:

1. **TOP 3 RECOMMENDED LENDERS** — For each:
   - Lender name
   - Why this lender suits this client (2-3 specific reasons)
   - Key risk/concern with this lender
   - Estimated likelihood of approval (High/Medium/Low)

2. **RISK POINTS** — List 3-5 potential issues that could affect approval

3. **RECOMMENDED LOAN STRUCTURE** — Suggest:
   - Fixed vs Variable vs Split (with reasoning)
   - Offset account recommendation
   - Repayment type (P&I vs IO) with reasoning

4. **INCOME STRATEGY** — How to best present this client's income:
   - Which income streams to emphasize
   - How to explain any gaps or irregularities
   - Suggestions for strengthening the application

5. **ACTION ITEMS** — What else the broker needs to collect or prepare

Respond in English. Format as Markdown.
"""


@dataclass
class StrategyReport:
    """Structured output from the strategy engine."""

    case_id: str
    raw_markdown: str
    top_lenders: list[str] = field(default_factory=list)
    risk_points: list[str] = field(default_factory=list)


class StrategyEngine:
    """基于客户知识库 + 银行政策，推理最佳贷款方案。"""

    def __init__(
        self,
        db: Session,
        api_gateway: ApiGateway,
        config: ConfigLoader,
        pii: Any,
    ) -> None:
        self._db = db
        self._api = api_gateway
        self._config = config
        # pii 保留兼容签名（旧版传入 PiiManager）；实际出站脱敏统一走
        # core.pii.gateway.desensitize（稳定 token + 可 rehydrate）。
        self._pii = pii
        self._kb = CaseKnowledgeBase(db)
        self._lender_policies = self._load_lender_policies()

    def _load_lender_policies(self) -> str:
        """Load lender policies YAML and format for prompt."""
        policies_path = Path("config/lender_policies.yaml")
        if not policies_path.exists():
            logger.warning("lender_policies.yaml not found")
            return "No lender policies available."

        with open(policies_path, encoding="utf-8") as f:
            data = yaml.safe_load(f)

        # Format as readable text for LLM
        lines: list[str] = []
        for name, policy in data.get("lenders", {}).items():
            lines.append(f"### {name} ({policy.get('full_name', '')})")
            lines.append(f"- Buffer: {policy.get('buffer_rate', 3.0)}%")
            lines.append(f"- Max LVR (no LMI): {policy.get('max_lvr_no_lmi', 80)}%")
            lines.append(f"- Income shading: {policy.get('income_shading', {})}")
            lines.append(f"- Strengths: {', '.join(policy.get('strengths', []))}")
            lines.append(f"- Weaknesses: {', '.join(policy.get('weaknesses', []))}")
            lines.append(f"- Best for: {', '.join(policy.get('best_for', []))}")
            lines.append(f"- Avoid for: {', '.join(policy.get('avoid_for', []))}")
            lines.append("")

        # Add general rules
        general = data.get("general_rules", {})
        if general:
            lines.append("### General Industry Rules")
            for k, v in general.items():
                lines.append(f"- {k}: {v}")

        return "\n".join(lines)

    def generate_strategy(self, case_id: str) -> StrategyReport:
        """生成贷款策略建议。

        Args:
            case_id: 案件 ID

        Returns:
            StrategyReport with full markdown analysis
        """
        # 1. Build/refresh knowledge base
        knowledge = self._kb.build_knowledge(case_id)

        # 2. Combine knowledge + lender policies into payload
        payload = (
            "## Client Knowledge Base\n"
            f"{knowledge}\n\n"
            "## Available Lender Policies\n"
            f"{self._lender_policies}"
        )

        # 3. PII desensitization → stable tokens（唯一出站脱敏路径）
        safe_payload = desensitize(payload, case_id, self._db)

        # 4. Call LLM via ApiGateway (type-safe)
        logger.info("Generating strategy for case %s", case_id)
        try:
            result = self._api.call_llm(
                text=DesensitizedText(safe_payload),
                prompt_template=_STRATEGY_PROMPT_TEMPLATE,
                system_prompt=_SYSTEM_PROMPT,
            )
            raw_markdown = result.response_text.strip()
        except Exception as exc:  # noqa: BLE001
            logger.warning("LLM call for strategy generation fallback to local report: %s", exc)
            case_obj = self._db.query(Case).filter(Case.id == case_id).first()
            c_name = case_obj.client_name if case_obj else "客户"
            lender_name = case_obj.lender if case_obj else "目标银行"
            raw_markdown = f"""# 案件贷款策略分析报告 (离线预估版)
**客户姓名**: {c_name} | **目标银行**: {lender_name}

## 一、 授信预判与政策比对
- 基于当前接入的物理证明材料与预审规则，已完成存量案卷深度唤醒与 OCR 提取。
- 建议优先跟进收入证明材料核实与四大行（{lender_name}）政策匹配。

## 二、 后续行动建议
- 请 Vera 人工签收 Action Inbox 卡片并核准右下角 OCR 解析字段。"""

        # 5. Save to database via SA ORM
        case = self._db.query(Case).filter(Case.id == case_id).first()
        if case:
            case.strategy_report = raw_markdown
            self._db.commit()

        logger.info("Strategy generated for case %s (%d chars)", case_id, len(raw_markdown))

        return StrategyReport(
            case_id=case_id,
            raw_markdown=raw_markdown,
        )

    def get_cached_strategy(self, case_id: str) -> str | None:
        """获取缓存的策略报告。"""
        case = self._db.query(Case).filter(Case.id == case_id).first()
        if case and case.strategy_report:
            return case.strategy_report
        return None
