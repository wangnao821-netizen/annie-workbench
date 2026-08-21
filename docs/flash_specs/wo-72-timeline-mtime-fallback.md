# WO-72 邮件时间线草稿物理时间回退与估价语义提取重构 — 执行规范

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / `pathlib.Path`
- 禁止：引入任何新 pip 依赖
- 禁止：修改本表改动范围以外的任何文件
- 禁止：重构、重命名、移动既有文件/函数
- 禁止：访问真实客户文件夹，测试一律用 `tmp_path` 构造虚拟测试数据

## 背景（为什么要做）

在真实澳洲历史信贷案卷中：
1. **草稿/模板时间戳错乱**：存在未点击过发送的离线草稿或团队模板（`msg.date is None`），此前逻辑由于回退至 `created_at`，导致历史草稿在时间线上被标上**今天的时间戳**；
2. **估价卡点金额张冠李戴**：原 `_extract_shortfall_reason` 算法粗暴抓取全文前 2 个金额拼接，导致将另一套房产的贷款余额（如 `$640k`）误当成 84 Louis St 房产的估价期望值，拼出荒谬的 `"估价过低：$2.4m vs 期望 $640,000"`。

本单目标：
1. 当 `msg.date` 为 `None` 时，**回退提取物理文件真实最后修改时间 `st_mtime`**，呈现其真实历史生成年份（如 2025/2023 年），严禁使用系统入库当前时间冒充事件时间；
2. 识别草稿/模板特征（路径含 `val template/` 或标题含占位符），打上 `[草稿/模板]` 标题前缀；
3. **重构 `_extract_shortfall_reason` 语义提取算法**：基于上下文关键词（`estimated value`, `lower than`, `valuation`, `market value`）精准提取估价与门槛金额，彻底过滤 `loan balance` / `remaining balance` 等无关房贷负债干扰。

## 改动范围（严禁超出）

| 文件 | 操作 | 说明 |
|------|------|------|
| `core/pipeline/msg_timeline.py` | 修改 | `_parse_msg_file` 增加 `st_mtime` 回退与模板标记；重构 `_extract_shortfall_reason` |
| `tests/test_timeline_mtime_fallback.py` | **新建** | 验收测试（覆盖物理时间回退、模板打标、估价语义精准提取） |

⚠️ 严禁修改上表以外的任何文件。

---

## 逐项修复契约

### 修复 1：重构 `_extract_shortfall_reason` 语义提取算法

**文件**: `core/pipeline/msg_timeline.py`，函数 `_extract_shortfall_reason`

**当前代码**（约第 50-56 行）：
```python
def _extract_shortfall_reason(text: str) -> str:
    """估价低卡点原因：优先带出估价金额与期望金额。"""
    amounts = re.findall(r"\$\s*([0-9][0-9,]*\.?[0-9]*\s*[kKmMbB]?)", text)
    if amounts:
        return f"估价过低：${amounts[0].strip()}" + (f" vs 期望 ${amounts[1].strip()}" if len(amounts) >= 2 else "")
    return "银行估价低于预期，形成价值缺口（valuation shortfall）"
```

**替换为**：
```python
def _extract_shortfall_reason(text: str) -> str:
    """估价低卡点原因：精确提取估价与门槛金额，过滤房贷余额等无关干扰。"""
    m_threshold = re.search(
        r"(?:lower than|below|less than|under)\s*\$\s*([0-9][0-9,]*\.?[0-9]*\s*(?:mil|m|k|b)?)",
        text,
        re.IGNORECASE,
    )
    m_est = re.search(
        r"(?:estimated value|expected value|est\.? value|期望(?:估值)?)\s*(?:is|at|for|:)?\s*\$\s*([0-9][0-9,]*\.?[0-9]*\s*(?:mil|m|k|b)?)",
        text,
        re.IGNORECASE,
    )
    m_val = re.search(
        r"(?:valuation|val|mv|market value|估价|评估)\s*(?:is|at|of|came in at|:)?\s*\$\s*([0-9][0-9,]*\.?[0-9]*\s*(?:mil|m|k|b)?)",
        text,
        re.IGNORECASE,
    )

    if m_threshold and m_est:
        return f"估价门槛预期：门槛 ${m_threshold.group(1)} vs 期望 ${m_est.group(1)}"
    if m_threshold:
        return f"估价低于门槛：低于 ${m_threshold.group(1)} 触发转贷方案"
    if m_val and m_est:
        return f"估价过低：实际 ${m_val.group(1)} vs 期望 ${m_est.group(1)}"
    if m_val:
        return f"估价结果：${m_val.group(1)}"
    if m_est:
        return f"估价期望值：${m_est.group(1)}"

    return "银行估价低于预期，形成价值缺口（valuation shortfall）"
```

---

### 修复 2：`_parse_msg_file` 物理时间回退与模板打标

**文件**: `core/pipeline/msg_timeline.py`，函数 `_parse_msg_file`

**当前代码**（约第 125-131 行）：
```python
            event_time = ""
            if msg.date:
                if isinstance(msg.date, datetime):
                    event_time = msg.date.replace(tzinfo=UTC).isoformat() if msg.date.tzinfo is None else msg.date.isoformat()
                else:
                    event_time = str(msg.date)
            text = f"{subject}\n{body}"
```

**替换为**：
```python
            event_time = ""
            if msg.date:
                if isinstance(msg.date, datetime):
                    event_time = msg.date.replace(tzinfo=UTC).isoformat() if msg.date.tzinfo is None else msg.date.isoformat()
                else:
                    event_time = str(msg.date)
            else:
                # 针对从未发送过的草稿/模板文件（msg.date is None），回退使用物理文件最后修改时间
                try:
                    mtime_dt = datetime.fromtimestamp(msg_path.stat().st_mtime, tz=UTC)
                    event_time = mtime_dt.isoformat()
                except Exception:  # noqa: BLE001
                    event_time = ""
            text = f"{subject}\n{body}"
```

并在生成 `title` 处（约第 145 行）：
**当前代码**：
```python
                "title": (subject.strip() or msg_path.stem)[:120],
```

**替换为**：
```python
                "title": (
                    (f"[草稿/模板] {subject.strip()}" if (
                        any(k in str(msg_path).replace("\\", "/").lower() for k in ("/val template/", "/template")) or
                        any(k in subject for k in ("[Client Name]", "First Name FAMILY NAME", "[Lender]"))
                    ) else subject.strip()) or msg_path.stem
                )[:120],
```

---

### 验收测试

**文件**: `tests/test_timeline_mtime_fallback.py`（**新建**）

```python
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
```

---

## 验收命令

```powershell
cd D:\vera-workbench
$env:PYTHONPATH="D:\vera-workbench\electron\release\win-unpacked\resources\runtime\site-packages;D:\vera-workbench\electron\release\win-unpacked\resources\backend;D:\vera-workbench"
& "D:\vera-workbench\electron\release\win-unpacked\resources\runtime\python\python.exe" -m pytest tests/test_timeline_mtime_fallback.py -v
& "D:\vera-workbench\electron\release\win-unpacked\resources\runtime\python\python.exe" -m ruff check core/pipeline/msg_timeline.py
```
