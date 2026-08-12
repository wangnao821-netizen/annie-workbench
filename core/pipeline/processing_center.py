from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy.orm import Session

from core.pipeline.classifier import ClassificationResult, classify_and_extract
from core.pipeline.extractor import extract_business_fields
from core.pipeline.parser import parse_file
from core.ai.gateway import ApiGateway
from core.config import ConfigLoader
from core.logger import get_logger
from core.pii.gateway import PiiManager
from core.models.orm import CaseFile

logger = get_logger(__name__)


# ── Per-Type 预期字段（来自 classify.txt prompt 定义）──
EXPECTED_FIELDS: dict[str, list[str]] = {
    "Payslip": ["材料分类", "材料日期", "雇主", "税前收入", "税后收入", "发薪周期", "养老金"],
    "BankStatement": ["材料分类", "材料日期", "银行", "账户尾号", "期末余额"],
    "DriverLicense": ["材料分类", "材料日期", "材料有效性", "证件号码", "持有人", "州/领地", "驾照等级"],
    "Passport": ["材料分类", "材料日期", "材料有效性", "证件号码", "国籍", "签发国"],
    "Visa": ["材料分类", "材料日期", "材料有效性", "签证子类", "签证条件"],
    "MedicareCard": ["材料分类", "材料有效性", "卡号", "IRN"],
    "TaxReturn": ["材料分类", "材料日期", "应税收入", "税务师"],
    "EmploymentLetter": ["材料分类", "材料日期", "雇主", "职位", "年薪", "入职日期"],
    "BAS": ["材料分类", "材料日期", "GST收入", "GST支出"],
    "AccountantLetter": ["材料分类", "材料日期", "会计", "确认收入"],
    "HomeLoanStatement": ["材料分类", "材料日期", "贷款机构", "贷款余额", "月供", "利率"],
    "CreditCardStatement": ["材料分类", "材料日期", "发卡行", "信用额度", "欠款余额", "最低还款"],
    "ContractOfSale": ["材料分类", "材料日期", "成交价", "交割日", "物业地址"],
    "ValuationReport": ["材料分类", "材料日期", "估价", "估价师"],
    "RentalAgreement": ["材料分类", "材料日期", "周租金", "租期"],
}


@dataclass
class ProcessingResult:
    """文档处理中心的统一输出。"""
    file_id: str
    document_type: str
    confidence: float
    suggested_name: str
    extracted_fields: dict
    processing_method: str          # "ai" | "regex_fallback" | "ai+regex_enriched"
    quality_score: int              # 0-100
    field_fill_rate: float          # 0.0-1.0
    expected_fields: list[str] = field(default_factory=list)
    missing_fields: list[str] = field(default_factory=list)
    parse_route: str = ""
    text_length: int = 0
    processing_time_ms: int = 0
    warnings: list[str] = field(default_factory=list)


def compute_quality_score(
    doc_type: str,
    extracted_fields: dict,
    confidence: float,
    processing_method: str,
    text_length: int,
) -> tuple[int, float, list[str], list[str]]:
    """计算 0-100 的综合质量评分。

    Returns:
        (quality_score, field_fill_rate, expected_fields_list, missing_fields_list)
    """
    expected = EXPECTED_FIELDS.get(doc_type, ["材料分类", "材料日期"])
    filled = [f for f in expected if extracted_fields.get(f) not in (None, "", "null", "N/A")]
    fill_rate = len(filled) / max(len(expected), 1)
    missing = [f for f in expected if f not in filled]

    # 权重计算
    fill_score = fill_rate * 40
    conf_score = min(confidence, 1.0) * 30
    method_score = {"ai": 15, "ai+regex_enriched": 12, "regex_fallback": 5}.get(processing_method, 0)
    text_score = min(text_length / 500, 1.0) * 15

    total = round(fill_score + conf_score + method_score + text_score)
    return total, round(fill_rate, 3), expected, missing


class DocumentProcessingCenter:
    """统一文档扫描处理中心 — 所有文件入口的唯一处理管道。

    所有入口（upload pipeline, reparse, deep scan, auto-parse）
    都必须调用 self.process() 方法。
    """

    def __init__(
        self,
        config: ConfigLoader,
        pii_manager: PiiManager | None = None,
        gateway: ApiGateway | None = None,
    ) -> None:
        self.config = config
        self.pii_manager = pii_manager
        self.gateway = gateway

    def process(
        self,
        file_path: Path,
        file_id: str,
        case_id: str,
        db: Session,
    ) -> ProcessingResult:
        """统一处理入口。不管文件从哪来，都走这个方法。

        Args:
            file_path: 物理文件的绝对路径
            file_id: CaseFile 表的主键
            case_id: 所属案件 ID
            db: SQLAlchemy session

        Returns:
            ProcessingResult 包含分类、字段、质量评分等全部结果
        """
        start_time = time.time()
        warnings: list[str] = []

        # ── Step 1: TEXT EXTRACTION ──
        parsed = parse_file(file_path)
        min_chars = self.config.settings.parser.min_text_chars
        if len(parsed.text) < min_chars:
            warnings.append(f"文本过短 ({len(parsed.text)} < {min_chars} 字符)")

        # ── Step 2: AI CLASSIFICATION + EXTRACTION ──
        processing_method = "regex_fallback"
        result: ClassificationResult | None = None

        if self.pii_manager and self.gateway and len(parsed.text) >= 50:
            try:
                desensitized = self.pii_manager.redact_text(parsed.text)
                result = classify_and_extract(
                    desensitized, parsed.parse_route, self.config, self.gateway,
                )
                processing_method = "ai"
            except Exception as e:
                logger.warning("AI classification failed, falling back to regex: %s", e)
                warnings.append(f"AI 分类失败: {e}")

        # AI 失败或不可用 → fallback 到正则
        if result is None or not result.extracted_data:
            # Regex fallback for business field extraction
            regex_fields = extract_business_fields(file_path.name, parsed.text)
            if result and result.document_type != "Unknown":
                # AI 分类成功但字段为空 → 用正则补充
                result = ClassificationResult(
                    document_type=result.document_type,
                    confidence=result.confidence,
                    source_label=result.source_label,
                    suggested_name=result.suggested_name,
                    extracted_data=regex_fields,
                    route_used=result.route_used,
                )
                processing_method = "ai+regex_enriched"
            else:
                result = ClassificationResult(
                    document_type=regex_fields.get("材料分类", "Unknown"),
                    confidence=0.5,
                    source_label="rule_fallback",
                    suggested_name=file_path.name,
                    extracted_data=regex_fields,
                    route_used="regex_fallback",
                )

        # ── Step 3: QUALITY SCORING ──
        quality_score, fill_rate, expected_list, missing_list = compute_quality_score(
            result.document_type,
            result.extracted_data,
            result.confidence,
            processing_method,
            len(parsed.text),
        )

        # ── Step 4: PERSIST ──
        cf = db.get(CaseFile, file_id)
        if cf:
            cf.assigned_type = result.document_type
            cf.confidence = result.confidence
            cf.suggested_name = result.suggested_name

            # 摊平 extracted_data：将嵌套的 extracted_fields 提升到顶层，
            # 移除已存在独立列的元字段，让前端直接展示业务字段
            flat_data = dict(result.extracted_data) if result.extracted_data else {}
            # 如果 AI 返回了嵌套的 extracted_fields，将其内容合并到顶层
            nested_fields = flat_data.pop("extracted_fields", None)
            if isinstance(nested_fields, dict):
                flat_data.update(nested_fields)
            # 移除已有独立列存储的元字段（前端不需要重复展示）
            meta_keys_to_remove = [
                "document_type", "confidence", "source_label",
                "suggested_name", "route_used", "is_clear_quality",
                "quality_issues",
            ]
            for mk in meta_keys_to_remove:
                flat_data.pop(mk, None)

            cf.extracted_data = json.dumps(flat_data, ensure_ascii=False)
            cf.quality_score = quality_score
            cf.processing_method = processing_method
            cf.field_fill_rate = fill_rate
            cf.parse_route = parsed.parse_route
            db.commit()

        elapsed_ms = int((time.time() - start_time) * 1000)
        logger.info(
            "DocumentProcessingCenter: %s → type=%s conf=%.2f quality=%d method=%s (%dms)",
            file_path.name, result.document_type, result.confidence,
            quality_score, processing_method, elapsed_ms,
        )

        return ProcessingResult(
            file_id=file_id,
            document_type=result.document_type,
            confidence=result.confidence,
            suggested_name=result.suggested_name,
            extracted_fields=result.extracted_data,
            processing_method=processing_method,
            quality_score=quality_score,
            field_fill_rate=fill_rate,
            expected_fields=expected_list,
            missing_fields=missing_list,
            parse_route=parsed.parse_route,
            text_length=len(parsed.text),
            processing_time_ms=elapsed_ms,
            warnings=warnings,
        )