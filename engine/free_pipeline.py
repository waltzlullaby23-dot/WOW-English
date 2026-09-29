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
    'resultsPerQuery': 12,
    'maxCandidates': 200,
    'maxProcess': 25,
    'minSegments': 8,
    'minCoverage': 0.90,
    'minCharsPerMinute': 42,
    'maxCharsPerMinute': 1800,
    'searchRetries': 3,
    'queryCooldown': 0.15,
    'dailyTarget': 100,
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
        text=clean_text(
            getattr(x,'text',None)
            if not isinstance(x,dict)
            else (x.get('text') or x.get('en') or x.get('caption') or x.get('utf8',''))
        )
        start=float(getattr(x,'start',0) if not isinstance(x,dict) else x.get('start',0) or 0)
        dur=float(
            getattr(x,'duration',0)
            if not isinstance(x,dict)
            else (x.get('duration') or max(0.1,float(x.get('end',0) or 0)-start))
        )
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

def parse_public_transcript_text(text: str):
    rows=[]
    pat=re.compile(r'^\s*\[?(?P<t>(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\]?\s*[-–—:]?\s*(?P<txt>.+?)\s*$')
    for line in str(text or '').splitlines():
        m=pat.match(line)
        if not m: continue
        ts=m.group('t').replace(',','.')
        parts=ts.split(':')
        try:
            sec=(int(parts[0])*3600+int(parts[1])*60+float(parts[2])) if len(parts)==3 else (int(parts[0])*60+float(parts[1]))
            txt=clean_text(m.group('txt'))
            if txt: rows.append({'start':sec,'end':sec+4,'en':txt})
        except Exception:
            continue
    out=[]
    for i,row in enumerate(rows):
        if out and row['en'].lower()==out[-1]['en'].lower() and abs(row['start']-out[-1]['start'])<0.5: continue
        row=dict(row)
        row['end']=rows[i+1]['start'] if i+1<len(rows) and rows[i+1]['start']>row['start'] else row['start']+4
        out.append(row)
    return out

def fetch_english_via_public_transcript(video_id: str):
    # Free public transcript mirrors are a last-resort caption source. They
    # preserve timestamps from YouTube's public captions and avoid local AI.
    import requests
    from bs4 import BeautifulSoup
    def parse_timestamped_html(html):
        text=BeautifulSoup(html,'html.parser').get_text('\n')
        rows=[]
        # youtube2text renders transcript entries like: "1. 0:05 text"
        pat=re.compile(r'^\s*\d+\.\s*(?P<t>(?:\d+:)?\d{1,2}:\d{2})\s+(?P<txt>.+?)\s*$')
        for line in text.splitlines():
            m=pat.match(clean_text(line))
            if not m:continue
            parts=m.group('t').split(':')
            try:
                sec=(int(parts[0])*60+int(parts[1])) if len(parts)==2 else (int(parts[0])*3600+int(parts[1])*60+int(parts[2]))
            except Exception:continue
            txt=clean_text(m.group('txt'))
            if txt:rows.append({'start':sec,'end':sec+4,'en':txt})
        out=[]
        for i,row in enumerate(rows):
            if out and row['en'].lower()==out[-1]['en'].lower() and abs(row['start']-out[-1]['start'])<0.5:continue
            row=dict(row)
            row['end']=rows[i+1]['start'] if i+1<len(rows) and rows[i+1]['start']>row['start'] else row['start']+4
            out.append(row)
        return out
    urls=[
        f'https://youtube2text.diguardia.org/v/{video_id}',
        f'https://youtubetotranscript.com/transcript?current_language_code=en&v={video_id}',
        f'https://youtube-transcript.ai/transcript/{video_id}.txt?lang=en',
    ]
    for url in urls:
        try:
            r=requests.get(url,timeout=25,headers={'User-Agent':'Mozilla/5.0'})
            if not r.ok:continue
            rows=parse_timestamped_html(r.text) if 'youtube2text' in url else parse_public_transcript_text(r.text)
            if len(rows)>=CONFIG['minSegments'] and len(' '.join(x['en'] for x in rows))>=180:
                return rows
        except Exception:
            continue
    return []


def transcript_candidates(video_id: str):
    if YouTubeTranscriptApi is None:return []
    api=YouTubeTranscriptApi()
    try:
        lst=api.list(video_id)
        arr=[t for t in lst if str(getattr(t,'language_code','') or '').lower().startswith('en')]
        arr.sort(key=lambda t:(bool(getattr(t,'is_generated',False)),str(getattr(t,'language_code',''))))
        return arr[:2]
    except Exception:
        return []

def fetch_english_transcript(video_id: str):
    for tr in transcript_candidates(video_id):
        try:
            rows=normalize_segments(list(tr.fetch()))
            if rows:return tr,rows
        except Exception:
            continue
    return None,[]

def _download_caption_url(url: str):
    try:
        import requests, json as _json, html as _html, xml.etree.ElementTree as ET
        r=requests.get(url,timeout=25,headers={'User-Agent':'Mozilla/5.0'})
        if not r.ok:return []
        body=r.text or ''
        head=body.lstrip()[:120].lower()
        if 'webvtt' in head:
            from tempfile import NamedTemporaryFile
            with NamedTemporaryFile('w+',suffix='.vtt',encoding='utf-8') as f:
                f.write(body);f.flush()
                return parse_vtt(Path(f.name))
        if head.startswith('<') and ('<text' in body or '<tt' in body):
            root=ET.fromstring(body)
            rows=[]
            for node in root.iter():
                tag=str(node.tag).lower().split('}')[-1]
                if tag!='text':continue
                start=float(node.attrib.get('start','0') or 0)
                dur=float(node.attrib.get('dur','4') or 4)
                txt=_html.unescape(''.join(node.itertext())).strip()
                txt=clean_text(re.sub(r'<[^>]+>',' ',txt))
                if txt:rows.append({'start':start,'end':start+max(.1,dur),'en':txt})
            return normalize_segments(rows)
        if head.startswith('{') or head.startswith('['):
            data=_json.loads(body)
            events=data.get('events',[]) if isinstance(data,dict) else data
            rows=[]
            for ev in events or []:
                if not isinstance(ev,dict):continue
                txt=''.join(str(seg.get('utf8','')) for seg in (ev.get('segs') or []) if isinstance(seg,dict))
                if not txt:continue
                start=float(ev.get('tStartMs',0) or 0)/1000.0
                dur=float(ev.get('dDurationMs',4000) or 4000)/1000.0
                rows.append({'start':start,'end':start+max(.1,dur),'en':clean_text(txt)})
            return normalize_segments(rows)
    except Exception:
        pass
    return []

def _download_vtt_url(url: str):
    return _download_caption_url(url)

def fetch_caption_tracks_from_player(video_id: str):
    # Read YouTube's own caption-track URLs from yt-dlp's player metadata.
    # This is more reliable than guessing timedtext URLs and lets us request
    # YouTube's native translation layer with tlang=zh-TW.
    try:
        import yt_dlp
        url=f'https://www.youtube.com/watch?v={video_id}'
        opts={'quiet':True,'no_warnings':True,'skip_download':True,'noplaylist':True,
              'socket_timeout':12,'retries':1,'fragment_retries':1,'extractor_retries':1}
        with yt_dlp.YoutubeDL(opts) as ydl:
            info=ydl.extract_info(url,download=False)
        tracks=info.get('subtitles') or {}
        auto=info.get('automatic_captions') or {}
        pool=[]
        for source_name,source in (('manual',tracks),('auto',auto)):
            for lang,entries in source.items():
                ll=str(lang).lower()
                if not ll.startswith('en'): continue
                for e in entries or []:
                    u=e.get('url')
                    if u:
                        pool.append((len(str(u)),source_name,lang,u,e.get('ext','')))
        # Prefer auto English, then manual English; prefer en-US/en and VTT.
        pool.sort(key=lambda x:(0 if x[1]=='auto' else 1,
                                0 if str(x[2]).lower() in {'en-us','en'} else 1,
                                0 if str(x[4]).lower()=='vtt' else 1,
                                x[0]))
        for _,source_name,lang,u,_ext in pool:
            en_rows=_download_vtt_url(u)
            if len(en_rows)<CONFIG['minSegments'] or len(' '.join(x['en'] for x in en_rows))<180: continue
            zh_rows=[]
            sep='&' if '?' in u else '?'
            for tlang in ('zh-TW','zh-Hant','zh-Hans','zh'):
                zh_rows=_download_vtt_url(u+sep+'tlang='+tlang)
                if len(zh_rows)>=max(CONFIG['minSegments'],int(len(en_rows)*0.6)):
                    break
            return en_rows,zh_rows,source_name,lang
    except Exception:
        pass
    return [],[],'',''


def fetch_timedtext(video_id: str, lang='en', kind=None, tlang=None):
    # Direct YouTube caption endpoint. This avoids yt-dlp's runner/IP bot gate
    # while still using YouTube's own caption track and translation layer.
    import requests
    params={'v':video_id,'lang':lang,'fmt':'vtt'}
    if kind: params['kind']=kind
    if tlang: params['tlang']=tlang
    try:
        r=requests.get('https://www.youtube.com/api/timedtext',params=params,timeout=12,headers={'User-Agent':'Mozilla/5.0'})
        if not r.ok or not r.text.strip(): return []
        from tempfile import NamedTemporaryFile
        with NamedTemporaryFile('w+',suffix='.vtt',encoding='utf-8') as f:
            f.write(r.text);f.flush()
            return parse_vtt(Path(f.name))
    except Exception:
        return []

def fetch_english_via_timedtext(video_id: str):
    # Use only YouTube's canonical English track ids first. Avoid a matrix of
    # language/kind requests that made each candidate unnecessarily slow.
    for kind in (None,'asr'):
        rows=fetch_timedtext(video_id,'en',kind)
        if rows and len(' '.join(x['en'] for x in rows))>=180:
            return True,rows,'en',kind
    return False,[],None,None
def fetch_youtube_timedtext_translation(video_id: str, en_segments):
    # Ask YouTube's own timedtext service for its player translation.
    for tlang in ('zh-TW','zh-Hant','zh-Hans','zh'):
        for kind in (None,'asr'):
            rows=fetch_timedtext(video_id,'en',kind,tlang)
            if not rows: continue
            out=[]
            for en in en_segments:
                best=min(rows,key=lambda z:abs(float(z['start'])-float(en['start']))) if rows else None
                out.append(best['en'] if best and abs(float(best['start'])-float(en['start']))<=3.5 else '')
            if all(clean_text(x) for x in out):
                return out,tlang
    return None,'youtube-timedtext-translation-failed'

def align_translation_segments(en_rows, zh_rows):
    if not en_rows or not zh_rows: return None
    out=[]
    for en in en_rows:
        best=min(zh_rows,key=lambda z:abs(float(z.get('start',0))-float(en.get('start',0))))
        if abs(float(best.get('start',0))-float(en.get('start',0)))<=3.5:
            out.append(clean_text(best.get('en','')))
        else:
            out.append('')
    if not all(out): return None
    return out

def fetch_subtitle_bundle_via_ytdlp(video_url: str):
    # Fast YouTube-native caption fallback. Keep this bounded because this function
    # is used inside the daily 100-video pipeline.
    client_args=['youtube:player_client=web_embedded,web']
    with tempfile.TemporaryDirectory() as td:
        out=str(Path(td)/'%(id)s.%(language)s.%(ext)s')
        for client in client_args:
            cmd=['yt-dlp','--skip-download','--write-subs','--write-auto-subs',
                 '--sub-format','vtt','--sub-langs','en.*,zh.*',
                 '--extractor-args',client,'--no-warnings','-o',out,video_url]
            try:
                subprocess.run(cmd,cwd=ROOT,text=True,capture_output=True,timeout=25,check=False)
            except Exception:
                continue
            files=sorted(Path(td).glob('*.vtt'))+sorted(Path(td).glob('*.srt'))
            en_options=[];zh_options=[]
            for fp in files:
                try:
                    rows=parse_vtt(fp)
                    if len(rows)<CONFIG['minSegments'] or len(' '.join(x['en'] for x in rows))<180:continue
                    parts=fp.name.split('.');lang=parts[-2] if len(parts)>=3 else ''
                    if str(lang).lower().startswith('en'):en_options.append((fp,rows,lang))
                    elif str(lang).lower().startswith('zh'):zh_options.append((fp,rows,lang))
                except Exception:continue
            if en_options:
                en_options.sort(key=lambda x:len(x[1]),reverse=True)
                en_rows=en_options[0][1];zh_rows=[]
                if zh_options:
                    zh_options.sort(key=lambda x:(0 if str(x[2]).lower() in {'zh-tw','zh-hant','zh-hant-tw'} else 1,-len(x[1])))
                    zh_rows=zh_options[0][1]
                return en_rows,zh_rows
    return [],[]
def fetch_english_via_ytdlp(video_url: str):
    en,_,=fetch_subtitle_bundle_via_ytdlp(video_url)
    return (True if en else None),en
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
    # First use YouTube's own search API. The query is English-focused and only
    # returns captioned videos; if the API is unavailable, fall back to yt-dlp's
    # YouTube search extractor.
    key=os.environ.get('YOUTUBE_API_KEY','').strip()
    if key:
        info=youtube_api_get('search',{
            'part':'snippet','q':query,'type':'video',
            'maxResults':min(50,int(n)),
            'relevanceLanguage':'en',
            'videoCaption':'closedCaption',
            'order':'date'
        })
        out=[]
        for row in info.get('items',[]) or []:
            vid=((row.get('id') or {}).get('videoId'))
            if vid:
                sn=row.get('snippet') or {}
                out.append({'id':vid,'title':sn.get('title',''),'channel':sn.get('channelTitle',''),'description':sn.get('description','')})
        if out:return out
    if YoutubeDL is None:return []
    try:
        opts={'quiet':True,'no_warnings':True,'skip_download':True,'noplaylist':True,'extract_flat':'discard_in_playlist','ignoreerrors':True,'socket_timeout':15,'retries':2}
        with YoutubeDL(opts) as ydl:
            info=ydl.extract_info(f'ytsearch{min(50,int(n))}:{query}',download=False) or {}
        out=[]
        for row in info.get('entries',[]) or []:
            if not row:continue
            vid=row.get('id')
            if vid:
                out.append({'id':vid,'title':row.get('title',''),'channel':row.get('channel') or row.get('uploader',''),'description':row.get('description','')})
        return out
    except Exception:
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
                'language':sn.get('defaultLanguage') or sn.get('defaultAudioLanguage') or '',
                'description':sn.get('description',''),
                'has_caption':str((row.get('contentDetails') or {}).get('caption','')).lower()=='true'
            }
    if YoutubeDL is None:return {}
    try:
        opts={'quiet':True,'no_warnings':True,'skip_download':True,'noplaylist':True,
              'socket_timeout':12,'retries':1,'fragment_retries':1,'extractor_retries':1}
        with YoutubeDL(opts) as ydl:
            row=ydl.extract_info(f'https://www.youtube.com/watch?v={video_id}',download=False) or {}
        return {
            'id':video_id,
            'title':row.get('title',''),
            'channel':row.get('channel') or row.get('uploader',''),
            'uploader':row.get('uploader',''),
            'upload_date':str(row.get('upload_date') or '')[:8],
            'duration':float(row.get('duration') or 0),
            'language':row.get('language') or row.get('original_language') or row.get('audio_language') or '',
            'description':row.get('description',''),
            'has_caption':bool(row.get('subtitles') or row.get('automatic_captions'))
        }
    except Exception:
        return {}
 
def fetch_english_via_free_transcript_api(video_id: str):
    # FreeTranscriptAPI expects a YouTube URL, not a bare video id.
    try:
        import requests
        headers={'User-Agent':'SanmuEng/1.0'}
        key=os.environ.get('FREETRANSCRIPT_API_KEY','').strip()
        if key: headers['Authorization']=f'Bearer {key}'
        r=requests.get(
            'https://api.freetranscriptapi.com/v1/transcript',
            params={'video_url':f'https://www.youtube.com/watch?v={video_id}','lang':'en'},
            headers=headers,timeout=12
        )
        if not r.ok:return []
        data=r.json() or {}
        raw=data.get('transcript') or data.get('segments') or []
        rows=[]
        for x in raw:
            text=clean_text(x.get('text') or x.get('en') or x.get('caption') or '')
            start=float(x.get('start') or x.get('offset') or 0)/ (1000 if float(x.get('start') or x.get('offset') or 0)>100000 else 1)
            dur=float(x.get('duration') or 0)/ (1000 if float(x.get('duration') or 0)>100000 else 1)
            if text:rows.append({'start':start,'end':start+max(.5,dur),'en':text})
        return normalize_segments(rows)
    except Exception:
        return []

def fetch_english_via_transcript_txt(video_id: str):
    # Independent hosted fallback. It is useful when GitHub runner IPs are blocked by YouTube.
    try:
        import requests
        u=f'https://youtube-transcript.ai/transcript/{video_id}.txt?lang=en'
        r=requests.get(u,timeout=12,headers={'User-Agent':'SanmuEng/1.0'})
        if not r.ok:return []
        rows=parse_public_transcript_text(r.text)
        return normalize_segments(rows)
    except Exception:
        return []
def best_english_transcript(video_id: str, duration: float):
    # Fast deterministic caption chain for the daily 100-video pipeline.
    # Do not call youtube-transcript-api here: its list/fetch path has no hard
    # network timeout and was the reason the Actions job could sit for a long time.
    try:
        ok,segs,lang,kind=fetch_english_via_timedtext(video_id)
        if ok and segs:
            valid,coverage,reason=validate_transcript(segs,duration)
            if valid:
                zh_rows=[]
                for tlang in ('zh-TW','zh-Hant','zh'):
                    rows=fetch_timedtext(video_id,lang,kind,tlang)
                    if rows and len(rows)>=max(CONFIG['minSegments'],int(len(segs)*0.6)):
                        zh_rows=rows
                        break
                return None,segs,coverage,'youtube-timedtext',zh_rows
    except Exception:
        pass

    # YouTube-native captions via yt-dlp, with a hard subprocess timeout.
    try:
        en_rows, zh_rows = fetch_subtitle_bundle_via_ytdlp(f'https://www.youtube.com/watch?v={video_id}')
        if en_rows:
            valid,coverage,reason=validate_transcript(en_rows,duration)
            if valid:
                return None,en_rows,coverage,'yt-dlp-native-captions',zh_rows
    except Exception:
        pass

    # Hosted transcript fallbacks are bounded by requests timeouts.
    import concurrent.futures
    jobs=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        jobs.append(pool.submit(fetch_english_via_public_transcript,video_id))
        jobs.append(pool.submit(fetch_english_via_free_transcript_api,video_id))
        for f in concurrent.futures.as_completed(jobs):
            try:
                segs=f.result()
                if segs:
                    valid,coverage,reason=validate_transcript(segs,duration)
                    if valid:return None,segs,coverage,'public-transcript',[]
            except Exception:
                pass
    return None,None,0.0,'no-complete-english-transcript',[]

def translate_public_google(text: str):
    import requests
    q=clean_text(text)
    if not q:return ''
    url='https://translate.googleapis.com/translate_a/single'
    try:
        r=requests.get(url,params={'client':'gtx','sl':'en','tl':'zh-TW','dt':'t','q':q},
                       timeout=20,headers={'User-Agent':'Mozilla/5.0'})
        if r.ok:
            data=r.json()
            return clean_text(''.join((x[0] or '') for x in (data[0] or []) if x))
    except Exception:
        pass
    return ''

def translate_lines_public_google(lines):
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=10) as pool:
        return list(pool.map(translate_public_google, lines))

def process_video(video_id, meta, existing, idx=0):
    info=ydl_info(video_id)
    title=clean_text(info.get('title') or meta.get('title') or '')
    if not title:return None,{'id':video_id,'title':'','status':'review','reason':'missing-title'}
    duration=float(info.get('duration') or 0)

    raw_lang=str(info.get('language') or '').lower().replace('_','-')
    if raw_lang and not raw_lang.startswith('en'):
        return None,{'id':video_id,'title':title,'status':'review','reason':'non-english-metadata','spokenLanguage':raw_lang}

    tr,segs,coverage,transcript_source,youtube_zh_rows=best_english_transcript(video_id,duration)
    if not segs:
        return None,{'id':video_id,'title':title,'status':'review','reason':'no-complete-english-transcript'}

    ratio=language_ratios(' '.join(x['en'] for x in segs))
    spoken,spoken_source,spoken_conf=infer_language(info,ratio)
    valid,coverage,reason=validate_transcript(segs,duration)
    if not valid or spoken!='en' or ratio['nonEnglish']>0.18:
        return None,{'id':video_id,'title':title,'status':'review','reason':reason,'englishScore':round(ratio['english'],3),'coverage':round(coverage,3),'spokenLanguage':spoken}

    zh=None; zh_source='none'
    youtube_reference=None

    # 1) Use YouTube's own translated caption directly when it is complete.
    if youtube_zh_rows:
        try:
            candidate=align_translation_segments(segs,youtube_zh_rows)
            if candidate and len(candidate)==len(segs) and all(clean_text(x) for x in candidate):
                youtube_reference=candidate
                zh=candidate
                zh_source='youtube-tw-translation'
        except Exception:
            youtube_reference=None

    # 2) Only translate when YouTube native translation was unavailable.
    try:
        if zh is None:
            got,src=translate_from_youtube(tr,segs) if tr is not None else (None,'none')
            if got and len(got)==len(segs) and all(clean_text(x) for x in got):
                zh,zh_source=got,'youtube-transcript-translation'
    except Exception:
        pass

    # 3) Fast public Google translation fallback.
    # Keep the slow local Argos engine as a last resort so one candidate
    # cannot hold the daily discovery run for minutes.
    if zh is None:
        try:
            lines=[s['en'] for s in segs]
            got=translate_lines_public_google(lines)
            if len(got)==len(lines) and all(got):
                zh,zh_source=got,'google-public-translate'
        except Exception:
            pass

    # 4) Local Argos fallback only after the network path fails.
    if zh is None:
        try:
            got,src=translate_with_argos(segs)
            if got and len(got)==len(segs) and all(clean_text(x) for x in got):
                zh,zh_source=got,'deep-translator-google'
        except Exception:
            pass

    # 5) Last-mile line repair.
    if zh is None:
        try:
            lines=[s['en'] for s in segs]
            recovered=[translate_one(line) for line in lines]
            if len(recovered)==len(lines) and all(clean_text(x) for x in recovered):
                zh,zh_source=recovered,'deep-translator-one-by-one'
        except Exception:
            pass

    # 6) Fill only missing lines from the validated YouTube reference.
    if zh is not None and youtube_reference:
        if len(zh)!=len(segs):
            zh=['']*len(segs)
        repaired=False
        for i in range(len(segs)):
            if not clean_text(zh[i]):
                zh[i]=youtube_reference[i]
                repaired=True
        if repaired:
            zh_source=(zh_source or 'translation')+'+youtube-reference-repair'

    # 7) Emergency fallback: a fully aligned YouTube translation is better than
    # publishing an English-only lesson when a public translator is throttled.
    if (zh is None or len(zh)!=len(segs) or not all(clean_text(x) for x in zh)) and youtube_reference:
        zh=list(youtube_reference)
        zh_source='youtube-reference-fallback'
    if zh is None or len(zh)!=len(segs) or not all(clean_text(x) for x in zh):
        return None,{'id':video_id,'title':title,'status':'review','reason':zh_source or 'translation-incomplete','coverage':round(coverage,3)}

    transcript=[{'start':s['start'],'end':s['end'],'en':s['en'],'zh':clean_text(z)} for s,z in zip(segs,zh)]
    category=meta['category']
    sub=classify(category,meta.get('query',''),title,' '.join(x['en'] for x in transcript),idx)
    level,score=cefr_estimate(' '.join(x['en'] for x in transcript))
    tf=title_fingerprint(title);fp=text_fingerprint(' '.join(x['en'] for x in transcript))
    for old_id,old in existing.items():
        if old_id==video_id:continue
        if old.get('fingerprint')==fp or (old.get('titleFingerprint')==tf and lexical_similarity(old.get('title',''),title)>.9):
            return None,{'id':video_id,'title':title,'status':'review','reason':'duplicate'}
    title_zh=translate_public_google(title) or translate_one(title) or ''
    rec={
      'id':video_id,'title':title,'titleZh':clean_text(title_zh),'addedAt':now_iso(),'acceptedAt':now_iso(),
      'channel':clean_text(info.get('channel') or info.get('uploader') or ''),
      'duration':pretty_duration(duration),'published':str(info.get('upload_date') or '')[:10],
      'category':category['id'],'subcategory':sub,'cefr':level,'cefrScore':score,
      'englishScore':round(ratio['english'],3),'multilingualScore':round(ratio['nonEnglish'],3),
      'spokenLanguage':'en','spokenEvidence':{'method':spoken_source,'confidence':spoken_conf},
      'captionLanguage':'en','captionQuality':'verified','subtitleCoverage':round(coverage,3),
      'captionSource':transcript_source,'translation':'available',
      'translationSource':zh_source,'status':'accepted','sourceUrl':f'https://www.youtube.com/watch?v={video_id}',
      'captions':'available','discoveryQuery':meta.get('query',''),'tags':[],
      'fingerprint':fp,'titleFingerprint':tf,'transcript':transcript,
    }
    return rec,None

def process_batch(items, existing, workers=6):
    # Transcript retrieval/translation are network-bound. Process candidates concurrently
    # so 25 videos/run can finish in minutes rather than serially timing out.
    results=[]
    from concurrent.futures import ThreadPoolExecutor, as_completed
    with ThreadPoolExecutor(max_workers=max(1,int(workers))) as pool:
        futures={pool.submit(process_video,vid,meta,existing,idx):(vid,meta,idx) for idx,(vid,meta) in enumerate(items)}
        for fut in as_completed(futures):
            vid,meta,idx=futures[fut]
            try: results.append((idx,vid,meta,*fut.result()))
            except Exception as exc: results.append((idx,vid,meta,None,{'id':vid,'title':meta.get('title',''),'status':'review','reason':'worker-exception','detail':str(exc)[:500]}))
    results.sort(key=lambda x:x[0])
    return results
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
    # Keep each run bounded: repair only part of the legacy queue, then spend
    # the remaining processing budget on genuinely new videos.
    run_budget=max(25,min(30,int(CONFIG.get('maxProcess',30))))
    CONFIG['workers']=max(1,int(CONFIG.get('workers',12)))
    repair_budget=0  # prioritize daily new-video target
    repair_candidates=repair_candidates[:repair_budget]

    new=[];review=[]
    repaired=0
    processed=0
    for idx,vid,meta,rec,err in process_batch(repair_candidates,existing,workers=int(CONFIG.get('workers',12))):
        processed+=1
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
    remaining=max(0,run_budget-processed)
    batch=[x for x in candidates[:remaining]]
    for idx,vid,meta,rec,err in process_batch(batch,existing,workers=int(CONFIG.get('workers',12))):
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
    today=now_iso()[:10]
    if health.get('dailyDate')!=today:
        health['dailyDate']=today
        health['dailyAccepted']=0
    health['dailyAccepted']=int(health.get('dailyAccepted',0))+len(new)
    if new:health['consecutiveZeroRuns']=0
    else:health['consecutiveZeroRuns']=int(health.get('consecutiveZeroRuns',0))+1
    health['totalNewAccepted']=int(health.get('totalNewAccepted',0))+len(new)
    health['remainingDailyTarget']=max(0,int(CONFIG.get('dailyTarget',100))-int(health.get('dailyAccepted',0)))
    health['lastRun']=now_iso();health['lastNewAccepted']=len(new);health['lastRepaired']=repaired
    dump_json(HEALTH,health)
    dump_json(REVIEW,{'generatedAt':now_iso(),'videos':review,'count':len(review)})
    print(json.dumps({'accepted':len(accepted),'newAccepted':len(new),'repaired':repaired,'review':len(review),'candidates':len(cand),'queries':len(jobs)},ensure_ascii=False))

if __name__=='__main__':
    main()
