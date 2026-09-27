from __future__ import annotations

from typing import Iterable

try:
    import argostranslate.package
    import argostranslate.translate
except Exception:
    argostranslate = None

try:
    from opencc import OpenCC
    _S2T = OpenCC('s2t')
except Exception:
    _S2T = None


def _installed_pairs() -> set[tuple[str, str]]:
    if argostranslate is None:
        return set()
    pairs = set()
    try:
        for lang in argostranslate.translate.get_installed_languages():
            for tr in getattr(lang, 'translations', []) or []:
                src = getattr(tr, 'from_lang', None)
                dst = getattr(tr, 'to_lang', None)
                src_code = getattr(src, 'code', None)
                dst_code = getattr(dst, 'code', None)
                if src_code and dst_code:
                    pairs.add((src_code, dst_code))
    except Exception:
        pass
    return pairs


def ensure_en_zh() -> bool:
    """Ensure an English -> Chinese Argos model is installed on the runner."""
    if argostranslate is None:
        return False
    if ('en', 'zh') in _installed_pairs():
        return True
    try:
        argostranslate.package.update_package_index()
        packages = argostranslate.package.get_available_packages()
        pkg = next((p for p in packages if p.from_code == 'en' and p.to_code == 'zh'), None)
        if pkg is None:
            return False
        argostranslate.package.install_from_path(pkg.download())
        return ('en', 'zh') in _installed_pairs()
    except Exception:
        return False


def translate_lines(lines: Iterable[str]) -> list[str] | None:
    """Translate English lines to Chinese without a paid API."""
    if argostranslate is None:
        return None
    if not ensure_en_zh():
        return None
    try:
        text = '\n'.join(str(x or '').strip() for x in lines)
        if not text.strip():
            return [''] * len(lines)
        out = argostranslate.translate.translate(text, 'en', 'zh')
        parts = [p.strip() for p in str(out).splitlines()]
        if len(parts) == len(text.splitlines()):
            if _S2T:
                parts = [_S2T.convert(p) if p else p for p in parts]
            return parts
    except Exception:
        return None
    return None


def translate_one(text: str) -> str:
    if not argostranslate or not ensure_en_zh():
        return ''
    try:
        out = argostranslate.translate.translate(text, 'en', 'zh')
        return _S2T.convert(out) if _S2T else out
    except Exception:
        return ''
