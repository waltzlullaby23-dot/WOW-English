from __future__ import annotations
import json,os,re,requests
from common import DATA,load_json,dump_json
CAT=DATA/'catalog.json';OUT=DATA/'learning-units.json'
STOP=set('the a an and or but if then than so of to in on at for from by with as is are was were be been being am do does did have has had can could will would should may might must this that these those it its they them their we our you your i he she his her what which who when where why how very just into about over after before because while during there here'.split())
def fallback(text):
    words=re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?",text.lower());freq={}
    for w in words:
        if w not in STOP and len(w)>4:freq[w]=freq.get(w,0)+1
    vocab=[{'word':w,'definition_zh':'待補','example':''} for w,_ in sorted(freq.items(),key=lambda x:x[1],reverse=True)[:12]]
    ph=[];return {'vocabulary':vocab,'phrases':ph,'grammar':[],'questions':[]}
def ai(video):
    key=os.getenv('OPENAI_API_KEY');
    if not key:return None
    txt=' '.join(s.get('en','') for s in video.get('transcript',[]))[:12000]
    prompt='Return JSON only with vocabulary, phrases, grammar, questions. Make a compact reusable English learning unit. vocabulary items: word, definition_zh, example. phrases: phrase, meaning_zh, example. grammar: topic, explanation_zh, pattern. questions: prompt, options, answer, explanation.\nVIDEO='+json.dumps({'title':video.get('title'),'transcript':txt},ensure_ascii=False)
    try:
        r=requests.post('https://api.openai.com/v1/responses',headers={'Authorization':f'Bearer {key}','Content-Type':'application/json'},json={'model':os.getenv('OPENAI_TEXT_MODEL','gpt-5.6-luna'),'input':prompt},timeout=90);t=r.json().get('output_text','');m=re.search(r'\{.*\}',t,re.S);return json.loads(m.group(0)) if r.ok and m else None
    except Exception:return None
def main():
    cat=load_json(CAT,{'videos':[]});out={}
    for v in cat['videos']:
        if v.get('status')!='accepted':continue
        out[v['id']]=ai(v) or fallback(' '.join(s.get('en','') for s in v.get('transcript',[])))
    dump_json(OUT,{'version':2,'units':out})
if __name__=='__main__':main()
