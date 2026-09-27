import json,re
from pathlib import Path
R=Path(__file__).resolve().parents[1]
def j(p):return json.loads((R/'data'/p).read_text(encoding='utf8'))
def main():
 t=j('taxonomy.json');l=j('lessons.json');q=j('toeic.json');c=j('catalog.json');w=j('word-bank.json');assert len(t['categories'])==13;assert t['totalSubcategories']>=50;assert len(l['microLessons'])==150;assert set(q['bands'])=={'under400','400-600','600-800','800-990'};assert all(len(x['questions'])>=20 for x in q['bands'].values());assert len(w['words'])>=15
 for v in c['videos']:
  if v['status']=='accepted':
   assert v['captions']=='available'
   for s in v['transcript']:assert s.get('en')
 print('verify_release: PASS')
if __name__=='__main__':main()
