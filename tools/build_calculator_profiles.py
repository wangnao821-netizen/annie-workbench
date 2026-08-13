"""WO-21 档案构建工具：解析源 xlsm -> 生成 config/calculator/*.yaml。

用法：python -m tools.build_calculator_profiles <src_dir> [out_dir]
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import yaml

from core.calculator.parsers import (
    boc,
    cba,
    latrobe,
    ma_money,
    macquarie,
    profile_envelope,
    resimac,
)

PARSERS = {
    "boc": boc,
    "cba": cba,
    "macquarie": macquarie,
    "ma_money": ma_money,
    "latrobe": latrobe,
    "resimac": resimac,
}

STAMP_DUTY = {
    "source": "indicative OpenClaw v1.1.0 标准转让税档（可经上传闭环更新）",
    "states": {
        "NSW": {
            "transfer": [[13607, 0.0125, 0.0], [32000, 0.0150, 170.09],
                         [84000, 0.0175, 445.99], [304000, 0.0350, 1404.99],
                         [1066000, 0.0450, 9104.99], [3040000, 0.0550, 43364.99],
                         [1e12, 0.0700, 152034.99]],
            "registry_fee_note": "indicative",
        },
        "VIC": {
            "transfer": [[25000, 0.0140, 0.0], [130000, 0.0240, 350.0],
                         [960000, 0.0600, 2870.0], [1e12, 0.0650, 52570.0]],
            "mortgage": [[1e12, 0.0010, 0.0]],
        },
        "QLD": {
            "transfer": [[5000, 0.0, 0.0], [75000, 0.0150, 0.0],
                         [540000, 0.0350, 1050.0], [1e12, 0.0450, 17325.0]],
        },
        "WA": {
            "transfer": [[120000, 0.019, 0.0], [150000, 0.0285, 2280.0],
                         [360000, 0.038, 3135.0], [725000, 0.0475, 11115.0],
                         [1e12, 0.0515, 28450.0]],
        },
        "SA": {
            "transfer": [[12000, 0.01, 0.0], [30000, 0.02, 120.0],
                         [50000, 0.03, 480.0], [100000, 0.035, 1080.0],
                         [200000, 0.04, 2830.0], [250000, 0.0425, 6830.0],
                         [300000, 0.0475, 8955.0], [500000, 0.05, 11330.0],
                         [1e12, 0.055, 21330.0]],
        },
        "TAS": {
            "transfer": [[3000, 0.0175, 0.0], [25000, 0.02, 35.0],
                         [75000, 0.025, 475.0], [200000, 0.03, 1725.0],
                         [375000, 0.035, 5475.0], [725000, 0.04, 11550.0],
                         [1e12, 0.045, 25550.0]],
        },
        "ACT": {
            "transfer": [[200000, 0.0175, 0.0], [500000, 0.0275, 5250.0],
                         [1e12, 0.0450, 13500.0]],
        },
        "NT": {
            "transfer": [[525000, 0.03, 0.0], [3e6, 0.04, 15750.0],
                         [5e6, 0.045, 114750.0], [1e12, 0.0500, 204750.0]],
        },
    },
}

LMI_FALLBACK = {
    "source": "indicative LMI 保费率（可经上传闭环更新）",
    "insurers": {
        "qbe": {"rates": [[0.80, 0.005], [0.85, 0.010], [0.90, 0.020],
                          [0.95, 0.035]], "max_rate": 0.05},
        "genworth": {"rates": [[0.80, 0.005], [0.85, 0.010], [0.90, 0.020],
                               [0.95, 0.035]], "max_rate": 0.05},
        "helia": {"rates": [[0.80, 0.005], [0.85, 0.010], [0.90, 0.020],
                            [0.95, 0.035]], "max_rate": 0.05},
    },
}


def build_parser_profile(bank: str, src_dir: Path) -> dict:
    parser = PARSERS[bank]
    src = src_dir / parser.FILE
    data = parser.parse(src)
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(src.stat().st_mtime))
    return profile_envelope(bank, data, extracted_at=timestamp,
                            tool="tools/build_calculator_profiles.py")


def main() -> int:
    src_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else \
        Path(r"D:\WhatFile\xwechat_files\wangnao820_8b0f\msg\file\2026-08")
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else \
        Path(__file__).resolve().parent.parent / "config" / "calculator"
    out_dir.mkdir(parents=True, exist_ok=True)

    for bank in PARSERS:
        profile = build_parser_profile(bank, src_dir)
        out = out_dir / f"{bank}.yaml"
        out.write_text(yaml.safe_dump(profile, allow_unicode=True, sort_keys=False),
                       encoding="utf-8")
        print(f"wrote {bank}.yaml  v{profile['source_version']}  "
              f"({len(profile['parameters']['living']['hem_table']['families'])} HEM families)")

    (out_dir / "stamp_duty.yaml").write_text(
        yaml.safe_dump(STAMP_DUTY, allow_unicode=True, sort_keys=False),
        encoding="utf-8")
    (out_dir / "lmi_fallback.yaml").write_text(
        yaml.safe_dump(LMI_FALLBACK, allow_unicode=True, sort_keys=False),
        encoding="utf-8")
    print("wrote stamp_duty.yaml / lmi_fallback.yaml")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())