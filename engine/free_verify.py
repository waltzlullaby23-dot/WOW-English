from __future__ import annotations
import json
from pathlib import Path
CAT=Path(__file__).resolve().parents[1]/'data/catalog.json'

def main():
    data=json.loads(CAT.read_text(encoding='utf-8'))
    bad=0;accepted=0
    for v in data.get('videos',[]):
        seg=v.get('transcript') or []
        ok=v.get('status')=='accepted' and len(seg)>=20 and v.get('captionQuality')=='verified' and float(v.get('captionCoverage') or 0)>=.90 and all(str(s.get('en') or '').strip() for s in seg)
        v['status']='accepted' if ok else 'review'
        if not ok: bad+=1
        else: accepted+=1
    data['verification']={'accepted':accepted,'review':bad}
    CAT.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'FREE_VERIFY accepted={accepted} review={bad}')
if __name__=='__main__':main()
