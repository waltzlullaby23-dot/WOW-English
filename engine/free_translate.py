from __future__ import annotations
import json,re
from pathlib import Path
from argostranslate import package,translate
CAT=Path(__file__).resolve().parents[1]/'data/catalog.json'

def ensure_model():
    installed=translate.get_installed_languages()
    if any(x.code=='en' for x in installed) and any(x.code in {'zh','zh_CN'} for x in installed):
        return
    for p in package.get_available_packages():
        if p.from_code=='en' and p.to_code in {'zh','zh_CN'}:
            package.install_from_path(p.download())
            return
    raise RuntimeError('No free Argos en->zh model available')

def to_zh(text):
    return translate.translate(text,'en','zh').replace('， ','，').strip()

def main():
    ensure_model()
    data=json.loads(CAT.read_text(encoding='utf-8'))
    translated=0
    for v in data.get('videos',[]):
        if v.get('status')!='accepted':continue
        seg=v.get('transcript') or []
        if not seg:continue
        for s in seg:
            if not str(s.get('zh') or '').strip():
                try:
                    s['zh']=to_zh(str(s.get('en') or ''))
                    if s['zh']:translated+=1
                except Exception:
                    pass
        if all(str(s.get('zh') or '').strip() for s in seg):
            v['translation']='available'
        elif any(str(s.get('zh') or '').strip() for s in seg):
            v['translation']='partial'
        else:
            v['translation']='pending'
    data['translatedByFreeEngine']=translated
    CAT.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'TRANSLATED={translated}')
if __name__=='__main__':main()
