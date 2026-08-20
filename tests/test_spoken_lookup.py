import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from core.checklist.spoken_aliases import resolve_spoken_query
from core.case_folder.lookup import lookup_files
from server.main import app
from core.models.orm import Case
from core.models.db import get_sa_session

db = next(get_sa_session())
case = db.query(Case).filter(Case.id == 'CASE-7D6B154B').first()

print('=== 1. 口语短语映射测试 ===')
test_phrases = [
    '文件夹里查一下她的现有贷款对账单',
    '查下她的供楼单',
    '看下出粮单',
    '查一下房子估值',
    '找一下地税单',
    '查一下会计信',
    '看看买卖合同',
]

for p in test_phrases:
    res = resolve_spoken_query(p)
    print(f'Query: "{p}"')
    print(f'  -> Master Key: {res["matched_master_key"]}')
    print(f'  -> Target Keywords ({len(res["target_keywords"])}): {res["target_keywords"][:5]}')
    if case:
        found = lookup_files(case, p)
        print(f'  -> 实测命中案卷真实文件数: {len(found)}')
        if found:
            print(f'     首个命中文件: {found[0]["rel_path"]}')
    print('-'*60)

db.close()
