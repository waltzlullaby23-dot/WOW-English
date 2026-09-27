from __future__ import annotations
import hashlib, html, json, math, re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; DATA=ROOT/'data'
def load_json(path,default):
    try:return json.loads(Path(path).read_text(encoding='utf8'))
    except Exception:return default
def dump_json(path,value):Path(path).write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf8')
def clean_text(v):
    v=v or '';v=html.unescape(re.sub(r'<[^>]+>',' ',v));return re.sub(r'\s+',' ',v).strip()
def language_ratios(text):
    t=clean_text(text); latin=len(re.findall(r'[A-Za-zÀ-ÿ]',t)); cjk=len(re.findall(r'[\u3400-\u9fff]',t)); kana=len(re.findall(r'[\u3040-\u30ff]',t)); hangul=len(re.findall(r'[\uac00-\ud7af]',t));total=max(1,latin+cjk+kana+hangul);return {'english':latin/total,'nonEnglish':1-latin/total,'chinese':cjk/total,'japanese':kana/total,'korean':hangul/total}
def text_fingerprint(text):
    toks=re.findall(r"[a-z]+(?:'[a-z]+)?",text.lower());s='|'.join(' '.join(toks[i:i+5]) for i in range(max(0,len(toks)-4)))[:5000];return hashlib.sha256(s.encode()).hexdigest()
def title_fingerprint(title):return re.sub(r'\s+',' ',re.sub(r'[^a-z0-9]+',' ',title.lower())).strip()
def lexical_similarity(a,b):
    A=set(re.findall(r'[a-z]+',a.lower()));B=set(re.findall(r'[a-z]+',b.lower()));return len(A&B)/max(1,len(A|B))
def cosine(a,b):
    if not a or not b:return 0.0
    den=math.sqrt(sum(x*x for x in a))*math.sqrt(sum(y*y for y in b));return sum(x*y for x,y in zip(a,b))/den if den else 0.0
def parse_iso_duration(s):
    m=re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?',s or '');return (int(m.group(1) or 0)*3600+int(m.group(2) or 0)*60+float(m.group(3) or 0)) if m else 0
def pretty_duration(sec):
    sec=int(sec);return f'{sec//3600:02d}:{(sec%3600)//60:02d}:{sec%60:02d}' if sec>=3600 else f'{sec//60:02d}:{sec%60:02d}'
