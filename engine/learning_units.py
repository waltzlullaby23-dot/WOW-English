"""Turn accepted video transcripts into reusable learning units.

Each video becomes a compact learning graph:
video -> vocabulary -> phrases -> grammar -> questions -> recommended micro-lessons
"""
from __future__ import annotations
import json, os, re
from collections import Counter
from pathlib import Path
from datetime import datetime, timezone
import requests

from common import DATA, ROOT, clean_text, dump_json, load_json

CAT=DATA/'catalog.json'; OUT=DATA/'learning-units.json'; LES=DATA/'lessons.json'
STOP=set('the a an and or but if then than so of to in on at for from by with as is are was were be been being am do does did have has had can could will would should may might must this that these those it its they them their we our you your i he she his her what which who when where why how very just into about over after before because while during there here'.split())


def candidates(text: str, n: int=12):
    words=re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?",text.lower())
    counts=Counter(w for w in words if w not in STOP and len(w)>=4)
    return [w for w,_ in counts.most_common(n)]


def phrases(text: str, n: int=8):
    words=re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?",text.lower())
    grams=Counter(' '.join(words[i:i+k]) for k in (2,3) for i in range(max(0,len(words)-k+1)))
    out=[]
    for p,c in grams.most_common():
        if c<2: continue
        if any(w in STOP for w in p.split()[:1]) and len(p.split())==2: continue
        out.append(p)
        if len(out)>=n: break
    return out


def ai_units(video: dict, text: str, lesson_index: dict) -> dict | None:
    key=os.getenv('OPENAI_API_KEY')
    if not key:return None
    lessons=list(lesson_index.values())[:150]
    prompt='''Return JSON only. Build a compact English-learning unit from one verified English video transcript.\nReturn keys: vocabulary (array of {word,definition_zh,example}), phrases (array of {phrase,meaning_zh,example}), grammar (array of {topic,explanation_zh,pattern,lesson_ids}), questions (array of 5 multiple-choice objects {question,options:[4 strings],answer:int,explanation_zh}).\nDo not invent facts unrelated to the transcript. Use Traditional Chinese for explanations. Link grammar topics to the most relevant provided lesson IDs.\nVideo: '''+json.dumps({'title':video['title'],'cefr':video['cefr'],'category':video['category'],'text':text[:14000]},ensure_ascii=False)+'\nLessons:\n'+json.dumps(lessons,ensure_ascii=False)
    r=requests.post('https://api.openai.com/v1/responses',headers={'Authorization':f'Bearer {key}','Content-Type':'application/json'},json={'model':os.getenv('OPENAI_LEARNING_MODEL','gpt-5.6-luna'),'input':prompt},timeout=120)
    if not r.ok:return None
    m=re.search(r'\{.*\}',r.json().get('output_text',''),re.S)
    if not m:return None
    try:return json.loads(m.group(0))
    except Exception:return None


def main():
    catalog=load_json(CAT,{'videos':[]}); lessons=load_json(LES,{'chapters':[]})
    # Build a simple lesson lookup so generated links are stable even before all 150 lesson bodies exist.
    lesson_index={}
    if lessons.get('microLessons'):
        for item in lessons.get('microLessons', []):
            lesson_index[item['lesson_id']] = {
                'lesson_id': item['lesson_id'],
                'chapter_id': item['chapter_id'],
                'title_en': item.get('title_en',''),
                'title_zh': item.get('title_zh',''),
                'cefr': item.get('cefr','')
            }
    else:
        for row in lessons.get('chapters',[]):
            chapter=row[0]
            for i in range(1, int(lessons.get('lessonsPerChapter',5))+1):
                lesson_index[f'G{chapter:02d}-{i:02d}']={'lesson_id':f'G{chapter:02d}-{i:02d}','chapter_id':chapter,'title_en':row[1],'title_zh':row[2],'cefr':row[3]}
    result=load_json(OUT,{'schemaVersion':1,'generatedAt':'','units':{}})
    for video in catalog.get('videos',[]):
        if video.get('status')!='accepted': continue
        seg=video.get('transcript') or []
        if not seg: continue
        text=' '.join(s.get('en','') for s in seg)
        unit=ai_units(video,text,lesson_index)
        if not unit:
            vocab=[{'word':w,'definition_zh':'待 AI 解釋','example':''} for w in candidates(text)]
            ph=[{'phrase':p,'meaning_zh':'待 AI 解釋','example':''} for p in phrases(text)]
            grammar=[]
            # Cheap stable heuristic links from category + transcript keywords.
            lowered=text.lower()
            topic_map=[('passive',['passive','was','were'],'G19-01'),('modal',['could','should','must','might'],'G11-01'),('present perfect',['have','has','already','yet'],'G08-01'),('comparatives',['more','less','than','better'],'G16-01'),('gerund',['-ing','gerund','enjoy','avoid'],'G18-01')]
            for topic,keys,lid in topic_map:
                if any(k in lowered for k in keys): grammar.append({'topic':topic,'explanation_zh':'依影片語境建立對應文法節點。','pattern':'See micro-lesson '+lid,'lesson_ids':[lid]})
            questions=[]
            for s in seg[:5]:
                q=s.get('en','').strip()
                if not q: continue
                questions.append({'question':'What is the main meaning of this sentence?','options':[q,'An unrelated statement','A different topic','None of the above'],'answer':0,'explanation_zh':'從字幕句子辨識語意。'})
            unit={'vocabulary':vocab[:10],'phrases':ph[:6],'grammar':grammar[:4],'questions':questions[:5],'generator':'heuristic-fallback'}
        unit['videoId']=video['id'];unit['cefr']=video.get('cefr');unit['category']=video.get('category');unit['subcategory']=video.get('subcategory');unit['updatedAt']=datetime.now(timezone.utc).isoformat()
        result['units'][video['id']]=unit
    result['generatedAt']=datetime.now(timezone.utc).isoformat(); dump_json(OUT,result)
    print('learning units:',len(result['units']))

if __name__=='__main__': main()
