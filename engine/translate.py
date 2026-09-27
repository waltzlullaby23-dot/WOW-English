from __future__ import annotations
import json, os, re, requests
from datetime import datetime, timezone
from common import DATA, load_json, dump_json
CAT=DATA/'catalog.json'
def call(prompt):
    key=os.getenv('OPENAI_API_KEY');
    if not key:return None
    try:
        r=requests.post('https://api.openai.com/v1/responses',headers={'Authorization':f'Bearer {key}','Content-Type':'application/json'},json={'model':os.getenv('OPENAI_TEXT_MODEL','gpt-5.6-luna'),'input':prompt},timeout=90)
        if not r.ok:return None
        text=r.json().get('output_text','');m=re.search(r'\[.*\]',text,re.S);return json.loads(m.group(0)) if m else None
    except Exception:return None
def translate_segments(segments):
    out=[None]*len(segments);size=20
    for st in range(0,len(segments),size):
        batch=segments[st:st+size];payload=json.dumps([{'i':i,'en':s.get('en','')} for i,s in enumerate(batch,st)],ensure_ascii=False)
        res=call('Return JSON array only. Translate each English subtitle sentence to natural Traditional Chinese. Preserve each i and do not merge or omit sentences.\n'+payload)
        if res:
            for x in res:
                try:
                    i=int(x.get('i',-1));out[i]=x.get('zh','').strip() if 0<=i<len(out) else None
                except Exception:pass
        for i in range(st,min(st+size,len(segments))):
            if out[i]:continue
            res=call('Return JSON array only as [{"i":0,"zh":"..."}]. Translate this sentence to Traditional Chinese with subtitle context.\n'+json.dumps({'prev':segments[i-1].get('en','') if i else '', 'target':segments[i].get('en',''),'next':segments[i+1].get('en','') if i+1<len(segments) else ''},ensure_ascii=False))
            if res and res[0].get('zh'):out[i]=res[0]['zh'].strip()
    return out
def main():
    data=load_json(CAT,{'videos':[]});stats={'full':0,'partial':0,'pending':0,'translated':0,'sentences':0}
    for v in data.get('videos',[]):
        if v.get('status')!='accepted':continue
        seg=v.get('transcript') or [];stats['sentences']+=len(seg)
        if not seg:continue
        tr=translate_segments(seg)
        for i,zh in enumerate(tr):
            if zh:seg[i]['zh']=zh;stats['translated']+=1
        if all(s.get('zh') for s in seg):v['translation']='available';stats['full']+=1
        elif any(s.get('zh') for s in seg):v['translation']='partial';stats['partial']+=1
        else:v['translation']='pending';stats['pending']+=1
    data['generatedAt']=datetime.now(timezone.utc).isoformat();data['translationStats']=stats;dump_json(CAT,data)
if __name__=='__main__':main()
