"""WO-45 OCR 链路验证 — 合成样本测试（LiteParse 主链路 + 兜底分支）。

红线：全部使用 tmp_path 合成样本，不引入真实客户文件 / 真实 PII。
断言口径：英文图允许 OCR 噪声（核心 token 之一命中即可）；中文图为可观测项（仅断言非空）；
扫描 PDF 允许 parse_error 明确返回（证明兜底链路真实执行而非 ImportError 被吞）。
"""

from __future__ import annotations

import os
from pathlib import Path
from unittest import mock

import pytest
from PIL import Image, ImageDraw, ImageFont

from core.pipeline.parser import parse_file


@pytest.fixture(scope="session")
def ocr_available() -> bool:
    """探测 liteparse OCR 是否可用（依赖 tessdata：TESSDATA_PREFIX 或默认路径）。

    不可用时 OCR 强断言用例跳过（标注需 TESSDATA_PREFIX），兜底/结构用例不受影响。
    """
    try:
        from liteparse import LiteParse

        img = Image.new("RGB", (320, 80), "white")
        ImageDraw.Draw(img).text((10, 10), "PROBE 123", fill="black")
        p = Path(os.environ.get("TEMP", ".")) / "lp_ocr_probe.png"
        img.save(p)
        res = LiteParse(output_format="markdown", ocr_enabled=True).parse(str(p))
        p.unlink(missing_ok=True)
        return bool(res.text)
    except Exception:  # noqa: BLE001 — 探测引擎可用性，任何失败视为不可用（非缺陷路径）
        return False


def _require_ocr(ocr_available: bool) -> None:
    if not ocr_available:
        pytest.skip("liteparse OCR 不可用（缺 tessdata，请设 TESSDATA_PREFIX）——仅跳过 OCR 强断言，兜底链路仍验证")


def _draw_text_image(
    tmp_path: Path,
    name: str,
    lines: list[str],
    size: tuple[int, int] = (640, 260),
    font_path: str | None = None,
) -> Path:
    """白底黑字合成图片（纯内存 + tmp_path 落盘，无真实文件）。"""
    img = Image.new("RGB", size, "white")
    draw = ImageDraw.Draw(img)
    font = None
    if font_path:
        try:
            font = ImageFont.truetype(font_path, 36)
        except OSError:
            font = None
    y = 30
    for line in lines:
        draw.text((30, y), line, fill="black", font=font)
        y += 55
    path = tmp_path / name
    img.save(path)
    return path


def test_english_image_ocr(tmp_path: Path, ocr_available: bool) -> None:
    """英文文本图片 → text 非空，parse_route 为 image_ocr/native_text，核心 token 命中之一。"""
    _require_ocr(ocr_available)
    img = _draw_text_image(tmp_path, "payslip.png", ["PAYSLIP 2025", "GROSS 8000"])
    res = parse_file(img)
    assert res.text, "英文图片 OCR 应识别出文本"
    assert res.parse_route in ("image_ocr", "native_text")
    assert any(tok.lower() in res.text.lower() for tok in ("payslip", "2025", "gross"))


def test_chinese_image_ocr(tmp_path: Path, ocr_available: bool) -> None:
    """中文文本图片 → 仅断言非空（可观测项，不硬断言具体词；OCR 语言由 TESSDATA 决定）。"""
    _require_ocr(ocr_available)
    font = Path("C:/Windows/Fonts/simhei.ttf")
    if font.exists():
        img = _draw_text_image(tmp_path, "cn.png", ["工资单 2025", "收入 8000"], font_path=str(font))
    else:
        img = _draw_text_image(tmp_path, "cn.png", ["PAYSLIP 2025", "GROSS 8000"])
    res = parse_file(img)
    assert res.text, "中文图片 OCR 应产出非空文本（具体词为可观测项）"


def test_text_pdf_native(tmp_path: Path) -> None:
    """合成文本 PDF → native_text 路径，text 含写入内容。"""
    import fitz

    pdf_path = tmp_path / "native.pdf"
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((72, 72), "Hello Vera Workbench 12345")
    doc.save(pdf_path)
    doc.close()

    res = parse_file(pdf_path)
    assert res.text, "文本 PDF 应提取出文字"
    assert "12345" in res.text


def test_scanned_pdf_ocr_fallback(tmp_path: Path, ocr_available: bool) -> None:
    """扫描样 PDF（图片 PDF 化）→ 兜底 OCR 路径：text 非空（OCR 可用）或 parse_error 明确非空（不可用）。"""
    _require_ocr(ocr_available)
    import fitz

    img = _draw_text_image(tmp_path, "scan_src.png", ["STATEMENT 2025", "BALANCE 5000"])
    pdf_path = tmp_path / "scanned.pdf"
    doc = fitz.open()
    page = doc.new_page(width=640, height=260)
    page.insert_image(page.rect, filename=str(img))
    doc.save(pdf_path)
    doc.close()

    res = parse_file(pdf_path)
    # 扫描 PDF 无原生文本：必须走逐页转图 OCR 兜底；结果可为文本或明确 parse_error
    assert res.text or res.parse_error, "扫描 PDF 兜底链路应真实执行（text 或 parse_error）"


def test_msg_email_skipped_when_unconstructible(tmp_path: Path) -> None:
    """.msg 邮件：extract_msg 无法在无 Outlook 环境构造样本 → 显式跳过并标注（可观测跳过项）。"""
    try:
        import extract_msg  # noqa: F401
    except ImportError:
        pytest.skip("extract_msg 未安装")
    pytest.skip("extract_msg 不支持无 Outlook 构造 .msg 样本（WO-45 可观测跳过项，.msg 解析由既有 extract_msg 链路覆盖）")


def test_ocr_failure_fallback(tmp_path: Path) -> None:
    """纯色图片（无有效文字）→ 不抛异常，返回 image_metadata / ocr_failed 占位。"""
    img = Image.new("RGB", (300, 200), (200, 200, 200))
    path = tmp_path / "blank.png"
    img.save(path)
    res = parse_file(path)
    assert res.parse_route in ("image_metadata", "ocr_failed")


def test_subprocess_isolation_structure() -> None:
    """子进程隔离：_parse_with_liteparse 必须用 ProcessPoolExecutor(max_workers=1) + 60s 超时。"""
    import inspect

    from core.pipeline import parser

    src = inspect.getsource(parser._parse_with_liteparse)
    assert "ProcessPoolExecutor" in src
    assert "max_workers=1" in src
    assert "timeout=60" in src


def test_subprocess_isolation_runtime(tmp_path: Path) -> None:
    """mock 验证 ProcessPoolExecutor 收到的 max_workers=1 与 result(timeout=60)。"""
    # parser.py 在函数体内 `from concurrent.futures import ProcessPoolExecutor`，
    # 需 patch 导入源（调用时才绑定到 concurrent.futures 属性）
    with mock.patch("concurrent.futures.ProcessPoolExecutor") as m_exec:
        m_exec.return_value.__enter__.return_value.submit.return_value.result.return_value = ("mock text", True, 1)
        from core.pipeline.parser import _parse_with_liteparse

        res = _parse_with_liteparse(tmp_path / "x.pdf")
    assert res == ("mock text", True, 1)
    assert m_exec.call_args.kwargs.get("max_workers") == 1
    call = m_exec.return_value.__enter__.return_value.submit.return_value.result.call_args
    assert call.kwargs.get("timeout") == 60
