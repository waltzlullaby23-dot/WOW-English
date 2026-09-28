import subprocess, json, os, time, re, requests, sys
sys.path.insert(0, os.getcwd())
from engine.free_pipeline import parse_public_transcript_text
from youtube_transcript_api import YouTubeTranscriptApi

VIDEOS = [
    "0Nv-zlhdb7Y","3NM72kTE2oQ","4C4wlOAscv4","SMIgI-qDNCA","uz2C3bQot6o"
]

def hosted_probe(vid):
    import requests
    urls=[
      f"https://youtube-transcript.ai/transcript/{vid}.txt?lang=en",
      f"https://youtube2text.org/api/transcribe?url=https://www.youtube.com/watch?v={vid}&maxChars=30000"
    ]
    out=[]
    for u in urls:
      try:
        r=requests.get(u,timeout=20,headers={"User-Agent":"SanmuEng/1.0"})
        item={"url":u,"status":r.status_code,"chars":len(r.text or ""),"head":(r.text or "")[:300]}
        if "youtube-transcript.ai" in u and r.ok:
          rows=parse_public_transcript_text(r.text)
          item["parsed_rows"]=len(rows); item["parsed_chars"]=len(" ".join(x["en"] for x in rows))
        out.append(item)
      except Exception as e:out.append({"url":u,"error":str(e)})
    return out

def yt_dlp_probe(vid):
    try:
        p=subprocess.run(
            ["yt-dlp","--skip-download","--list-subs","--no-warnings",
             "--extractor-args","youtube:player_client=web_embedded,web",
             f"https://www.youtube.com/watch?v={vid}"],
            text=True,capture_output=True,timeout=30
        )
        out=p.stdout+p.stderr
        langs=[]
        for line in out.splitlines():
            m=re.search(r"^\s*([A-Za-z]{2,}(?:-[A-Za-z0-9]+)?)\s+",line)
            if m and ("English" in line or m.group(1).lower().startswith("en")):
                langs.append(m.group(1))
        return {"returncode":p.returncode,"english_lines":langs[:20],"tail":out[-1200:]}
    except Exception as e:return {"error":str(e)}

def api_probe(vid):
    try:
        api=YouTubeTranscriptApi()
        lst=api.list(vid)
        rows=[]
        for t in lst:
            rows.append({
              "lang":getattr(t,"language_code",""),
              "generated":bool(getattr(t,"is_generated",False))
            })
        en=[x for x in rows if str(x["lang"]).lower().startswith("en")]
        return {"tracks":rows[:20],"english_tracks":en[:10]}
    except Exception as e:return {"error":str(e)}

out={}
for vid in VIDEOS:
    out[vid]={"yt_dlp":yt_dlp_probe(vid),"transcript_api":api_probe(vid),"hosted":hosted_probe(vid)}
    time.sleep(.5)

print(json.dumps(out,ensure_ascii=False,indent=2))
