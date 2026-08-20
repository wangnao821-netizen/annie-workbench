from pathlib import Path

from core.case_folder.lookup import lookup_files
from core.checklist.spoken_aliases import resolve_spoken_query
from core.models.db import get_sa_session
from core.models.orm import Case


def test_spoken_aliases_resolution():
    res = resolve_spoken_query("对账单")
    assert res["matched_master_key"] == "existing_loan_statement"
    assert len(res["target_keywords"]) >= 5
    assert "liability" in [k.lower() for k in res["target_keywords"]]

    res_stream = resolve_spoken_query("流水")
    assert res_stream["matched_master_key"] == "personal_bank_statement"


def test_msg_filtering_and_short_word_lookup(tmp_path):
    # 创建临时测试文件夹结构（绝不读写真实客户文件夹）
    pdf_file = tmp_path / "Liability HL CBA.pdf"
    pdf_file.write_bytes(b"%PDF-1.4 dummy")
    msg_file = tmp_path / "Signing Notice.msg"
    msg_file.write_bytes(b"dummy email content")

    fake_case = Case(
        id="CASE-TEMP-TEST",
        client_name="Test User",
        folder_path=str(tmp_path),
    )

    # 1. 纯短词 "对账单" 检索
    hits = lookup_files(fake_case, "对账单")
    hit_names = [Path(h["rel_path"]).name for h in hits]

    # 2. 断言命中 PDF，并且绝对过滤掉 .msg 邮件
    assert "Liability HL CBA.pdf" in hit_names
    assert "Signing Notice.msg" not in hit_names


if __name__ == "__main__":
    db = next(get_sa_session())
    case = db.query(Case).first()

    print("=== 1. 口语短语映射测试 ===")
    test_phrases = [
        "文件夹里查一下她的现有贷款对账单",
        "查下她的供楼单",
        "看下出粮单",
        "查一下房子估值",
        "找一下地税单",
        "查一下会计信",
        "对账单",
    ]

    for p in test_phrases:
        res = resolve_spoken_query(p)
        print(f'Query: "{p}"')
        print(f'  -> Master Key: {res["matched_master_key"]}')
        print(f'  -> Target Keywords ({len(res["target_keywords"])}): {res["target_keywords"][:5]}')
        if case:
            found = lookup_files(case, p)
            print(f'  -> 案卷命中文件数: {len(found)}')
            if found:
                print(f'     首个命中文件: {found[0]["rel_path"]}')
        print("-" * 60)

    db.close()
