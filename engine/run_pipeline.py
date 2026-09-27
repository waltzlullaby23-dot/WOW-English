"""One-command local/CI runner for the complete content pipeline."""
from __future__ import annotations
import subprocess, sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
STEPS=[
 ('discover', [sys.executable,'engine/discover.py']),
 ('translate', [sys.executable,'engine/translate.py']),
 ('learning-units', [sys.executable,'engine/learning_units.py']),
]

def main():
    for name,cmd in STEPS:
        print(f'\n=== {name} ===')
        r=subprocess.run(cmd,cwd=ROOT)
        if r.returncode:
            raise SystemExit(r.returncode)
    print('\nPipeline completed.')
if __name__=='__main__':main()
