"""Compile the translation dictionary into the standalone browser script."""
from pathlib import Path
import json, re
language_dir=Path(__file__).resolve().parent
root=language_dir.parent
en=json.loads((language_dir/'i18n-en.json').read_text(encoding='utf-8'))
catalog=json.loads((language_dir/'i18n-catalog.json').read_text(encoding='utf-8'))
missing=set(catalog)-set(en)
if missing:raise SystemExit('Missing translations: '+repr(sorted(missing)))
source=(root/'i18n.js').read_text(encoding='utf-8')
source,count=re.subn(r'const en = /\* DICTIONARY \*/ .*?;\n',lambda _: 'const en = /* DICTIONARY */ '+json.dumps(en,ensure_ascii=False,separators=(',',':'))+';\n',source,count=1)
if count!=1:raise SystemExit('Translation dictionary marker not found in i18n.js')
(root/'i18n.js').write_text(source,encoding='utf-8')
