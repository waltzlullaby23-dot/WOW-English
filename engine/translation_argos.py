from __future__ import annotations
from typing import Iterable
import time

try:
    from deep_translator import GoogleTranslator
except Exception:
    GoogleTranslator = None

try:
    from opencc import OpenCC
    _S2T = OpenCC('s2t')
except Exception:
    _S2T = None

def _convert(text: str) -> str:
    text=str(text or '').strip()
    return _S2T.convert(text) if (_S2T and text) else text

def translate_lines(lines: Iterable[str]) -> list[str] | None:
    """Free translation fallback using the public Google Translate web service via deep-translator.
    No API key or paid AI service is used. This is a fallback; YouTube's own translated captions
    are preferred by free_pipeline.py when available.
    """
    if GoogleTranslator is None:
        return None
    src=[str(x or '').strip() for x in lines]
    if not src:
        return []
    for attempt in range(3):
        try:
            tr=GoogleTranslator(source='en',target='zh-TW')
            if hasattr(tr,'translate_batch'):
                out=tr.translate_batch(src)
                if out and len(out)==len(src) and all(str(x or '').strip() for x in out):
                    return [_convert(x) for x in out]
            out=[]
            for text in src:
                out.append(_convert(tr.translate(text)))
                time.sleep(0.12)
            if len(out)==len(src) and all(out):
                return out
        except Exception:
            time.sleep(1.5*(attempt+1))
    return None

def translate_one(text: str) -> str:
    got=translate_lines([text])
    return got[0] if got else ''
