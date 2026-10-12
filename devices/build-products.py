"""Validate device catalogs and embed them into the browser's device module."""
from pathlib import Path
import json
import re

directory = Path(__file__).resolve().parent
catalog = json.loads((directory / 'products.json').read_text(encoding='utf-8'))
manufacturer_catalog = json.loads((directory / 'manufacturers.json').read_text(encoding='utf-8'))
manufacturers = {}
for item in manufacturer_catalog['manufacturers']:
    identifier, name = item['id'], item['name']
    if type(identifier) is not int or not 0 <= identifier < 65535 or not isinstance(name, str) or not name.strip():
        raise SystemExit(f'Invalid manufacturer entry: {item}')
    if identifier in manufacturers:
        raise SystemExit(f'Duplicate manufacturer ID: {identifier}')
    manufacturers[identifier] = name
models = {}
for item in catalog['products']:
    manufacturer, product = item['manufacturer'], item['product']
    if any(type(value) is not int or not 0 <= value < 65535 for value in (manufacturer, product)):
        raise SystemExit(f'Invalid manufacturer/product IDs: {item}')
    if not isinstance(item['name'], str) or not item['name'].strip():
        raise SystemExit(f'Missing model name: {item}')
    if manufacturer not in manufacturers:
        raise SystemExit(f'Unknown manufacturer in product entry: {manufacturer}')
    key = f'{manufacturer}:{product}'
    if key in models:
        raise SystemExit(f'Duplicate manufacturer/product pair: {key}')
    models[key] = item['name']

target = directory.parent / 'device-info.js'
source = target.read_text(encoding='utf-8')
source, manufacturer_count = re.subn(
    r'const manufacturers = /\* MANUFACTURERS \*/ .*?;\n',
    lambda _: 'const manufacturers = /* MANUFACTURERS */ ' + json.dumps(manufacturers, ensure_ascii=False, separators=(',', ':')) + ';\n',
    source, count=1,
)
if manufacturer_count != 1:
    raise SystemExit('Manufacturer dictionary marker not found in device-info.js')
source, count = re.subn(
    r'const productModels = /\* PRODUCT_MODELS \*/ .*?;\n',
    lambda _: 'const productModels = /* PRODUCT_MODELS */ ' + json.dumps(models, ensure_ascii=False, separators=(',', ':')) + ';\n',
    source, count=1,
)
if count != 1:
    raise SystemExit('Product dictionary marker not found in device-info.js')
target.write_text(source, encoding='utf-8')
print(f'Embedded {len(manufacturers)} manufacturers and {len(models)} product mappings.')
