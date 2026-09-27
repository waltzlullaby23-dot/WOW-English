from __future__ import annotations
import hashlib,json,re,time
from pathlib import Path
from datetime import datetime,timezone
from yt_dlp import YoutubeDL
ROOT=Path(__file__).resolve().parents[1]
CAT=ROOT/'data/catalog.json';TAX=ROOT/'data/taxonomy.json'
STOP=set('the and of to in a is for on with that this from are as be by an or it at into about how what which who when where why can do does did have has had not your you our they their them we i he she his her will would could should may might must'.split())

def clean(s):return re.sub(r'\s+',' ',str(s or '')).strip()
def toks(s):return [w for w in re.findall(r'[a-z]+(?:\'[a-z]+)?',str(s or '').lower()) if w not in STOP and len(w)>2]
def ratios(s):
    s=clean(s);latin=len(re.findall(r'[A-Za-zÀ-ÿ]',s));cjk=len(re.findall(r'[\u3400-\u9fff]',s));kana=len(re.findall(r'[\u3040-\u30ff]',s));hangul=len(re.findall(r'[\uac00-\ud7af]',s));total=max(1,latin+cjk+kana+hangul);return latin/total,(cjk+kana+hangul)/total

def classify(text,tax):
    words=set(toks(text));best=('english-learning','文法',-1)
    for c in tax['categories']:
        cwords=set(toks(c['name']+' '+' '.join(c.get('searchTerms',[]))))
        cscore=len(words & cwords)/max(1,len(cwords))
        for sub in c.get('subs',[]):
            sw=set(toks(sub));score=cscore+1.5*len(words&sw)/max(1,len(sw))
            if score>best[2]:best=(c['id'],sub,score)
    return best[:2]

def cefr(text):
    ws=toks(text); wc=max(1,len(ws)); avg=sum(map(len,ws))/wc
    sent=[x for x in re.split(r'[.!?]+',text) if x.strip()]; avg_sent=wc/max(1,len(sent))
    if avg<4.2 and avg_sent<11:return 'A2'
    if avg<4.7 and avg_sent<16:return 'B1'
    if avg<5.2 and avg_sent<21:return 'B2'
    if avg<5.8 and avg_sent<28:return 'C1'
    return 'C2'

def fingerprint(text):
    z=' '.join(toks(text));return hashlib.sha256(z.encode()).hexdigest()

def search(q,n=8):
    with YoutubeDL({'quiet':True,'no_warnings':True,'skip_download':True,'extract_flat':True}) as y:
        r=y.extract_info('ytsearch%d:%s'%(n,q),download=False)
    return r.get('entries',[]) if r else []

def details(url):
    with YoutubeDL({'quiet':True,'no_warnings':True,'skip_download':True}) as y:return y.extract_info(url,download=False)

def transcript(video_id):
    from youtube_transcript_api import YouTubeTranscriptApi
    api=YouTubeTranscriptApi(); items=api.list(video_id)
    candidates=[]
    for tr in items:
        code=str(getattr(tr,'language_code','') or '')
        if not code.startswith('en'):continue
        try:
            rows=tr.fetch(); seg=[{'start':float(x.start),'end':float(x.start+x.duration),'en':clean(x.text)} for x in rows if clean(x.text)]
            if len(seg)>=20:candidates.append((tr,seg))
        except Exception:pass
    return max(candidates,key=lambda x:len(x[1])) if candidates else (None,[])

def main():
    data=json.loads(CAT.read_text(encoding='utf-8'));tax=json.loads(TAX.read_text(encoding='utf-8'))
    existing={v.get('id') for v in data.get('videos',[])};allq=[]
    for c in tax['categories']:
        allq.extend(c.get('searchTerms',[])[:2])
    slot=int(time.time()//86400)%len(allq);qs=(allq[slot:]+allq[:slot])[:16]
    candidates={}
    for q in qs:
        try:
            for e in search(q,8):
                vid=e.get('id') if isinstance(e,dict) else None
                if vid and vid not in existing:candidates[vid]=e.get('url') or f'https://www.youtube.com/watch?v={vid}'
        except Exception as e: print('SEARCH_SKIP',q,type(e).__name__)
    accepted=[];processed=0
    for vid,url in list(candidates.items())[:60]:
        try:
            info=details(url);processed+=1
            if not info.get('duration') or info.get('is_live'):continue
            tr,seg=transcript(vid)
            if len(seg)<20:continue
            coverage=float(seg[-1]['end'])/max(1,float(info.get('duration') or 1))
            if coverage<0.90:continue
            text=' '.join(s['en'] for s in seg)
            es,nes=ratios(text)
            if es<0.88 or nes>0.20:continue
            cat,sub=classify((info.get('title','')+' '+info.get('description','')+' '+text[:5000]),tax)
            rec={'id':vid,'title':clean(info.get('title')),'channel':clean(info.get('channel')),'duration':time.strftime('%H:%M:%S',time.gmtime(int(info.get('duration') or 0))) if int(info.get('duration') or 0)>=3600 else time.strftime('%M:%S',time.gmtime(int(info.get('duration') or 0))),'published':str(info.get('upload_date') or ''),'category':cat,'subcategory':sub,'cefr':cefr(text),'englishScore':round(es,3),'multilingualScore':round(nes,3),'spokenLanguage':'en','captionLanguage':'en','captionQuality':'verified','captionCoverage':round(coverage,3),'captions':'available','translation':'pending','status':'accepted','sourceUrl':url,'tags':[],'transcript':seg,'fingerprint':fingerprint(text)}
            if rec['fingerprint'] in {v.get('fingerprint') for v in data.get('videos',[])}:continue
            data['videos'].append(rec);accepted.append(vid)
        except Exception as e:print('PROCESS_SKIP',vid,type(e).__name__)
    data['generatedAt']=datetime.now(timezone.utc).isoformat();data['source']='free-yt-dlp-transcript-discovery';data['stats']={'accepted':sum(v.get('status')=='accepted' for v in data.get('videos',[])),'newAccepted':len(accepted),'processed':processed,'candidates':len(candidates),'queries':len(qs),'review':0}
    CAT.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(data['stats'],ensure_ascii=False))
if __name__=='__main__':main()
