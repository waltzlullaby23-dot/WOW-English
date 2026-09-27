"""High-volume YouTube discovery + evidence-based language gate + AI classification.

Design goals:
1) Search broadly, but never use the title alone as proof of English.
2) Acquire subtitles with a three-level fallback.
3) Verify spoken language from an audio sample when OPENAI_API_KEY is available.
4) Classify and CEFR-score the transcript with AI, with a deterministic review fallback.
5) Deduplicate with exact IDs, lexical fingerprints, and optional embeddings.
6) Produce a durable catalog and a rejection/review ledger for auditing.
"""
from __future__ import annotations
import json, os, re, subprocess, tempfile, time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

from common import (
    DATA, ROOT, clean_text, cosine, dump_json, language_ratios, lexical_similarity,
    load_json, parse_iso_duration, pretty_duration, text_fingerprint, title_fingerprint,
)

CATALOG = DATA / 'catalog.json'
TAXONOMY = DATA / 'taxonomy.json'
CFG = ROOT / 'engine/config.json'
EMBEDDINGS = DATA / 'embedding-index.json'


def youtube_search(key: str, q: str, max_results: int = 50, page_token: str | None = None) -> dict[str, Any]:
    params = {
        'key': key, 'part': 'snippet', 'q': q, 'type': 'video', 'maxResults': max_results,
        'safeSearch': 'strict', 'relevanceLanguage': 'en', 'videoCaption': 'closedCaption',
        'videoSyndicated': 'true', 'order': 'relevance',
    }
    if page_token:
        params['pageToken'] = page_token
    r = requests.get('https://www.googleapis.com/youtube/v3/search', params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def youtube_details(key: str, ids: list[str]) -> list[dict[str, Any]]:
    out = []
    for i in range(0, len(ids), 50):
        batch = ids[i:i+50]
        r = requests.get('https://www.googleapis.com/youtube/v3/videos', params={
            'key': key, 'part': 'snippet,contentDetails,statistics,status', 'id': ','.join(batch)
        }, timeout=30)
        r.raise_for_status()
        out.extend(r.json().get('items', []))
    return out


def search_queries(taxonomy: dict[str, Any], max_queries: int, offset: int) -> list[str]:
    templates = [
        'English conversation {sub}', 'English explained {sub}', 'learn English {sub}',
        'English podcast {sub}', 'documentary {sub} English', 'interview {sub} English',
        'English speaking {sub}', 'English vocabulary {sub}', 'English lesson {sub}',
        'interesting {sub} explained in English',
    ]
    choices = []
    for cat in taxonomy.get('categories', []):
        for sub in cat.get('subs', []):
            for tpl in templates[:2]:
                choices.append(tpl.format(sub=sub))
    if not choices:
        return []
    offset %= len(choices)
    rotated = choices[offset:] + choices[:offset]
    return rotated[:max_queries]


def run_ytdlp(url: str, output_dir: Path, mode: str, langs: list[str]) -> tuple[list[Path], dict[str, Any]]:
    output_dir.mkdir(parents=True, exist_ok=True)
    outtmpl = str(output_dir / '%(id)s.%(ext)s')
    if mode == 'subs':
        cmd = [
            'yt-dlp', '--skip-download', '--no-warnings', '--write-subs', '--write-auto-subs',
            '--sub-format', 'vtt', '--sub-langs', ','.join(langs), '-o', outtmpl, url,
        ]
    elif mode == 'audio':
        cmd = [
            'yt-dlp', '--no-warnings', '--extract-audio', '--audio-format', 'mp3',
            '--download-sections', '*00:00-00:45', '--force-keyframes-at-cuts', '-o', outtmpl, url,
        ]
    else:
        raise ValueError(mode)
    proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=240)
    files = list(output_dir.glob('*'))
    return files, {'returncode': proc.returncode, 'stdout': proc.stdout[-1500:], 'stderr': proc.stderr[-1500:]}


def parse_vtt_srt(path: Path) -> list[dict[str, Any]]:
    raw = path.read_text(encoding='utf-8', errors='ignore').replace('\ufeff', '')
    raw = re.sub(r'\r\n?', '\n', raw)
    blocks = re.split(r'\n\s*\n', raw)
    out = []
    for block in blocks:
        lines = [x.strip() for x in block.split('\n') if x.strip()]
        if not lines: continue
        time_line = next((x for x in lines if '-->' in x), None)
        if not time_line: continue
        left, right = [x.strip() for x in time_line.split('-->', 1)]
        def ts(x: str) -> float:
            x = x.split()[0].strip()
            parts = x.split(':')
            try:
                if len(parts) == 3:
                    h,m,s = parts; return int(h)*3600 + int(m)*60 + float(s.replace(',', '.'))
                m,s = parts; return int(m)*60 + float(s.replace(',', '.'))
            except Exception: return 0.0
        text = clean_text(' '.join(x for x in lines if x != time_line and not x.isdigit()))
        text = re.sub(r'\s+', ' ', text)
        if text:
            out.append({'start': round(ts(left), 3), 'end': round(ts(right), 3), 'en': text})
    # Deduplicate repeated auto-caption cue text.
    result=[]
    for seg in out:
        if result and seg['en'].lower() == result[-1]['en'].lower() and abs(seg['start']-result[-1]['start']) < 0.5:
            continue
        result.append(seg)
    return result[:1500]


def acquire_captions(video_id: str) -> tuple[list[dict[str, Any]], str, str]:
    """A: manual English; B: auto-generated English; C: youtube-transcript-api."""
    url=f'https://www.youtube.com/watch?v={video_id}'
    with tempfile.TemporaryDirectory() as td:
        root=Path(td)
        for langs, source in [(['en','en-US','en-GB'], 'A:manual-or-preferred-en'), (['en'], 'B:auto-en')]:
            files, _ = run_ytdlp(url, root, 'subs', langs)
            vtts=[p for p in files if p.suffix.lower()=='.vtt']
            if vtts:
                # Prefer a non-auto file if both exist, otherwise newest file.
                vtts.sort(key=lambda p: ('auto' in p.name.lower(), p.name))
                segs=parse_vtt_srt(vtts[0])
                if segs:
                    return segs, source, 'en'
        try:
            from youtube_transcript_api import YouTubeTranscriptApi
            api = YouTubeTranscriptApi()
            transcripts = api.list(video_id)
            ordered=[]
            for tr in transcripts:
                ordered.append((getattr(tr,'language_code','') or '', getattr(tr,'is_generated',False), tr))
            ordered.sort(key=lambda x: (x[0].lower() not in ('en','en-us','en-gb'), x[1]))
            for lang, _, tr in ordered:
                if lang.lower().startswith('en'):
                    rows=tr.fetch()
                    segs=[{'start':float(r.start),'end':float(r.start+r.duration),'en':clean_text(r.text)} for r in rows if clean_text(r.text)]
                    if segs: return segs, 'C:youtube-transcript-api', 'en'
        except Exception:
            pass
    return [], 'none', 'unknown'


def transcribe_audio(path: Path) -> dict[str, Any] | None:
    key=os.getenv('OPENAI_API_KEY')
    if not key or not path.exists(): return None
    model=os.getenv('OPENAI_TRANSCRIBE_MODEL','gpt-4o-mini-transcribe')
    with path.open('rb') as f:
        r=requests.post('https://api.openai.com/v1/audio/transcriptions', headers={'Authorization':f'Bearer {key}'}, files={'file':(path.name,f,'audio/mpeg')}, data={'model':model}, timeout=180)
    if not r.ok: return None
    return r.json()


def classify_language(spoken_text: str, subtitle_text: str, metadata_audio_lang: str) -> dict[str, Any]:
    ratios=language_ratios(spoken_text or subtitle_text)
    fallback={
        # Subtitle text can estimate English-content ratio, but it is NOT proof of spoken language.
        'spokenLanguage': 'unknown',
        'englishScore': round(ratios['english'],3),
        'multilingualScore': round(ratios['nonEnglish'],3),
        'confidence': 0.20,
        'method': 'subtitle-only-review',
    }
    key=os.getenv('OPENAI_API_KEY')
    if not key: return fallback
    evidence=(spoken_text or '')[:8000] + '\n---SUBTITLES---\n' + (subtitle_text or '')[:6000]
    prompt='''Return JSON only. Detect the language actually spoken/content language from the evidence. Do not use video title.\nKeys: spokenLanguage (ISO-639-1 or "mixed"), englishScore 0..1, multilingualScore 0..1, confidence 0..1.\nEnglishScore must reflect English speech/content, not the title or channel. multilingualScore is the share of meaningful non-English speech/content.\nEvidence:\n'''+evidence
    body={'model':os.getenv('OPENAI_CLASSIFY_MODEL','gpt-5.6-luna'),'input':prompt}
    r=requests.post('https://api.openai.com/v1/responses',headers={'Authorization':f'Bearer {key}','Content-Type':'application/json'},json=body,timeout=90)
    if not r.ok: return fallback
    text=(r.json().get('output_text') or '')
    m=re.search(r'\{.*\}',text,re.S)
    if not m:return fallback
    try:
        x=json.loads(m.group(0));
        return {
            'spokenLanguage':str(x.get('spokenLanguage','unknown')),
            'englishScore':round(float(x.get('englishScore',fallback['englishScore'])),3),
            'multilingualScore':round(float(x.get('multilingualScore',fallback['multilingualScore'])),3),
            'confidence':round(float(x.get('confidence',.6)),3), 'method':'openai-transcript-classifier'
        }
    except Exception:return fallback


def ai_content_profile(title: str, description: str, transcript: str, taxonomy: dict[str, Any]) -> dict[str, Any] | None:
    key=os.getenv('OPENAI_API_KEY')
    if not key:return None
    categories=[]
    for c in taxonomy['categories']:
        categories.append({'id':c['id'],'name':c['name'],'subs':c['subs']})
    prompt='''Return JSON only. You are the content classifier for an English-learning video catalog.\nChoose exactly one category id and one subcategory from the provided taxonomy. Estimate CEFR from A1-A2-B1-B2-C1-C2 using vocabulary, syntax, speech rate, abstraction, and implied comprehension burden. Also return 5 useful tags and 3 grammar topics.\nDo not use title alone; use transcript heavily.\nTaxonomy:\n'''+json.dumps(categories,ensure_ascii=False)+'\nVIDEO:\n'+json.dumps({'title':title,'description':description[:3000],'transcript':transcript[:12000]},ensure_ascii=False)
    r=requests.post('https://api.openai.com/v1/responses',headers={'Authorization':f'Bearer {key}','Content-Type':'application/json'},json={'model':os.getenv('OPENAI_CLASSIFY_MODEL','gpt-5.6-luna'),'input':prompt},timeout=90)
    if not r.ok:return None
    t=r.json().get('output_text','');m=re.search(r'\{.*\}',t,re.S)
    if not m:return None
    try:return json.loads(m.group(0))
    except Exception:return None


def heuristic_profile(title: str, transcript: str, taxonomy: dict[str, Any]) -> dict[str, Any]:
    text=(title+' '+transcript).lower()
    patterns={
        'learning':['grammar','vocabulary','pronunciation','english','speaking','learn','passive voice','tense','synonym'],
        'daily':['family','food','home','shopping','daily','bathroom','emotion'],
        'business':['business','finance','office','manager','marketing','startup','workplace'],
        'technology':['ai','app','software','technology','internet','cyber','computer'],
        'science':['science','space','physics','biology','medical','environment','engineering'],
        'news':['news','politics','climate','economy','society','international'],
        'entertainment':['movie','film','actor','series','celebrity','comedy','game'],
        'music':['music','song','lyrics','instrument','album','concert'],
        'travel':['travel','city','hotel','airport','train','tourism','flight'],
        'sports':['basketball','football','soccer','baseball','fitness','running'],
        'history':['history','historical','culture','philosophy','art','civilization'],
        'growth':['habit','productivity','communication','leadership','mindset','self-improvement'],
    }
    cat=max(patterns,key=lambda k:sum(text.count(t) for t in patterns[k]))
    subs=next(c['subs'] for c in taxonomy['categories'] if c['id']==cat)
    score=len(re.findall(r'\b(?:the|and|to|of|in|that|for|with)\b',transcript.lower()))
    words=max(1,len(re.findall(r'[A-Za-z]+',transcript)))
    ratio=score/words
    if words < 80: cefr='A2'
    elif ratio > .18 or words > 1000: cefr='B2'
    else: cefr='B1'
    return {'category':cat,'subcategory':subs[0],'cefr':cefr,'tags':patterns[cat][:5],'grammarTopics':[],'method':'heuristic-review'}


def embed_texts(texts: list[str]) -> list[list[float] | None]:
    key=os.getenv('OPENAI_API_KEY')
    if not key: return [None]*len(texts)
    out=[]
    model=os.getenv('OPENAI_EMBEDDING_MODEL','text-embedding-3-small')
    for i in range(0,len(texts),64):
        batch=texts[i:i+64]
        r=requests.post('https://api.openai.com/v1/embeddings',headers={'Authorization':f'Bearer {key}','Content-Type':'application/json'},json={'model':model,'input':batch},timeout=120)
        if not r.ok:
            out.extend([None]*len(batch)); continue
        data=r.json().get('data',[])
        data=sorted(data,key=lambda x:x.get('index',0))
        out.extend([x.get('embedding') for x in data])
    return out


def main():
    cfg=load_json(CFG,{})
    taxonomy=load_json(TAXONOMY,{'categories':[]})
    catalog=load_json(CATALOG,{'videos':[],'stats':{}})
    embeddings=load_json(EMBEDDINGS,{})
    key=os.getenv('YOUTUBE_API_KEY')
    if not key:
        print('YOUTUBE_API_KEY not set; catalog unchanged.')
        return
    day_offset=int(time.time()//86400)
    queries=search_queries(taxonomy,int(cfg.get('maxQueriesPerRun',24)),day_offset*24)
    candidate_map={}
    page_limit=int(cfg.get('searchPages',1))
    for q in queries:
        token=None
        for _ in range(page_limit):
            try:
                payload=youtube_search(key,q,int(cfg.get('maxResultsPerQuery',50)),token)
                for item in payload.get('items',[]):
                    vid=item.get('id',{}).get('videoId')
                    if vid: candidate_map[vid]=item.get('snippet',{})
                token=payload.get('nextPageToken')
                if not token:break
            except Exception as exc:
                print('search error',q,exc)
                break
    details=youtube_details(key,list(candidate_map)[:int(cfg.get('maxCandidates',500))])
    existing={v['id']:v for v in catalog.get('videos',[])}
    rejected=[]; accepted_new=[]; review=[]
    # Bootstrap semantic index for previously accepted catalog items so new candidates can
    # be deduplicated against the whole corpus, not only videos discovered today.
    missing_index=[]; missing_texts=[]
    for old in existing.values():
        if old.get('status')!='accepted' or old.get('id') in embeddings: continue
        txt=' '.join(s.get('en','') for s in (old.get('transcript') or []))
        missing_index.append(old['id']); missing_texts.append(f"{old.get('title','')}\n{old.get('channel','')}\n{txt[:12000]}")
    if missing_texts:
        for vid,vec in zip(missing_index, embed_texts(missing_texts)):
            if vec is not None:
                old=existing[vid]
                embeddings[vid]={'vector':vec,'textFingerprint':old.get('fingerprint',''),'updatedAt':datetime.now(timezone.utc).isoformat()}
    for item in details:
        vid=item['id']; sn=item.get('snippet',{}); status_info=item.get('status',{}); cd=item.get('contentDetails',{})
        if not status_info.get('embeddable',True):
            rejected.append({'id':vid,'reason':'not-embeddable'}); continue
        if vid in existing: continue
        segments, cap_source, cap_lang=acquire_captions(vid)
        subtitle_text=' '.join(s['en'] for s in segments)
        if not segments:
            rejected.append({'id':vid,'reason':'no-english-caption-after-fallback','title':sn.get('title','')}); continue
        audio_path=None; transcript=''
        try:
            with tempfile.TemporaryDirectory() as td:
                files, _meta = run_ytdlp(f'https://www.youtube.com/watch?v={vid}',Path(td),'audio',[])
                audio=[p for p in files if p.suffix.lower()=='.mp3']
                if audio:
                    tr=transcribe_audio(audio[0])
                    transcript=clean_text((tr or {}).get('text','')) if tr else ''
        except Exception as exc:
            print('audio error',vid,exc)
        lang=classify_language(transcript,subtitle_text,sn.get('defaultAudioLanguage',''))
        accept=float(lang['englishScore'])>=float(cfg.get('acceptEnglishScore',.80)) and float(lang['multilingualScore'])<=float(cfg.get('rejectMultilingualScore',.25)) and str(lang['spokenLanguage']).lower().startswith('en') and float(lang['confidence'])>=float(cfg.get('minLanguageConfidence',.60))
        if not accept:
            review_ok=float(lang['englishScore'])>=float(cfg.get('reviewEnglishScore',.60)) and str(lang['spokenLanguage']).lower() in ('en','mixed','unknown','en-caption')
            row={'id':vid,'title':sn.get('title',''),'sourceUrl':f'https://www.youtube.com/watch?v={vid}','spokenLanguage':lang['spokenLanguage'],'englishScore':lang['englishScore'],'multilingualScore':lang['multilingualScore'],'confidence':lang['confidence'],'captionSource':cap_source,'status':'review' if review_ok else 'rejected'}
            (review if review_ok else rejected).append(row)
            continue
        profile=ai_content_profile(sn.get('title',''),sn.get('description',''),(transcript or subtitle_text),taxonomy) or heuristic_profile(sn.get('title',''),(transcript or subtitle_text),taxonomy)
        cat_ids={c['id'] for c in taxonomy['categories']}; cat=profile.get('category') if profile.get('category') in cat_ids else heuristic_profile(sn.get('title',''),subtitle_text,taxonomy)['category']
        allowed_subs=next(c['subs'] for c in taxonomy['categories'] if c['id']==cat)
        sub=profile.get('subcategory') if profile.get('subcategory') in allowed_subs else allowed_subs[0]
        cefr=profile.get('cefr','B1');
        if cefr not in {'A1','A2','B1','B2','C1','C2'}: cefr='B1'
        text=transcript or subtitle_text
        emb_text=f"{sn.get('title','')}\n{sn.get('description','')}\n{text[:12000]}"
        fingerprint=text_fingerprint(text)
        titlefp=title_fingerprint(sn.get('title',''))
        rec={
            'id':vid,'title':clean_text(sn.get('title','')),'channel':sn.get('channelTitle',''),'duration':pretty_duration(parse_iso_duration(cd.get('duration',''))),'published':sn.get('publishedAt','')[:10],
            'category':cat,'subcategory':sub,'cefr':cefr,'englishScore':round(float(lang['englishScore']),3),'multilingualScore':round(float(lang['multilingualScore']),3),
            'spokenLanguage':lang['spokenLanguage'],'captionLanguage':cap_lang,'spokenEvidence':{'method':lang.get('method'),'confidence':lang.get('confidence')},
            'captionSource':cap_source,'status':'accepted','sourceUrl':f'https://www.youtube.com/watch?v={vid}','captions':'available','translation':'pending',
            'tags':list(dict.fromkeys(profile.get('tags',[]) or []))[:8],'fingerprint':fingerprint,'titleFingerprint':titlefp,
            'transcript':segments,
        }
        duplicate=None
        # Fast exact/near title and transcript fingerprints first.
        for old in existing.values():
            if old.get('fingerprint')==fingerprint and fingerprint: duplicate=old['id']; break
            if old.get('titleFingerprint')==titlefp and lexical_similarity(old.get('title',''),rec['title'])>=.92: duplicate=old['id']; break
        if duplicate:
            rec['status']='duplicate'; rec['duplicateOf']=duplicate; rejected.append(rec); continue
        accepted_new.append((rec,emb_text))
        existing[vid]=rec
    # Embedding dedup is applied after candidate collection so a batch can be compared cheaply.
    vecs=embed_texts([x[1] for x in accepted_new])
    for (rec, emb_text), vec in zip(accepted_new,vecs):
        if vec is None:
            continue
        duplicate=None; best=0.0
        for old_id, meta in embeddings.items():
            oldvec=meta.get('vector')
            if oldvec:
                sim=cosine(vec,oldvec)
                if sim>best: best=sim; duplicate=old_id
        threshold=float(cfg.get('embeddingDuplicateThreshold',.965))
        if duplicate and best>=threshold:
            existing.pop(rec['id'],None)
            rec['status']='duplicate'; rec['duplicateOf']=duplicate; rec['duplicateSimilarity']=round(best,4); rejected.append(rec)
        else:
            embeddings[rec['id']]={'vector':vec,'textFingerprint':rec['fingerprint'],'updatedAt':datetime.now(timezone.utc).isoformat()}
    catalog['videos']=list(existing.values())
    catalog['generatedAt']=datetime.now(timezone.utc).isoformat()
    catalog['source']='continuous-youtube-discovery'
    catalog['stats']={
        'accepted':sum(1 for v in catalog['videos'] if v.get('status')=='accepted'),
        'newAccepted':len([1 for r,_ in accepted_new if r.get('status')=='accepted']),
        'rejected':len(rejected),'review':len(review),
        'processed':len(details),'candidates':len(candidate_map),'queries':len(queries),
        'captionFallbacks':{'A':sum(1 for v in catalog['videos'] if v.get('captionSource','').startswith('A:')),'B':sum(1 for v in catalog['videos'] if v.get('captionSource','').startswith('B:')),'C':sum(1 for v in catalog['videos'] if v.get('captionSource','').startswith('C:'))},
    }
    dump_json(CATALOG,catalog); dump_json(DATA/'rejected.json',{'generatedAt':catalog['generatedAt'],'videos':rejected}); dump_json(DATA/'review.json',{'generatedAt':catalog['generatedAt'],'videos':review}); dump_json(EMBEDDINGS,embeddings)
    print(json.dumps(catalog['stats'],ensure_ascii=False))

if __name__=='__main__': main()
