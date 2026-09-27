from __future__ import annotations
import json, os, re, subprocess, tempfile, time
from datetime import datetime, timezone
from pathlib import Path
import requests
from common import DATA,ROOT,load_json,dump_json,clean_text,language_ratios,text_fingerprint,title_fingerprint,lexical_similarity,parse_iso_duration,pretty_duration,cosine
CFG=ROOT/'engine/config.json';CAT=DATA/'catalog.json';TAX=DATA/'taxonomy.json';EMB=DATA/'embedding-index.json'
def yt_search(key,q,page=None):
    p={'key':key,'part':'snippet','q':q,'type':'video','maxResults':50,'safeSearch':'strict','relevanceLanguage':'en','videoCaption':'closedCaption','videoSyndicated':'true','order':'relevance'}
    if page:p['pageToken']=page
    r=requests.get('https://www.googleapis.com/youtube/v3/search',params=p,timeout=30);r.raise_for_status();return r.json()
def yt_details(key,ids):
    out=[]
    for i in range(0,len(ids),50):
        r=requests.get('https://www.googleapis.com/youtube/v3/videos',params={'key':key,'part':'snippet,contentDetails,status','id':','.join(ids[i:i+50])},timeout=30);r.raise_for_status();out.extend(r.json().get('items',[]))
    return out
def queries(tax,maxq,offset):
    arr=[]
    for c in tax['categories']:
        for t in c.get('searchTerms',[]):
            for s in ('{}','{} English','{} documentary','{} interview','{} explained','{} lecture','{} podcast','{} discussion'):
                arr.append(s.format(t))
    arr=list(dict.fromkeys(arr));offset%=len(arr);return (arr[offset:]+arr[:offset])[:maxq]
def fetch_subs(url,td):
    outtmpl=str(Path(td)/'%(id)s.%(ext)s');cmd=['yt-dlp','--skip-download','--no-warnings','--write-subs','--write-auto-subs','--sub-format','vtt','--sub-langs','en,en-US,en-GB','-o',outtmpl,url];p=subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True,timeout=180);return list(Path(td).glob('*.vtt'))
def parse_vtt(path):
    raw=Path(path).read_text(encoding='utf8',errors='ignore').replace('\ufeff','');blocks=re.split(r'\n\s*\n',raw);out=[]
    def ts(x):
        x=x.split()[0];a=x.split(':');
        try:return int(a[0])*3600+int(a[1])*60+float(a[2].replace(',','.')) if len(a)==3 else int(a[0])*60+float(a[1].replace(',','.'))
        except:return 0
    for b in blocks:
        lines=[x.strip() for x in b.split('\n') if x.strip()];tl=next((x for x in lines if '-->' in x),None)
        if not tl:continue
        l,r=[x.strip() for x in tl.split('-->',1)];txt=clean_text(' '.join(x for x in lines if x!=tl and not x.isdigit()));
        if txt:out.append({'start':ts(l),'end':ts(r),'en':txt})
    return out[:1500]
def subtitles(vid):
    with tempfile.TemporaryDirectory() as td:
        files=fetch_subs(f'https://www.youtube.com/watch?v={vid}',td)
        if files:
            files.sort(key=lambda p:('auto' in p.name.lower(),p.name));seg=parse_vtt(files[0]);
            if seg:return seg,'A/B:yt-dlp','en'
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        api=YouTubeTranscriptApi();lst=api.list(vid);arr=sorted(lst,key=lambda t:(not str(getattr(t,'language_code','')).startswith('en'),getattr(t,'is_generated',False)))
        for tr in arr:
            if str(getattr(tr,'language_code','')).startswith('en'):
                rows=tr.fetch();return [{'start':float(x.start),'end':float(x.start+x.duration),'en':clean_text(x.text)} for x in rows if clean_text(x.text)],'C:youtube-transcript-api','en'
    except Exception:pass
    return [],'none','unknown'
def transcribe_audio(url, seconds=45):
    key=os.getenv('OPENAI_API_KEY')
    if not key: return '', 0.0
    model=os.getenv('OPENAI_TRANSCRIBE_MODEL','gpt-4o-mini-transcribe')
    with tempfile.TemporaryDirectory() as td:
        out=str(Path(td)/'%(id)s.%(ext)s')
        try:
            cmd=['yt-dlp','--no-warnings','--extract-audio','--audio-format','mp3','--download-sections',f'*00:00-{int(seconds):02d}','--force-keyframes-at-cuts','-o',out,url]
            proc=subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True,timeout=240)
            files=list(Path(td).glob('*.mp3'))
            if proc.returncode!=0 or not files: return '',0.0
            with open(files[0],'rb') as fh:
                r=requests.post('https://api.openai.com/v1/audio/transcriptions',headers={'Authorization':f'Bearer {key}'},files={'file':(files[0].name,fh,'audio/mpeg')},data={'model':model,'response_format':'json'},timeout=180)
            if not r.ok:return '',0.0
            text=clean_text(r.json().get('text',''))
            ratio=language_ratios(text)['english'] if text else 0.0
            return text, ratio
        except Exception:
            return '',0.0

def ai_profile(title,desc,text,tax):
    key=os.getenv('OPENAI_API_KEY');
    if not key:return None
    prompt='Return JSON only with keys category, subcategory, cefr, tags, grammarTopics. Choose exactly from the supplied taxonomy. Estimate CEFR A1-C2 using vocabulary, syntax, rate/complexity, and abstraction. Do not infer from title alone.\nTAXONOMY='+json.dumps(tax['categories'],ensure_ascii=False)+'\nVIDEO='+json.dumps({'title':title,'description':desc[:2500],'transcript':text[:12000]},ensure_ascii=False)
    try:
        r=requests.post('https://api.openai.com/v1/responses',headers={'Authorization':f'Bearer {key}','Content-Type':'application/json'},json={'model':os.getenv('OPENAI_TEXT_MODEL','gpt-5.6-luna'),'input':prompt},timeout=90);t=r.json().get('output_text','');m=re.search(r'\{.*\}',t,re.S);return json.loads(m.group(0)) if r.ok and m else None
    except Exception:return None
def main():
    cfg=load_json(CFG,{});tax=load_json(TAX,{'categories':[]});data=load_json(CAT,{'videos':[]});existing={v['id']:v for v in data.get('videos',[])};key=os.getenv('YOUTUBE_API_KEY');
    if not key:raise SystemExit('YOUTUBE_API_KEY is required')
    cand={};qs=queries(tax,cfg.get('maxQueriesPerRun',32),int(time.time()//3600));
    for q in qs:
        token=None
        for _ in range(int(cfg.get('searchPages',2))):
            res=yt_search(key,q,token)
            for it in res.get('items',[]):
                vid=it.get('id',{}).get('videoId');
                if vid:cand[vid]=it.get('snippet',{})
            token=res.get('nextPageToken');
            if not token:break
    ids=[x for x in cand if x not in existing][:int(cfg.get('maxCandidates',1000))];details=yt_details(key,ids[:int(cfg.get('maxProcessCandidates',80))]);new=[];review=[]
    for it in details:
        vid=it['id'];sn=it.get('snippet',{});st=it.get('status',{});cd=it.get('contentDetails',{})
        if not st.get('embeddable',True):continue
        segs,source,lang=subtitles(vid)
        if not segs:continue
        subtext=' '.join(s['en'] for s in segs); ratio=language_ratios(subtext); spoken='unknown'; conf=0.0
        spoken_text, spoken_ratio = transcribe_audio(f'https://www.youtube.com/watch?v={vid}', cfg.get('spokenSampleSeconds',45))
        if spoken_text:
            spoken='en' if spoken_ratio>=0.80 else ('mixed' if spoken_ratio>=0.50 else 'non-en')
            conf=min(0.99,0.55 + spoken_ratio*0.44)
        profile=ai_profile(sn.get('title',''),sn.get('description',''),(spoken_text+'\n---SUBTITLES---\n'+subtext).strip(),tax) or {}
        if spoken!='en' or conf<cfg.get('minLanguageConfidence',0.60) or spoken_ratio<cfg.get('acceptEnglishScore',0.80) or language_ratios(subtext)['nonEnglish']>cfg.get('rejectMultilingualScore',0.25):
            review.append({'id':vid,'title':sn.get('title',''),'englishScore':round(spoken_ratio,3),'spokenLanguage':spoken,'confidence':round(conf,3),'captionSource':source,'status':'review'});continue
        p=profile
        cat=next((c['id'] for c in tax['categories'] if c['id']==p.get('category')),'english-learning');subs=next(c['subs'] for c in tax['categories'] if c['id']==cat);sub=p.get('subcategory') if p.get('subcategory') in subs else subs[0];cefr=p.get('cefr') if p.get('cefr') in {'A1','A2','B1','B2','C1','C2'} else 'B1';fp=text_fingerprint(subtext);tf=title_fingerprint(sn.get('title',''));dup=False
        for old in existing.values():
            if old.get('fingerprint')==fp or (old.get('titleFingerprint')==tf and lexical_similarity(old.get('title',''),sn.get('title',''))>.9):dup=True;break
        if dup:continue
        rec={'id':vid,'title':clean_text(sn.get('title','')),'channel':sn.get('channelTitle',''),'duration':pretty_duration(parse_iso_duration(cd.get('duration',''))),'published':sn.get('publishedAt','')[:10],'category':cat,'subcategory':sub,'cefr':cefr,'englishScore':round(ratio['english'],3),'multilingualScore':round(ratio['nonEnglish'],3),'spokenLanguage':'en','captionLanguage':'en','spokenEvidence':{'method':'verified-transcript-gate','confidence':conf},'captionSource':source,'status':'accepted','sourceUrl':f'https://www.youtube.com/watch?v={vid}','captions':'available','translation':'pending','tags':p.get('tags',[])[:8],'fingerprint':fp,'titleFingerprint':tf,'transcript':segs}
        existing[vid]=rec;new.append(rec)
    data['videos']=list(existing.values());data['generatedAt']=datetime.now(timezone.utc).isoformat();data['source']='continuous-youtube-discovery';data['stats']={'accepted':sum(v.get('status')=='accepted' for v in existing.values()),'newAccepted':len(new),'review':len(review),'processed':len(details),'candidates':len(cand),'queries':len(qs)};dump_json(CAT,data);dump_json(DATA/'review.json',{'generatedAt':data['generatedAt'],'videos':review})
if __name__=='__main__':main()
