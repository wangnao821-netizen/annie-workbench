"""WO-21 数据模型：输入 DTO、计算步骤与结果（契约 §二）。"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any, Literal

Purpose = Literal["OO", "INV"]
Repayment = Literal["PI", "IO"]
HouseholdStatus = Literal["Single", "Couple"]
DocType = Literal["full_doc", "alt_doc", "low_doc"]
Product = Literal["prime", "specialist", "quickstart", "standard", "other"]


@dataclass
class ApplicantIn:
    """单个申请人年度收入字段（全部为年度值）。"""

    base: float = 0.0
    overtime: float = 0.0
    bonus_commission: float = 0.0
    casual: float = 0.0
    investment_income: float = 0.0
    dividends: float = 0.0
    foreign_income: float = 0.0
    rental_income: float = 0.0
    government_benefits: float = 0.0
    other_taxable: float = 0.0
    other_nontaxable: float = 0.0
    company_npbt: float = 0.0
    company_addbacks: float = 0.0


@dataclass
class LoanPortionIn:
    """一笔贷款的分片（可用于 OO/INV 拆分）。"""

    amount: float
    rate: float
    term_years: int = 30
    io_years: int = 0
    purpose: Purpose = "OO"
    repayment: Repayment = "PI"


@dataclass
class LoanIn:
    """贷款整体输入。"""

    portions: list[LoanPortionIn] = field(default_factory=list)
    security_value: float = 0.0
    postcode: str = ""
    state: str = ""
    mortgage_insurer: str = ""
    product: Product = "standard"
    doc_type: DocType = "full_doc"
    simple_refinance: bool = False
    refinance_exception: bool = False


@dataclass
class CommitmentIn:
    """存量负债。type: mortgage_oo/mortgage_inv/personal/credit_card/overdraft/
    line_of_credit/hire_purchase/lease/other/bnpl。"""

    type: str
    balance: float = 0.0
    limit: float = 0.0
    rate: float = 0.0
    remaining_months: int = 0
    declared_monthly: float = 0.0


@dataclass
class HouseholdIn:
    """家庭结构（用于 HEM 查询）。"""

    status: HouseholdStatus = "Single"
    dependents: int = 0
    income_for_hem: float | None = None  # None -> 使用总收入


@dataclass
class LivingExpensesIn:
    """申报生活费（可选）。"""

    declared_basic_monthly: float = 0.0
    declared_non_hem: float = 0.0


@dataclass
class AssessRequest:
    """/api/calculator/assess 请求体。"""

    bank: str
    applicants: list[ApplicantIn] = field(default_factory=list)
    loan: LoanIn = field(default_factory=LoanIn)
    commitments: list[CommitmentIn] = field(default_factory=list)
    household: HouseholdIn = field(default_factory=HouseholdIn)
    living_expenses: LivingExpensesIn = field(default_factory=LivingExpensesIn)


@dataclass
class CalcStep:
    """一个可追溯的确定性计算步骤（过程可见红线）。"""

    step_id: str
    label: str
    formula: str
    inputs: dict[str, Any]
    output: Any
    source: str = ""


@dataclass
class CalcResult:
    """计算器输出。verdict: APPROVE/REFER/DECLINE/NO_RESULT。"""

    bank: str
    verdict: str
    max_loan: float | None
    surplus: float
    indicator: str | None
    indicator_value: float | None
    steps: list[CalcStep] = field(default_factory=list)
    breakdown: dict[str, float] = field(default_factory=dict)
    profile_used: dict[str, Any] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


@dataclass
class ProfileInfo:
    """档案元信息（/api/calculator/profiles 返回）。"""

    bank: str
    name: str
    source_file: str
    source_version: str
    source_date: date | None
    effective_from: str
    profile_version: str
    version: str  # YAML 内容哈希，用作并发乐观锁
