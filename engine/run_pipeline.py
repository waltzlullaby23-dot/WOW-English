import subprocess,sys
for f in ['engine/discover.py','engine/translate.py','engine/learning_units.py','engine/verify_release.py']:
 r=subprocess.run([sys.executable,f]);
 if r.returncode: raise SystemExit(r.returncode)
