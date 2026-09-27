from __future__ import annotations
import json, math, os, re, subprocess, tempfile, time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from common import DATA, ROOT, load_json, dump_json, clean_text, language_ratios, text_fingerprint, title_fingerprint, lexical_similarity, parse_iso_duration, pretty_duration
from translation_argos import translate_lines, translate_one

try:
    from yt_dlp import YoutubeDL
except Exception:
    YoutubeDL = None

try:
    from youtube_transcript_api import YouTubeTranscriptApi
except Exception:
    YouTubeTranscriptApi = None

try:
    from opencc import OpenCC
    S2T = OpenCC('s2t')
except Exception:
    S2T = None

try:
    from wordfreq import zipf_frequency
except Exception:
    zipf_frequency = None

CAT = DATA / 'catalog.json'
TAX = DATA / 'taxonomy.json'
CURSOR = DATA / 'discovery-cursor.json'
HEALTH = DATA / 'discovery-health.json'
REVIEW = DATA / 'review.json'

CONFIG = {
    'queriesPerRun': 24,
    'resultsPerQuery': 8,
    'maxCandidates': 140,
    'maxProcess': 36,
    'minSegments': 8,
    'minCoverage': 0.90,
    'minCharsPerMinute': 42,
    'maxCharsPerMinute': 1800,
    'searchRetries': 3,
    'queryCooldown': 0.35,
}

SUB_HINTS = {
    'grammar': '文法', 'pronunciation': '發音', 'pronounce': '發音', 'vocabulary': '字彙', 'word': '字彙',
    'listening': '聽力', 'speaking': '口說', 'reading': '閱讀', 'phrase': '片語', 'business english': '職場英文',
    'history': '世界史', 'ancient': '古文明', 'archaeology': '考古', 'geography': '地理', 'city': '國家城市',
    'christianity': '基督宗教', 'bible': '經典導讀', 'buddhism': '佛教', 'islam': '伊斯蘭教', 'judaism': '猶太教',
    'film': '電影', 'movie': '電影', 'tv': '影集', 'actor': '演員訪談', 'director': '導演', 'screenwriting': '劇本', 'review': '影評',
    'finance': '金融', 'investing': '投資', 'economics': '經濟', 'management': '管理', 'marketing': '行銷', 'startup': '創業', 'workplace': '職場',
    'ai ': 'AI', 'artificial intelligence': 'AI', 'software': '軟體', 'cybersecurity': '資安', 'robotics': '機器人', 'computer': '科學計算', 'technology': '未來科技',
    'medical': '醫學科普', 'health': '健康', 'nutrition': '營養', 'mental health': '心理健康', 'disease': '疾病', 'human body': '人體', 'public health': '公共衛生',
    'travel': '旅遊', 'city guide': '城市', 'nature': '自然景點', 'food': '美食', 'hotel': '飯店', 'airport': '交通', 'lifestyle': '生活風格', 'outdoor': '戶外活動',
    'basketball': '籃球', 'football': '足球', 'baseball': '棒球', 'tennis': '網球', 'fitness': '健身', 'running': '跑步', 'sports science': '運動科學', 'athlete': '運動員訪談',
    'ted': 'TED演講', 'keynote': '公開演說', 'academic lecture': '學術演講', 'business keynote': '企業演講', 'leadership': '領導力', 'communication': '溝通', 'graduation': '畢業演講', 'conference': '會議演講',
    'international news': '國際新聞', 'social issues': '社會', 'climate': '氣候', 'technology news': '科技新聞', 'economic news': '經濟新聞', 'investigative': '調查報導', 'documentary': '紀錄片', 'public issues': '公共議題',
    'anime': '動漫', 'animation': '動畫', 'manga': '漫畫', 'voice acting': '配音', 'kids': '兒童英文', 'pop culture': '流行文化',
    'philosophy': '哲學入門', 'ethics': '倫理學', 'logic': '邏輯', 'existentialism': '存在主義', 'epistemology': '認識論', 'metaphysics': '形上學', 'history of philosophy': '思想史',
}

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def normalize_segments(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out=[]
    for x in rows:
        text=clean_text(getattr(x,'text',None) if not isinstance(x,dict) else x.get('text',''))
        start=float(getattr(x,'start',0) if not isinstance(x,dict) else x.get('start',0) or 0)
        dur=float(getattr(x,'duration',0) if not isinstance(x,dict) else x.get('duration',0) or 0)
        if not text:
            continue
        end=start+max(0.1,dur)
        if out and start < out[-1]['end']:
            start=max(start,out[-1]['start'])
            end=max(end,out[-1]['end'])
        if out and text.lower()==out[-1]['en'].lower():
            continue
        out.append({'start':round(start,3),'end':round(end,3),'en':text})
    return out[:2500]

def parse_vtt(path: Path) -> list[dict[str,Any]]:
    raw=path.read_text(encoding='utf-8',errors='ignore').replace('\ufeff','')
    blocks=re.split(r'\n\s*\n',raw)
    out=[]
    def ts(v):
        v=v.replace(',','.').split()[0]
        p=v.split(':')
        try:
            if len(p)==3:return int(p[0])*3600+int(p[1])*60+float(p[2])
            return int(p[0])*60+float(p[1])
        except:return 0.0
    for block in blocks:
        lines=[x.strip() for x in block.splitlines() if x.strip()]
        cue=next((x for x in lines if '-->' in x),None)
        if not cue:continue
        a,b=[x.strip() for x in cue.split('-->',1)]
        txt=clean_text(' '.join(x for x in lines if x!=cue and not x.isdigit()))
        if txt:out.append({'start':ts(a),'end':ts(b),'en':txt})
    return normalize_segments(out)

def transcript_candidates(video_id: str):
    if YouTubeTranscriptApi is None:
        return []
    api=YouTubeTranscriptApi()
    for attempt in range(3):
        try:
            lst=api.list(video_id)
            arr=[t for t in lst if str(getattr(t,'language_code','') or '').lower().startswith('en')]
            arr.sort(key=lambda t:(bool(getattr(t,'is_generated',False)), str(getattr(t,'language_code',''))))
            return arr
        except Exception:
            time.sleep(1.5*(attempt+1))
    return []

def fetch_english_transcript(video_id: str):
    for tr in transcript_candidates(video_id):
        try:
            rows=normalize_segments(list(tr.fetch()))
            if rows:return tr,rows
        except Exception:
            continue
    return None,[]

def fetch_english_via_timedtext(video_id: str):
    import requests
    urls=[
      f'https://www.youtube.com/api/timedtext?v={video_id}&lang=en&fmt=vtt',
      f'https://www.youtube.com/api/timedtext?v={video_id}&lang=en&kind=asr&fmt=vtt',
      f'https://www.youtube.com/api/timedtext?v={video_id}&lang=en-US&kind=asr&fmt=vtt',
    ]
    for url in urls:
        try:
            r=requests.get(url,timeout=20,headers={'User-Agent':'Mozilla/5.0'})
            if r.ok and 'WEBVTT' in r.text[:100]:
                from tempfile import NamedTemporaryFile
                with NamedTemporaryFile('w+',suffix='.vtt',encoding='utf-8') as f:
                    f.write(r.text);f.flush()
                    rows=parse_vtt(Path(f.name))
                if len(rows)>=CONFIG['minSegments'] and len(' '.join(x['en'] for x in rows))>=180:
                    return Path(f.name),rows
        except Exception:
            pass
    return None,[]

def fetch_english_via_ytdlp(video_url: str):
    client_args=['youtube:player-client=web_embedded,ios','youtube:player-client=ios,web_embedded']
    with tempfile.TemporaryDirectory() as td:
        out=str(Path(td)/'%(id)s.%(language)s.%(ext)s')
        for client in client_args:
            cmd=['yt-dlp','--skip-download','--write-subs','--write-auto-subs','--sub-format','vtt/srt/best','--sub-langs','en.*','-o',out,'--extractor-args',client,video_url]
            try:
                p=subprocess.run(cmd,cwd=ROOT,text=True,capture_output=True,timeout=70)
                files=sorted(Path(td).glob('*.vtt'))+sorted(Path(td).glob('*.srt'))
                usable=[]
                for fp in files:
                    try:
                        rows=parse_vtt(fp)
                        if len(rows)>=CONFIG['minSegments'] and len(' '.join(x['en'] for x in rows))>=180:
                            usable.append((fp,rows))
                    except Exception:
                        pass
                if p.returncode==0 and usable:
                    usable.sort(key=lambda x:len(x[1]),reverse=True)
                    return usable[0]
            except Exception:
                pass
    return None,[]

def translation_codes(tr):
    out=[]
    for x in getattr(tr,'translation_languages',[]) or []:
        code=getattr(x,'language_code',None)
        if not code and isinstance(x,dict):code=x.get('language_code') or x.get('code')
        if code:out.append(str(code))
    return out

def translate_from_youtube(tr, en_segments):
    if tr is None:return None,'none'
    codes=translation_codes(tr)
    preferred=['zh-TW','zh-Hant','zh-Hant-TW','zh']
    target=next((p for p in preferred if p in codes),None)
    if target is None:
        target=next((c for c in codes if c.lower().startswith('zh')),None)
    if not target:return None,'none'
    try:
        zh_rows=normalize_segments(list(tr.translate(target).fetch()))
    except Exception:
        return None,'youtube-translate-failed'
    if not zh_rows:return None,'youtube-translate-empty'
    if len(zh_rows)==len(en_segments):
        zh_text=[x['en'] for x in zh_rows]
    else:
        zh_text=[]
        for en in en_segments:
            best=min(zh_rows,key=lambda z:abs(float(z['start'])-float(en['start']))) if zh_rows else None
            zh_text.append(best['en'] if best and abs(float(best['start'])-float(en['start']))<=2.5 else '')
    if S2T and target.lower() in {'zh-cn','zh-hans','zh','zh-sg'}:
        zh_text=[S2T.convert(x) if x else x for x in zh_text]
    if not all(clean_text(x) for x in zh_text):return None,'youtube-translate-incomplete'
    return zh_text,target

def translate_with_argos(en_segments):
    lines=[s.get('en','') for s in en_segments]
    # Batch paragraphs first; fall back to one-by-one if line alignment changes.
    out=[]
    for i in range(0,len(lines),20):
        chunk=lines[i:i+20]
        got=translate_lines(chunk)
        if got is None or len(got)!=len(chunk):
            got=[translate_one(x) for x in chunk]
        out.extend(got)
    if len(out)!=len(lines) or not all(clean_text(x) for x in out):
        return None,'argos-incomplete'
    return out,'argos-en-zh'


def validate_transcript(segs: list[dict[str,Any]], duration: float):
    if len(segs)<CONFIG['minSegments']:return False,0.0,'too-few-segments'
    last=max((float(x['end']) for x in segs),default=0.0)
    coverage=min(1.0,last/max(duration,1.0)) if duration else 1.0
    words=sum(len(re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?",x['en'])) for x in segs)
    if duration:
        cpm=(words/max(duration/60,0.1))
        if cpm < CONFIG['minCharsPerMinute'] or cpm > CONFIG['maxCharsPerMinute']:
            return False,coverage,'caption-density-outlier'
        gaps=[float(segs[i+1]['start'])-float(segs[i]['end']) for i in range(len(segs)-1)]
        if gaps and max(gaps) > 15 and duration >= 120:
            return False,coverage,'caption-gap-too-large'
    if duration>=120 and coverage < CONFIG['minCoverage']:
        return False,coverage,'coverage-below-threshold'
    if len(' '.join(x['en'] for x in segs))<180:return False,coverage,'too-little-text'
    return True,coverage,'ok'

def infer_language(info, ratio):
    raw=str(info.get('language') or info.get('original_language') or info.get('audio_language') or '').lower()
    if raw.startswith('en'):return 'en','metadata',0.98
    if ratio['english']>=0.92:return 'en','caption',0.92
    if ratio['english']>=0.80:return 'mixed','caption',0.75
    return 'non-en','caption',0.95

def tokens(text):return re.findall(r"[a-z]+(?:'[a-z]+)?",text.lower())

def choose_subcategory(category, query, title, index):
    subs=category.get('subs') or ['其他']
    hay=(query+' '+title).lower()
    for hint,name in SUB_HINTS.items():
        if hint in hay and name in subs:return name
    return subs[index % len(subs)]

def classify(category, query, title, text, index):
    hay=(query+' '+title+' '+text[:3000]).lower()
    # prefer the query's owning category; within a run candidate can only come from that category.
    return choose_subcategory(category,query,title,index)

def cefr_estimate(text):
    ws=tokens(text)
    if not ws:return 'B1',50
    avg_len=sum(len(x) for x in ws)/len(ws)
    ttr=len(set(ws))/len(ws)
    rare_ratio=0.0
    if zipf_frequency:
        rare=sum(1 for w in ws if zipf_frequency(w,'en')<4.2)
        rare_ratio=rare/len(ws)
    else:
        rare_ratio=max(0,min(1,(avg_len-4)/4))
    sentences=max(1,len(re.split(r'[.!?]+',text)))
    avg_sent=len(ws)/sentences
    clauses=len(re.findall(r'\b(because|although|however|which|that|while|whereas|therefore|unless|despite|since)\b',text.lower()))/max(1,sentences)
    score=min(100, max(0, rare_ratio*55 + max(0,avg_len-4)*6 + max(0,avg_sent-10)*1.5 + clauses*6 + max(0,ttr-.38)*12))
    if score<18:level='A1'
    elif score<32:level='A2'
    elif score<48:level='B1'
    elif score<64:level='B2'
    elif score<80:level='C1'
    else:level='C2'
    return level,round(score,1)

def search_queries(tax, offset, count):
    jobs=[]
    for cat in tax.get('categories',[]):
        for si,term in enumerate(cat.get('searchTerms',[]) or []):
            jobs += [
                (f'{term} English',cat,term),
                (f'{term} documentary',cat,term),
                (f'{term} interview English',cat,term),
                (f'{term} lecture English',cat,term),
            ]
    jobs=jobs[offset%len(jobs):]+jobs[:offset%len(jobs)]
    return jobs[:count]

def youtube_api_get(path, params):
    key=os.environ.get('YOUTUBE_API_KEY','').strip()
    if not key:
        return {}
    import requests
    p=dict(params or {})
    p['key']=key
    for attempt in range(3):
        try:
            r=requests.get('https://www.googleapis.com/youtube/v3/'+path,params=p,timeout=20)
            if r.ok:
                return r.json()
        except Exception:
            pass
        time.sleep(1.5*(attempt+1))
    return {}

def ydl_search(query, n):
    # Primary: free YouTube Data API v3. search.list costs quota but does not require
    # yt-dlp to access YouTube search pages, avoiding GitHub-runner bot checks.
    key=os.environ.get('YOUTUBE_API_KEY','').strip()
    if key:
        info=youtube_api_get('search',{'part':'snippet','q':query,'type':'video','maxResults':min(50,int(n)),'relevanceLanguage':'en'})
        out=[]
        for row in info.get('items',[]) or []:
            vid=((row.get('id') or {}).get('videoId'))
            if vid:
                sn=row.get('snippet') or {}
                out.append({'id':vid,'title':sn.get('title',''),'channel':sn.get('channelTitle',''),'description':sn.get('description','')})
        return out
    return []

def ydl_info(video_id):
    key=os.environ.get('YOUTUBE_API_KEY','').strip()
    if key:
        info=youtube_api_get('videos',{'part':'snippet,contentDetails','id':video_id})
        row=(info.get('items') or [None])[0]
        if row:
            sn=row.get('snippet') or {}
            return {
                'id':video_id,
                'title':sn.get('title',''),
                'channel':sn.get('channelTitle',''),
                'uploader':sn.get('channelTitle',''),
                'upload_date':str(sn.get('publishedAt',''))[:10].replace('-',''),
                'duration':parse_iso_duration((row.get('contentDetails') or {}).get('duration','')),
                'language':sn.get('defaultLanguage') or sn.get('defaultAudioLanguage') or ''
            }
    return {}
 
def process_video(video_id, meta, existing, idx=0):
    info=ydl_info(video_id)
    title=clean_text(info.get('title') or meta.get('title') or '')
    if not title:return None,{'id':video_id,'title':'','status':'review','reason':'missing-title'}
    duration=float(info.get('duration') or 0)
    tr,segs=fetch_english_transcript(video_id)
    transcript_source='youtube-transcript-api' if segs else ''
    if not segs:
        _,segs=fetch_english_via_timedtext(video_id)
        transcript_source='timedtext' if segs else ''
        tr=None
    if not segs:
        _,segs=fetch_english_via_ytdlp(f'https://www.youtube.com/watch?v={video_id}')
        transcript_source='yt-dlp' if segs else transcript_source
        tr=None
    if not segs:
        return None,{'id':video_id,'title':title,'status':'review','reason':'no-english-transcript'}
    ratio=language_ratios(' '.join(x['en'] for x in segs))
    spoken,spoken_source,spoken_conf=infer_language(info,ratio)
    valid,coverage,reason=validate_transcript(segs,duration)
    if not valid or spoken!='en' or ratio['nonEnglish']>0.18:
        return None,{'id':video_id,'title':title,'status':'review','reason':reason,'englishScore':round(ratio['english'],3),'coverage':round(coverage,3),'spokenLanguage':spoken}
    zh,zh_source=translate_from_youtube(tr,segs)
    if zh is None:
        zh,zh_source=translate_with_argos(segs)
    if zh is None:
        return None,{'id':video_id,'title':title,'status':'review','reason':zh_source,'coverage':round(coverage,3)}
    transcript=[{'start':s['start'],'end':s['end'],'en':s['en'],'zh':clean_text(z)} for s,z in zip(segs,zh)]
    category=meta['category']
    sub=classify(category,meta.get('query',''),title,' '.join(x['en'] for x in transcript),idx)
    level,score=cefr_estimate(' '.join(x['en'] for x in transcript))
    tf=title_fingerprint(title);fp=text_fingerprint(' '.join(x['en'] for x in transcript))
    for old_id,old in existing.items():
        if old_id==video_id:continue
        if old.get('fingerprint')==fp or (old.get('titleFingerprint')==tf and lexical_similarity(old.get('title',''),title)>.9):
            return None,{'id':video_id,'title':title,'status':'review','reason':'duplicate'}
    title_zh=translate_one(title) or ''
    rec={
      'id':video_id,'title':title,'titleZh':clean_text(title_zh),
      'channel':clean_text(info.get('channel') or info.get('uploader') or ''),
      'duration':pretty_duration(duration),'published':str(info.get('upload_date') or '')[:10],
      'category':category['id'],'subcategory':sub,'cefr':level,'cefrScore':score,
      'englishScore':round(ratio['english'],3),'multilingualScore':round(ratio['nonEnglish'],3),
      'spokenLanguage':'en','spokenEvidence':{'method':spoken_source,'confidence':spoken_conf},
      'captionLanguage':'en','captionQuality':'verified','subtitleCoverage':round(coverage,3),
      'captionSource':transcript_source or ('youtube-transcript-api' if tr else 'yt-dlp'),'translation':'available',
      'translationSource':zh_source,'status':'accepted','sourceUrl':f'https://www.youtube.com/watch?v={video_id}',
      'captions':'available','discoveryQuery':meta.get('query',''),'tags':[],
      'fingerprint':fp,'titleFingerprint':tf,'transcript':transcript,
    }
    return rec,None

def main():
    cfg=load_json(ROOT/'engine/config.json',{})
    for k,v in cfg.items():
        if k in CONFIG:CONFIG[k]=v
    tax=load_json(TAX,{'categories':[]})
    data=load_json(CAT,{'schemaVersion':5,'videos':[]})
    existing={v.get('id'):v for v in data.get('videos',[]) if v.get('id')}

    # Legacy records are repaired in-place. Previously we only marked them review,
    # which made the library permanently stuck at the original seed set.
    repair_candidates=[]
    for vid,v in list(existing.items()):
        seg=v.get('transcript') or []
        if v.get('status')!='accepted' or v.get('captionQuality')!='verified' or len(seg)<CONFIG['minSegments'] or not all(clean_text(x.get('zh','')) for x in seg):
            repair_candidates.append((vid,{
                'query':v.get('discoveryQuery','English learning'),
                'category':next((x for x in tax.get('categories',[]) if x.get('id')==v.get('category')),{'id':v.get('category','english-learning'),'subs':[v.get('subcategory','其他')]}),
                'term':v.get('subcategory',''),
                'title':v.get('title','')
            }))
    repair_candidates=repair_candidates[:min(int(CONFIG['maxProcess']),4)]

    new=[];review=[]
    repaired=0
    for idx,(vid,meta) in enumerate(repair_candidates):
        rec,err=process_video(vid,meta,existing,idx)
        if rec:
            existing[vid]=rec;new.append(rec);repaired+=1
        elif err and err.get('reason')!='duplicate':
            review.append(err)

    cursor=load_json(CURSOR,{'offset':0})
    jobs=search_queries(tax,int(cursor.get('offset',0)),int(CONFIG['queriesPerRun']))
    cand={}
    for q,cat,term in jobs:
        for row in ydl_search(q,int(CONFIG['resultsPerQuery'])):
            vid=row.get('id')
            if vid and vid not in existing:
                cand.setdefault(vid,{'query':q,'category':cat,'term':term,'title':clean_text(row.get('title',''))})
        time.sleep(float(CONFIG['queryCooldown']))
    candidates=list(cand.items())[:int(CONFIG['maxCandidates'])]
    processed=0
    for idx,(vid,meta) in enumerate(candidates[:min(int(CONFIG['maxProcess']),4)]):
        rec,err=process_video(vid,meta,existing,idx)
        processed+=1
        if rec:
            existing[vid]=rec;new.append(rec)
        elif err and err.get('reason')!='duplicate':
            review.append(err)

    cursor['offset']=int(cursor.get('offset',0))+len(jobs)
    dump_json(CURSOR,cursor)
    data['schemaVersion']=5
    data['generatedAt']=now_iso()
    data['source']='continuous-free-youtube-discovery'
    data['videos']=list(existing.values())
    accepted=[v for v in data['videos'] if v.get('status')=='accepted' and v.get('captionQuality')=='verified' and v.get('translation')=='available' and all(clean_text(x.get('zh','')) for x in v.get('transcript',[]))]
    data['stats']={'accepted':len(accepted),'totalRecords':len(data['videos']),'newAccepted':len(new),'repaired':repaired,'processed':processed,'repairCandidates':len(repair_candidates),'candidates':len(cand),'queries':len(jobs),'lastRun':now_iso()}
    dump_json(CAT,data)
    health=load_json(HEALTH,{'consecutiveZeroRuns':0,'totalNewAccepted':0})
    if new:health['consecutiveZeroRuns']=0
    else:health['consecutiveZeroRuns']=int(health.get('consecutiveZeroRuns',0))+1
    health['totalNewAccepted']=int(health.get('totalNewAccepted',0))+len(new)
    health['lastRun']=now_iso();health['lastNewAccepted']=len(new);health['lastRepaired']=repaired
    dump_json(HEALTH,health)
    dump_json(REVIEW,{'generatedAt':now_iso(),'videos':review,'count':len(review)})
    print(json.dumps({'accepted':len(accepted),'newAccepted':len(new),'repaired':repaired,'review':len(review),'candidates':len(cand),'queries':len(jobs)},ensure_ascii=False))

if __name__=='__main__':
    main()

