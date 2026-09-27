from __future__ import annotations
import subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
cmd=[sys.executable,str(ROOT/'engine'/'free_pipeline.py')]
raise SystemExit(subprocess.call(cmd,cwd=ROOT))
