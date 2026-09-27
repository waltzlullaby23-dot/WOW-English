from pathlib import Path
import re

ROOT=Path(__file__).resolve().parent.parent
APP=ROOT/'app.js'; CSS=ROOT/'styles.css'
OV=Path(__file__).resolve().parent/'app_v7_override.js'
CV=Path(__file__).resolve().parent/'styles_v7_override.css'

app=APP.read_text(encoding='utf-8')
css=CSS.read_text(encoding='utf-8')
ov=OV.read_text(encoding='utf-8')
cv=CV.read_text(encoding='utf-8')

# Prevent duplicate application.
if 'SANMUENG V7 FINAL FRONTEND OVERRIDE' not in app:
    # Make the V7 override the final function definitions.
    app += '\n\n'+ov+'\n'

# Stamp the build and make the redundant UI disappear even before the override renders.
if 'SANMUENG_V7_APPLIED' not in app:
    app += "\nwindow.SANMUENG_V7_APPLIED=true;\n"

if 'SANMUENG V7 FINAL SCROLL RESET' not in css:
    css += '\n\n'+cv+'\n'

APP.write_text(app,encoding='utf-8')
CSS.write_text(css,encoding='utf-8')
print('SANMUENG_V7_APPLIED')
