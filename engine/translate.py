"""Independent subtitle translation layer: batch -> sentence retry -> contextual retry."""
from __future__ import annotations
import json, os, re, requests
from datetime import datetime, timezone
from pathlib import Path

from common import DATA, dump_json, load_json

CAT=DATA/'catalog.json'

def call(prompt: str):
    key=os.getenv('OPENAI_API_KEY')
    if not key:return None
    body={'model':os.getenv('OPENAI_TRANSLATE_MODEL','gpt-5.6-luna'),'input':prompt}
    r=requests.post('https://api.openai.com/v1/responses',headers={'Authorization':f'Bearer {key}','Content-Type':'application/json'},json=body,timeout=90)
    if not r.ok:return None
    t=r.json().get('output_text','');m=re.search(r'\[.*\]',t,re.S)
    if not m:return None
    try:return json.loads(m.group(0))
    except Exception:return None

def translate_segments(segments):
    out=[None]*len(segments); size=int(os.getenv('TRANSLATE_BATCH_SIZE','20'))
    for start in range(0,len(segments),size):
        chunk=segments[start:start+size]
        payload=json.dumps([{'i':i,'en':s.get('en','')} for i,s in enumerate(chunk,start)],ensure_ascii=False)
        res=call('''Translate each English subtitle sentence into natural Traditional Chinese. Preserve the exact i values and return one object for every item. Do not merge items. Return JSON array only.\n'''+payload)
        if res:
            for row in res:
                try:
                    i=int(row.get('i',-1)); zh=row.get('zh')
                    if 0<=i<len(out) and zh: out[i]=zh.strip()
                except Exception: continue
        for i in range(start,min(start+size,len(segments))):
            if out[i]:continue
            one=call('Translate this English subtitle sentence into Traditional Chinese. Return JSON array only: [{"i":0,"zh":"..."}].\n'+json.dumps([{'i':0,'en':segments[i].get('en','')}],ensure_ascii=False))
            if one and one[0].get('zh'):out[i]=one[0]['zh'].strip()
        for i in range(start,min(start+size,len(segments))):
            if out[i]:continue
            prev=segments[i-1].get('en','') if i>0 else ''; nxt=segments[i+1].get('en','') if i+1<len(segments) else ''
            ctx=call('Translate target into Traditional Chinese using subtitle context. Return JSON array only with one object.\n'+json.dumps({'prev':prev,'target':segments[i].get('en',''),'next':nxt},ensure_ascii=False))
            if ctx and ctx[0].get('zh'):out[i]=ctx[0]['zh'].strip()
    return out

def main():
    data=load_json(CAT,{'videos':[]})
    counts={'full':0,'partial':0,'pending':0,'sentences':0,'translated':0}
    for video in data.get('videos',[]):
        if video.get('status')!='accepted':continue
        seg=video.get('transcript') or []
        if not seg:continue
        counts['sentences']+=len(seg)
        if video.get('translation')=='available' and all(s.get('zh') for s in seg):counts['full']+=1;continue
        translated=translate_segments(seg)
        n=0
        for i,zh in enumerate(translated):
            if zh:seg[i]['zh']=zh;n+=1
        counts['translated']+=n
        if n==len(seg):video['translation']='available';counts['full']+=1
        elif n:video['translation']='partial';counts['partial']+=1
        else:video['translation']='pending';counts['pending']+=1
    data['generatedAt']=datetime.now(timezone.utc).isoformat();data['translationPipeline']='batch>sentence retry>contextual fallback';data['translationStats']=counts;dump_json(CAT,data)
    print(json.dumps(counts,ensure_ascii=False))
if __name__=='__main__':main()
