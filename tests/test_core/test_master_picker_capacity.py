"""WO-75c master_picker 容量策略专项测试。

验证「用户自定义总项库项（is_custom=True）永不被主库扩容截断」：
规则路径与 AI 失败回退路径行为一致。
"""

from __future__ import annotations

import core.checklist.master_picker as mp


def _synthetic_master(n_master: int = 30, n_custom: int = 3) -> list[dict]:
    items = [
        {
            "id": f"master_{i}",
            "name_zh": f"主库项 {i}",
            "category": "special",
            "applicable_when": {"all": True},
        }
        for i in range(n_master)
    ]
    items += [
        {
            "id": f"custom_{i}",
            "name_zh": f"自定义项 {i}",
            "category": "special",
            "applicable_when": {"all": True},
            "is_custom": True,
        }
        for i in range(n_custom)
    ]
    return items


def _case_info() -> dict:
    return {
        "lender": "CBA",
        "employment_type": "PAYG",
        "residency": "PR",
        "purpose": "Purchase",
    }


def test_custom_preserved_over_cap(monkeypatch):
    """25+ 主库命中项 + 自定义项 → 自定义项全部保留，总数 > cap。"""
    monkeypatch.setattr(mp, "_load_master", lambda db=None: _synthetic_master(30, 3))
    result = mp.pick_checklist(_case_info(), db=None, use_ai=False)
    ids = {r["id"] for r in result}
    assert {"custom_0", "custom_1", "custom_2"} <= ids
    assert len(result) > mp._SIZE_MAX


def test_custom_not_duplicated(monkeypatch):
    """自定义项只出现一次（截断补回不重复）。"""
    monkeypatch.setattr(mp, "_load_master", lambda db=None: _synthetic_master(30, 3))
    result = mp.pick_checklist(_case_info(), db=None, use_ai=False)
    ids = [r["id"] for r in result]
    assert len(ids) == len(set(ids))


def test_no_custom_truncation_normal(monkeypatch):
    """无自定义项时与旧版一致：严格取前 _SIZE_MAX。"""
    monkeypatch.setattr(mp, "_load_master", lambda db=None: _synthetic_master(30, 0))
    result = mp.pick_checklist(_case_info(), db=None, use_ai=False)
    assert len(result) == mp._SIZE_MAX
    assert [r["id"] for r in result] == [f"master_{i}" for i in range(mp._SIZE_MAX)]


def test_ai_fallback_preserves_custom(monkeypatch):
    """AI 失败回退路径同样保留自定义项。"""
    monkeypatch.setattr(mp, "_load_master", lambda db=None: _synthetic_master(30, 3))

    def _boom(*args, **kwargs):
        raise ValueError("AI down")

    monkeypatch.setattr(mp, "_ai_order", _boom)
    result = mp.pick_checklist(_case_info(), db=None, use_ai=True)
    ids = {r["id"] for r in result}
    assert {"custom_0", "custom_1", "custom_2"} <= ids
