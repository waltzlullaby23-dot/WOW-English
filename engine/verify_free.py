from __future__ import annotations
import json, re, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'data'
cat=json.loads((DATA/'catalog.json').read_text(encoding='utf-8'))
errors=[]
accepted=[]
for v in cat.get('videos',[]):
    if v.get('status')!='accepted':continue
    accepted.append(v)
    seg=v.get('transcript') or []
    if v.get('captionQuality')!='verified':errors.append(f"{v.get('id')}: captionQuality not verified")
    if not seg or len(seg)<8:errors.append(f"{v.get('id')}: transcript too short")
    if not all(re.search(r'[A-Za-z]',str(s.get('en',''))) for s in seg):errors.append(f"{v.get('id')}: English transcript missing")
    if not all(str(s.get('zh','')).strip() for s in seg):errors.append(f"{v.get('id')}: Chinese translation missing")
    starts=[float(s.get('start',0)) for s in seg]
    if starts!=sorted(starts):errors.append(f"{v.get('id')}: transcript timing not sorted")
if errors:
    print('\n'.join(errors))
    sys.exit(1)
print(f"FREE_RELEASE_OK accepted={len(accepted)}")
