from pathlib import Path
ROOT=Path(__file__).resolve().parent
APP=ROOT/'app.js'
CSS=ROOT/'styles.css'
PATCH=(ROOT/'v6-app-overrides.js').read_text(encoding='utf-8')
CSSPATCH=(ROOT/'v6-scroll.css').read_text(encoding='utf-8')

def append_once(path,marker,text):
    s=path.read_text(encoding='utf-8')
    if marker not in s:
        path.write_text(s+'\n\n'+text+'\n',encoding='utf-8')
        return True
    return False

if not APP.exists() or not CSS.exists():
    raise SystemExit('請把此腳本放在 WOW-English 專案根目錄執行。')
append_once(APP,'/* 三木Eng V6 Frontend Override',PATCH)
append_once(CSS,'/* 三木Eng V6 scroll hardening',CSSPATCH)
req_src=ROOT/'requirements.txt'
req_src.write_text((ROOT/'requirements.txt').read_text(encoding='utf-8') if req_src.exists() else 'requests>=2.32.0\n',encoding='utf-8')
# Replace with zero-paid-dependency requirements.
req_src.write_text('requests>=2.32.0\nyt-dlp>=2026.8.1\nyoutube-transcript-api>=1.2.0\nopencc-python-reimplemented>=0.1.7\nwordfreq>=3.1\n',encoding='utf-8')
print('V6_FREE_PATCH_APPLIED')
