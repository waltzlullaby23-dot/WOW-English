from __future__ import annotations
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'engine'))
from free_pipeline import validate_transcript, cefr_estimate, choose_subcategory

rows=[{'start':i*5,'end':i*5+5,'en':'This is a clear English learning sentence for testing.'} for i in range(12)]
ok,cov,reason=validate_transcript(rows,60)
assert ok and cov>=.9 and reason=='ok',(ok,cov,reason)
assert cefr_estimate('This is a simple sentence. We learn English every day.') [0] in {'A1','A2','B1'}
cat={'subs':['文法','發音','字彙']}
assert choose_subcategory(cat,'pronunciation English','pronunciation practice',0)=='發音'
print('TEST_FREE_PIPELINE_OK')
