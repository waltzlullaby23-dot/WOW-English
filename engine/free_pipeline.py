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
        opts={'quiet':True,'no_warnings':True,'skip_download':True,'noplaylist':True,'socket_timeout':15,'retries':2}
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
    candidates=[]
    # Hosted transcript services are tried first because GitHub-hosted runners
    # can be blocked by YouTube's direct caption endpoints.
    try:
        segs=fetch_english_via_free_transcript_api(video_id)
        if segs:candidates.append(('freetranscriptapi',None,segs,[]))
    except Exception:pass
    try:
        segs=fetch_english_via_transcript_txt(video_id)
        if segs:candidates.append(('youtube-transcript-ai',None,segs,[]))
    except Exception:pass
    # Then use YouTube's own caption metadata / local transcript libraries.
    try:
        en_rows,zh_rows,source_name,source_lang=fetch_caption_tracks_from_player(video_id)
        if en_rows:candidates.append((f'youtube-{source_name}',None,en_rows,zh_rows))
    except Exception:pass
    try:
        tr,segs=fetch_english_transcript(video_id)
        if segs:candidates.append(('youtube-transcript-api',tr,segs,[]))
    except Exception:pass
    valid=[]
    for source,tr,segs,zhrows in candidates:
        try:
            ok,coverage,reason=validate_transcript(segs,duration)
            if ok:valid.append((coverage,len(segs),source,tr,segs,zhrows))
        except Exception:pass
    if not valid:return None,None,0.0,'no-complete-english-transcript',[]
    valid.sort(key=lambda x:(x[0],x[1]),reverse=True)
    coverage,_,source,tr,segs,zhrows=valid[0]
    return tr,segs,coverage,source,zhrows
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
    out=[]
    for line in lines:
        out.append(translate_public_google(line))
        time.sleep(0.12)
    return out

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

    # 1) YouTube's own caption track translated by tlang (same source as the player).
    if youtube_zh_rows:
        zh=align_translation_segments(segs,youtube_zh_rows)
        if zh and all(clean_text(x) for x in zh):
            # YouTube supplied a timestamp-aligned Chinese translation track.
            zh_source='youtube-player-translation'
    # 2) YouTube timedtext translation fallback.
    if zh is None:
        try: zh,zh_source=fetch_youtube_timedtext_translation(video_id,segs)
        except Exception: zh=None
    # 2) Transcript API translation, if its track object is available.
    if zh is None:
        try:
            zh,zh_source=translate_from_youtube(tr,segs)
        except Exception:
            zh=None
    # 3) Free Google Translate public endpoint (no key).
    if zh is None:
        try:
            lines=[s['en'] for s in segs]
            got=translate_lines_public_google(lines)
            if len(got)==len(lines) and all(got):
                zh,zh_source=got,'google-public-translate'
        except Exception:
            zh=None
    # 4) Local/offline translator if present.
    if zh is None:
        try:
            zh,zh_source=translate_with_argos(segs)
        except Exception:
            zh=None

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
    run_budget=max(1,int(CONFIG.get('maxProcess',10)))
    repair_budget=min(len(repair_candidates),max(0,run_budget//2))
    repair_candidates=repair_candidates[:repair_budget]

    new=[];review=[]
    repaired=0
    processed=0
    for idx,(vid,meta) in enumerate(repair_candidates):
        rec,err=process_video(vid,meta,existing,idx)
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
    for idx,(vid,meta) in enumerate(candidates[:remaining]):
        rec,err=process_video(vid,meta,existing,idx+processed)
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

