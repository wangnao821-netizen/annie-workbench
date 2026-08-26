"""tests/test_core/test_topology.py — 测试 WO-87 拓扑扫描与多 Broker 穿透识别。"""

import tempfile
from pathlib import Path

from core.case_folder.topology import (
    _clean_broker_name,
    _is_broker_folder,
    _is_case_dir,
    _parse_client_folder_name,
    scan_customer_topology,
)


def test_parse_client_folder_name():
    # 1. 序号脱壳 + 联名借款人
    res1 = _parse_client_folder_name("1. Indrit & Lin CUI")
    assert res1["client_name"] == "Indrit"
    assert res1["co_borrowers"] == ["Lin CUI"]

    # 2. 序号脱壳 + 推荐人
    res2 = _parse_client_folder_name("17. AHMMAD SHARIF SHARIF - Asik 推荐")
    assert res2["client_name"] == "AHMMAD SHARIF SHARIF"
    assert res2["referrer_name"] == "Asik"

    # 3. 纯姓名
    res3 = _parse_client_folder_name("Amanda Lee WATERS")
    assert res3["client_name"] == "Amanda Lee WATERS"


def test_is_broker_folder():
    assert _is_broker_folder("0. Lily S - Clients") is True
    assert _is_broker_folder("Boning He (Brandon) Client") is True
    assert _is_broker_folder("Weirui WEI (Clare) Client") is True
    assert _is_broker_folder("1. Indrit & Lin CUI") is False
    assert _is_broker_folder("Process and Template") is False

    assert _clean_broker_name("0. Lily S - Clients") == "Lily S"
    assert _clean_broker_name("Boning He (Brandon) Client") == "Boning He (Brandon)"


def test_is_case_dir():
    assert _is_case_dir("1. Purchase - CBA - 12 Smith St") is True
    assert _is_case_dir("2. Refinance - Westpac") is True
    assert _is_case_dir("Send to Lender") is True
    # 纯客户文件夹带序号绝不能被误判为 case_dir
    assert _is_case_dir("1. Indrit & Lin CUI") is False
    assert _is_case_dir("2. Mei") is False
    assert _is_case_dir("3. DAS SUSHIL KUMAR") is False


def test_scan_customer_topology_with_mixed_broker_and_clients():
    with tempfile.TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)

        # 1. Broker 目录及其名下的客户
        lily_dir = root / "0. Lily S - Clients"
        lily_dir.mkdir()
        lily_client1 = lily_dir / "1. Client A"
        lily_client1.mkdir()
        (lily_client1 / "1. Purchase - CBA - 10 Main St").mkdir()
        (lily_client1 / "2. Refi - Westpac").mkdir()

        # 2. 直接客户目录
        indrit_dir = root / "1. Indrit & Lin CUI"
        indrit_dir.mkdir()
        (indrit_dir / "1. Purchase - CBA - 20 High St").mkdir()

        mei_dir = root / "2. Mei"
        mei_dir.mkdir()
        (mei_dir / "Send to Lender").mkdir()
        (mei_dir / "ID.pdf").touch()

        # 3. 忽略的运营模板目录
        (root / "Process and Template").mkdir()
        (root / "Signature").mkdir()

        # 执行扫描
        res = scan_customer_topology(str(root))
        assert res["ok"] is True
        assert res["is_root_multi_client"] is True
        assert res["summary"]["total_clients"] == 3  # Lily名下1个 + 直接客户2个

        client_names = [c["client_name"] for c in res["clients"]]
        assert "Client A" in client_names
        assert "Indrit" in client_names
        assert "Mei" in client_names

        # 检查 Lily 名下案卷的 broker_name
        lily_client_meta = next(c for c in res["clients"] if c["client_name"] == "Client A")
        assert lily_client_meta["broker_name"] == "Lily S"
        assert len(lily_client_meta["cases"]) == 2
        assert lily_client_meta["cases"][0]["broker_name"] == "Lily S"
