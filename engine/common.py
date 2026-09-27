from __future__ import annotations
import hashlib, html, json, math, re
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'


def load_json(path: Path, default: Any):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return default


def dump_json(path: Path, value: Any):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def clean_text(value: str | None) -> str:
    value = value or ''
    value = html.unescape(re.sub(r'<[^>]+>', ' ', value))
    value = re.sub(r'\{\\.*?\}', ' ', value)
    return re.sub(r'\s+', ' ', value).strip()


def language_ratios(text: str) -> dict[str, float]:
    text = clean_text(text)
    letters = re.findall(r'[A-Za-z\u00C0-\u024F]', text)
    latin = len(letters)
    cjk = len(re.findall(r'[\u3400-\u9fff]', text))
    kana = len(re.findall(r'[\u3040-\u30ff]', text))
    hangul = len(re.findall(r'[\uac00-\ud7af]', text))
    total = max(1, latin + cjk + kana + hangul)
    return {
        'english': latin / total,
        'chinese': cjk / total,
        'japanese': kana / total,
        'korean': hangul / total,
        'nonEnglish': max(0.0, 1.0 - latin / total),
    }


def normalize_transcript_text(segments: Iterable[dict[str, Any]]) -> str:
    return clean_text(' '.join(str(s.get('en', '')) for s in segments))


def text_fingerprint(text: str, n: int = 5) -> str:
    tokens = re.findall(r"[a-z]+(?:'[a-z]+)?", text.lower())
    shingles = [' '.join(tokens[i:i+n]) for i in range(max(0, len(tokens)-n+1))]
    base = '|'.join(shingles[:600])
    return hashlib.sha256(base.encode('utf-8')).hexdigest()


def title_fingerprint(title: str) -> str:
    normalized = re.sub(r'[^a-z0-9]+', ' ', title.lower()).strip()
    normalized = re.sub(r'\b(official|hd|4k|episode|ep)\b', ' ', normalized)
    return re.sub(r'\s+', ' ', normalized).strip()


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    da = math.sqrt(sum(x*x for x in a)); db = math.sqrt(sum(x*x for x in b))
    if da == 0 or db == 0:
        return 0.0
    return sum(x*y for x, y in zip(a, b)) / (da * db)


def lexical_similarity(a: str, b: str) -> float:
    sa = set(re.findall(r"[a-z]+", a.lower()))
    sb = set(re.findall(r"[a-z]+", b.lower()))
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def parse_iso_duration(value: str) -> int:
    m = re.match(r'^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$', value or '')
    if not m:
        return 0
    h, mi, sec = (int(x or 0) for x in m.groups())
    return h * 3600 + mi * 60 + sec


def pretty_duration(seconds: int) -> str:
    seconds = int(seconds or 0)
    if seconds >= 3600:
        return f'{seconds//3600:02d}:{(seconds%3600)//60:02d}:{seconds%60:02d}'
    return f'{seconds//60:02d}:{seconds%60:02d}'


def stable_id(*parts: str) -> str:
    return hashlib.sha256('|'.join(parts).encode('utf-8')).hexdigest()[:16]
