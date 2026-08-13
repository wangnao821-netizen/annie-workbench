"""WO-21 计算器端点 — /api/calculator（assess / profiles / upload / apply / rollback）。

过程可见红线：assess 响应携带完整步骤轨迹；日志绝不输出请求体。
"""

from __future__ import annotations

import io
import json
import zipfile
from dataclasses import asdict
from typing import Any

import yaml
from fastapi import APIRouter, File, HTTPException, UploadFile

from core.calculator import assess as engine
from core.calculator import profiles as profiles_mod
from core.calculator import updates
from core.calculator.models import (
    ApplicantIn,
    AssessRequest,
    CommitmentIn,
    HouseholdIn,
    LivingExpensesIn,
    LoanIn,
    LoanPortionIn,
)
from server.api.schemas import (
    CalcStepSchema,
    CalculatorAssessRequest,
    CalculatorAssessResponse,
    ProfileApplyRequest,
    ProfileApplyResponse,
    ProfileDiffItem,
    ProfileInfo,
    ProfileRollbackRequest,
    ProfileRollbackResponse,
    ProfileUploadResponse,
    SmokeTestResult,
)

router = APIRouter(prefix="/api/calculator", tags=["calculator"])

_VERDICT_MAP = {"APPROVE": "PASS", "REFER": "REFER",
                "DECLINE": "FAIL", "NO_RESULT": "NO RESULT"}
_MAX_UPLOAD_BYTES = 20 * 1024 * 1024
_BANK_KEYWORDS = {
    "boc": ["boc", "bank of china"],
    "cba": ["cba", "commonwealth"],
    "macquarie": ["macquarie"],
    "ma_money": ["ma_money", "ma money"],
    "latrobe": ["latrobe"],
    "resimac": ["resimac"],
}


def _to_request(req: CalculatorAssessRequest) -> AssessRequest:
    return AssessRequest(
        bank=req.bank,
        applicants=[ApplicantIn(**a.model_dump()) for a in req.applicants],
        loan=LoanIn(
            portions=[LoanPortionIn(**p.model_dump()) for p in req.loan.portions],
            security_value=req.loan.security_value,
            postcode=req.loan.postcode,
            state=req.loan.state,
            mortgage_insurer=req.loan.mortgage_insurer,
            product=req.loan.product,
            doc_type=req.loan.doc_type,
            simple_refinance=req.loan.simple_refinance,
            refinance_exception=req.loan.refinance_exception,
        ),
        commitments=[CommitmentIn(**c.model_dump()) for c in req.commitments],
        household=HouseholdIn(
            status=req.household.status,
            dependents=req.household.dependents,
            income_for_hem=req.household.income_for_hem,
        ),
        living_expenses=LivingExpensesIn(
            declared_basic_monthly=req.living_expenses.declared_basic_monthly,
            declared_non_hem=req.living_expenses.declared_non_hem,
        ),
    )


def identify_bank(filename: str) -> str | None:
    name = (filename or "").lower()
    for bank, keys in _BANK_KEYWORDS.items():
        if any(k in name for k in keys):
            return bank
    return None


def _diff(old: Any, new: Any, path: str = "",
          acc: list[ProfileDiffItem] | None = None, limit: int = 200) -> list[ProfileDiffItem]:
    """递归叶子级 diff，HEM 大表按集合摘要；超过 limit 截断。"""
    acc = acc if acc is not None else []
    if len(acc) >= limit:
        return acc
    if isinstance(old, dict) and isinstance(new, dict):
        for key in sorted(set(old) | set(new)):
            if key in ("hem_table", "_hash"):
                continue
            _diff(old.get(key), new.get(key), f"{path}.{key}" if path else key, acc, limit)
        return acc
    if isinstance(old, list) and isinstance(new, list):
        if old != new:
            acc.append(ProfileDiffItem(
                path=path or "<list>", old=old, new=new))
        return acc
    if old != new:
        acc.append(ProfileDiffItem(path=path or "<root>", old=old, new=new))
    return acc


def _smoke(bank: str, profile: dict | None = None) -> SmokeTestResult:
    """固定向量冒烟：档案能加载且 assess 返回合法判定。"""
    profile = profile or profiles_mod.load_profile(bank)
    req = AssessRequest(
        bank=bank,
        applicants=[ApplicantIn(base=100000)],
        loan=LoanIn(portions=[LoanPortionIn(amount=400000, rate=0.06, term_years=30)],
                    security_value=600000),
        household=HouseholdIn(status="Single"),
    )
    result = engine.assess(req, profile)
    return SmokeTestResult(
        name=f"smoke:{bank}", passed=result.verdict in _VERDICT_MAP,
        detail=result.verdict)


@router.post("/assess", response_model=CalculatorAssessResponse)
def assess_calculator(req: CalculatorAssessRequest) -> CalculatorAssessResponse:
    """服务能力测算：确定性引擎 + 完整步骤轨迹。bank 未知 → 404；空 applicants → 422。"""
    if not req.bank:
        raise HTTPException(status_code=422, detail="bank required")
    try:
        profile = profiles_mod.load_profile(req.bank)
    except profiles_mod.ProfileError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if not req.applicants:
        raise HTTPException(status_code=422, detail="applicants required")
    result = engine.assess(_to_request(req), profile)
    result_cfg = profile["parameters"]["result"]
    return CalculatorAssessResponse(
        bank=req.bank,
        result=_VERDICT_MAP.get(result.verdict, result.verdict),
        indicator=result.indicator or "",
        indicator_value=result.indicator_value,
        threshold=result_cfg.get("threshold"),
        min_surplus=result_cfg.get("min_surplus"),
        surplus=result.surplus,
        max_loan=result.max_loan,
        dti=None,
        lvr=result.breakdown.get("lvr"),
        steps=[CalcStepSchema(**asdict(s)) for s in result.steps],
        profile_version=profile["profile_version"],
    )


@router.get("/profiles", response_model=list[ProfileInfo])
def list_calculator_profiles() -> list[ProfileInfo]:
    """列出 6 家计算器档案。"""
    out: list[ProfileInfo] = []
    for info in profiles_mod.list_profiles():
        out.append(ProfileInfo(
            bank=info.bank,
            name=info.name,
            version=info.version,
            effective_date=info.effective_from,
            source_file=info.source_file,
            source_hash=info.version,
            status="default",
        ))
    return out


@router.post("/profiles/upload", response_model=ProfileUploadResponse)
def upload_profile(file: UploadFile = File(...)) -> ProfileUploadResponse:  # noqa: B008
    """上传更新（xlsm/xlsx/yaml，≤20MB）→ 识别 → 解析 → diff 预览，不应用。"""
    filename = file.filename or ""
    if not filename.lower().endswith((".xlsm", ".xlsx", ".yaml", ".yml", ".json")):
        raise HTTPException(status_code=422, detail="unsupported extension")
    content = file.file.read(_MAX_UPLOAD_BYTES + 1)
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="file too large")

    bank = identify_bank(filename)
    is_new = bank is None
    review_note = None

    if filename.lower().endswith((".xlsm", ".xlsx")):
        try:
            zf = zipfile.ZipFile(io.BytesIO(content))
            if zf.testzip() is not None:
                raise zipfile.BadZipFile("corrupt zip")
        except (zipfile.BadZipFile, zipfile.LargeZipFile, OSError):
            raise HTTPException(status_code=422, detail="not a valid xlsm/xlsx")
        if bank is None:
            return ProfileUploadResponse(is_new_bank=True, needs_review=True,
                                         review_note="unknown bank: upload xlsm 需人工识别")
        try:
            from core.calculator.parsers import _parse_upload, profile_envelope
            data = _parse_upload(bank, content)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        yaml_bytes = yaml.safe_dump(
            profile_envelope(bank, data, tool="server/api/calculator.py (upload)"),
            sort_keys=False, allow_unicode=True).encode()
    else:
        try:
            data = yaml.safe_load(content.decode("utf-8"))
        except yaml.YAMLError as exc:
            raise HTTPException(status_code=422, detail=f"invalid yaml: {exc}") from exc
        if not isinstance(data, dict):
            raise HTTPException(status_code=422, detail="invalid profile")
        bank = data.get("bank") or bank
        if bank not in profiles_mod._KNOWN_BANKS:
            return ProfileUploadResponse(is_new_bank=True, needs_review=True,
                                         review_note=f"unknown bank: {bank}")
        yaml_bytes = content

    try:
        pending_id = updates.prepare_upload(bank, yaml_bytes, source_file=filename)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    current = profiles_mod.load_profile(bank)
    uploaded = yaml.safe_load(yaml_bytes)
    diff = _diff(current, uploaded)
    return ProfileUploadResponse(
        bank=bank,
        detected_version=str(uploaded.get("source_version") or ""),
        current_version=current["_hash"],
        is_new_bank=is_new,
        needs_review=bool(review_note or diff),
        review_note=review_note,
        diff=diff,
        changed_count=len(diff),
        source_hash=pending_id,
    )


@router.post("/profiles/{bank}/apply", response_model=ProfileApplyResponse)
def apply_profile(bank: str, req: ProfileApplyRequest) -> ProfileApplyResponse:
    """应用待更新（source_hash 必须匹配）；smoke 失败 → 409。"""
    pending_path = updates._PENDING_DIR / f"{bank}-{req.source_hash}.yaml"
    if not pending_path.exists():
        raise HTTPException(status_code=404, detail=f"pending not found: {req.source_hash}")
    payload = json.loads(pending_path.read_text(encoding="utf-8"))
    data = yaml.safe_load(payload["yaml"])
    try:
        profiles_mod._validate(data)
        smoke = _smoke(data.get("bank", bank), data)
    except Exception as exc:
        raise HTTPException(status_code=409, detail=f"smoke failed: {exc}") from exc
    if not smoke.passed:
        raise HTTPException(status_code=409, detail=f"smoke failed: {smoke.detail}")
    try:
        current = profiles_mod.load_profile(bank)
        res = updates.apply_pending(bank, req.source_hash,
                                    expected_version=current["_hash"])
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return ProfileApplyResponse(
        bank=bank,
        applied_version=res["version"],
        smoke_tests=[smoke],
        history=[str(req.source_hash)],
    )


@router.post("/profiles/{bank}/rollback", response_model=ProfileRollbackResponse)
def rollback_profile(bank: str, req: ProfileRollbackRequest) -> ProfileRollbackResponse:
    """回滚到 history 中指定版本。"""
    try:
        res = updates.rollback(bank, pending_id=req.version or None)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ProfileRollbackResponse(
        bank=bank,
        rolled_back_to=res["rolled_back"],
        smoke_tests=[],
    )
