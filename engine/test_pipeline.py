from discover import parse_vtt_srt
from common import language_ratios, text_fingerprint, lexical_similarity, cosine
from pathlib import Path
import tempfile

VTT='''WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello, welcome to the lesson.\n\n00:00:03.000 --> 00:00:05.500\nToday we are talking about food.\n'''

def main():
    with tempfile.TemporaryDirectory() as td:
        p=Path(td)/'x.vtt'; p.write_text(VTT,encoding='utf8')
        seg=parse_vtt_srt(p)
        assert len(seg)==2 and seg[0]['start']==1.0 and seg[1]['en'].startswith('Today')
    r=language_ratios('Hello this is English')
    assert r['english'] > .9
    assert text_fingerprint('Hello there. Hello there.')==text_fingerprint('Hello there. Hello there.')
    assert lexical_similarity('learn English vocabulary','learn English grammar') > 0.3
    assert cosine([1,0],[1,0]) == 1.0
    print('pipeline unit tests: PASS')

if __name__=='__main__':main()
