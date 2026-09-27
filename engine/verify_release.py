import json
from pathlib import Path
R=Path(__file__).resolve().parents[1]
def j(p): return json.loads((R/'data'/p).read_text(encoding='utf8'))
def main():
    t=j('taxonomy.json'); l=j('lessons.json'); q=j('toeic.json'); c=j('catalog.json'); w=j('word-bank.json')
    assert len(t['categories'])==13, 'taxonomy categories'
    assert t['totalSubcategories']>=50, 'taxonomy subcategories'
    assert len(l['chapters'])==30, 'grammar chapters'
    assert len(l['microLessons'])==150, 'grammar micro lessons'
    assert all(len(x.get('practice_items',[]))>=2 for x in l['microLessons']), 'grammar practice items'
    assert set(q['bands'])=={'under400','400-600','600-800','800-990'}, 'TOEIC bands'
    for key,b in q['bands'].items():
        assert len(b['questions'])==20, f'TOEIC count {key}'
        assert len({x['prompt'] for x in b['questions']})==20, f'TOEIC duplicates {key}'
        assert all(len(x.get('options',[]))==4 and 0<=x.get('answer',-1)<4 for x in b['questions']), f'TOEIC shape {key}'
    assert len(w['words'])>=15, 'word bank'
    for v in c.get('videos',[]):
        if v.get('status')=='accepted':
            assert v.get('captions')=='available', f"captions {v.get('id')}"
            for s in v.get('transcript',[]): assert s.get('en'), f"empty transcript {v.get('id')}"
            if v.get('translation')=='available':
                assert all(s.get('zh') for s in v.get('transcript',[])), f"translation {v.get('id')}"
    print('verify_release: PASS')
if __name__=='__main__': main()
