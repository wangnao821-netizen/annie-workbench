"""WO-72 邮件时间线物理修改时间回退、模板识别与估价语义提取测试。"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from core.pipeline.msg_timeline import _extract_shortfall_reason, _parse_msg_file


def test_msg_without_date_falls_back_to_mtime(tmp_path: Path):
    """当 msg.date 为 None 时，应提取文件的物理修改时间。"""
    dummy_msg = tmp_path / "Draft_Template.msg"
    dummy_msg.write_text("dummy msg content", encoding="utf-8")
    
    fake_time = datetime(2025, 5, 13, 10, 40, 0, tzinfo=timezone.utc).timestamp()
    os.utime(dummy_msg, (fake_time, fake_time))

    mock_msg_obj = MagicMock()
    mock_msg_obj.date = None
    mock_msg_obj.subject = "Draft Preliminary Assessment"
    mock_msg_obj.body = "Please review"
    mock_msg_obj.sender = None
    mock_msg_obj.__enter__.return_value = mock_msg_obj
    mock_msg_obj.__exit__.return_value = None

    with patch("extract_msg.Message", return_value=mock_msg_obj):
        event = _parse_msg_file(dummy_msg)

    assert event is not None
    assert "2025-05-13" in event["event_time"]


def test_template_path_tagged_in_title(tmp_path: Path):
    """当路径包含 Val Template 或标题包含占位符时，标题应带上 [草稿/模板] 标识。"""
    tpl_dir = tmp_path / "Val Template" / "Brandon"
    tpl_dir.mkdir(parents=True)
    tpl_msg = tpl_dir / "Valuation invoice.msg"
    tpl_msg.write_text("dummy", encoding="utf-8")

    mock_msg_obj = MagicMock()
    mock_msg_obj.date = None
    mock_msg_obj.subject = "Valuation invoice - Clients name - Address"
    mock_msg_obj.body = ""
    mock_msg_obj.sender = None
    mock_msg_obj.__enter__.return_value = mock_msg_obj
    mock_msg_obj.__exit__.return_value = None

    with patch("extract_msg.Message", return_value=mock_msg_obj):
        event = _parse_msg_file(tpl_msg)

    assert event is not None
    assert event["title"].startswith("[草稿/模板]")


def test_valuation_shortfall_reason_accurate_context():
    """验证估价语义提取不会把 unrelated 的 loan balance ($640k) 当成估价期望。"""
    body = (
        "2. Please put $2.4mil as the estimated value for the property on the new Val request.\n"
        "Loan and asset in joint name: 602/34 Rothschild Avenue, Rosebery – remaining balance: $640,000 approx.\n"
        "If the new valuation MV is lower than $2.2mil, we will go with La Trobe."
    )
    reason = _extract_shortfall_reason(body)
    assert "640,000" not in reason, "不应提取无关的房贷余额 $640,000"
    assert "2.2mil" in reason or "2.4mil" in reason
