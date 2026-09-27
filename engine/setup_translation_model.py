from translation_argos import ensure_en_zh
if not ensure_en_zh():
    raise SystemExit('Unable to install Argos en->zh translation model')
print('ARGOS_EN_ZH_READY')
