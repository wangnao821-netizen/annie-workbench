"""WO-21 解析器包：6 家银行机械抽取参数 + HEM + 版本锚点。"""

from __future__ import annotations

import tempfile
import time
from importlib import import_module
from pathlib import Path

_PARSERS = ("boc", "cba", "macquarie", "ma_money", "latrobe", "resimac")


def profile_envelope(bank: str, data: dict, extracted_at: str | None = None,
                     tool: str = "core/calculator/parsers",
                     indicative: bool = False) -> dict:
    """解析结果 → 完整档案 YAML 信封（bank/profile_version/version_stamp）。

    indicative：True 仅用于 stamp_duty/lmi_fallback 等估算表；6 家银行档案恒 False。
    """
    effective = data.get("effective_from", "")
    return {
        "bank": bank,
        "name": data["name"],
        "source_file": data["source_file"],
        "source_version": data["source_version"],
        "source_date": data.get("source_date"),
        "effective_from": effective,
        "profile_version": effective.replace("-", "."),
        "indicative": indicative,
        "version_stamp": {
            "source_version": data["source_version"],
            "source_date": data.get("source_date"),
            "effective_from": effective,
            "extracted_at": extracted_at or time.strftime("%Y-%m-%dT%H:%M:%SZ",
                                                          time.gmtime()),
            "tool": tool,
        },
        "parameters": data["parameters"],
        "options": data.get("options", {}),
        "notes": data.get("notes", []),
    }


def parse(path: Path) -> dict:
    """按文件名关键词识别银行并解析；无法识别抛 ValueError。"""
    name = (path.name or "").lower().replace("_", "").replace(" ", "")
    for bank in _PARSERS:
        if bank.replace("_", "") in name:
            return _parse(bank, path)
    raise ValueError(f"cannot identify bank from filename: {path.name}")


def _parse(bank: str, path: Path) -> dict:
    if bank not in _PARSERS:
        raise ValueError(f"unknown bank: {bank}")
    module = import_module(f"core.calculator.parsers.{bank}")
    return module.parse(path)


def _parse_upload(bank: str, content: bytes) -> dict:
    """上传字节 → 临时文件（.xlsm）→ 对应 parser 解析（只读，不执行宏）。"""
    suffix = ".xlsm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as fh:
        fh.write(content)
        tmp = Path(fh.name)
    try:
        return _parse(bank, tmp)
    finally:
        tmp.unlink(missing_ok=True)

