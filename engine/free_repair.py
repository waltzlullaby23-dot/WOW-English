from __future__ import annotations
import json,re
from pathlib import Path
from yt_dlp import YoutubeDL
from youtube_transcript_api import YouTubeTranscriptApi

ROOT=Path(__file__).resolve().parents[1]
CAT=ROOT/'data/catalog.json'

def clean(s):
    return re.sub(r'\s+',' ',str(s or '')).strip()

def duration(video_id):
    with YoutubeDL({'quiet':True,'no_warnings':True,'skip_download':True}) as y:
        i=y.extract_info(f'https://www.youtube.com/watch?v={video_id}',download=False)
    return float(i.get('duration') or 0)

def get_transcript(video_id):
    api=YouTubeTranscriptApi()
    items=api.list(video_id)
    tracks=[]
    for tr in items:
        code=str(getattr(tr,'language_code','') or '')
        if code.startswith('en'):
            try:
                rows=tr.fetch()
                seg=[{'start':float(x.start),'end':float(x.start+x.duration),'en':clean(x.text)} for x in rows if clean(x.text)]
                if len(seg)>=20: tracks.append((tr,seg))
            except Exception:
                pass
    if not tracks:return None
    tr,seg=max(tracks,key=lambda x:len(x[1]))
    return tr,seg

def translate_with_youtube(tr, seg):
    langs=[]
    try: langs=list(getattr(tr,'translation_languages',[]) or [])
    except Exception: pass
    target=None
    for x in langs:
        code=str(x.get('language_code') if isinstance(x,dict) else getattr(x,'language_code',''))
        if code in {'zh-TW','zh-Hant','zh-HK','zh'} or code.startswith('zh'):
            target=code;break
    if not target:return False
    try:
        zh=tr.translate(target).fetch()
        for i,x in enumerate(zh):
            if i<len(seg):seg[i]['zh']=clean(x.text)
        return len(zh)>=len(seg)*0.95
    except Exception:
        return False

def main():
    data=json.loads(CAT.read_text(encoding='utf-8'))
    changed=0
    for v in data.get('videos',[]):
        if v.get('status')!='accepted':continue
        try:
            got=get_transcript(v['id'])
            if not got:continue
            tr,seg=got
            dur=duration(v['id'])
            end=float(seg[-1]['end']) if seg else 0
            coverage=end/max(1,dur)
            if len(seg)<20 or coverage<0.90:continue
            ok=translate_with_youtube(tr,seg)
            v['transcript']=seg
            v['captionQuality']='verified'
            v['captionCoverage']=round(coverage,3)
            if ok:
                v['translation']='available'
            else:
                v['translation']='pending'
            changed+=1
        except Exception as e:
            print('REPAIR_SKIP',v.get('id'),type(e).__name__)
    data['repairChanged']=changed
    data['source']='free-youtube-transcript-pipeline'
    CAT.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'REPAIRED={changed}')
if __name__=='__main__':main()
