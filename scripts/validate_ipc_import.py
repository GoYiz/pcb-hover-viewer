from __future__ import annotations

import json
from pathlib import Path

ROOT = Path('/var/minis/workspace/pcb-hover-viewer')
DATA = ROOT / 'data' / 'raw'
OUT = ROOT / 'public' / 'examples'
SCRIPT = ROOT / 'scripts' / 'import_ipc2581.py'

CASES = [
    {
        'src': DATA / 'led_power_board_ipc.xml',
        'id': 'led_power_board_ipc',
        'name': 'LED Power Board IPC',
        'out': OUT / 'led_power_board_ipc.json',
        'min_components': 8,
        'min_traces': 20,
        'must_layers': {'TOP_COPPER', 'BOARD_EDGE'},
    },
    {
        'src': DATA / 'switch_board_ipc.xml',
        'id': 'switch_board_ipc',
        'name': 'Switch Board IPC',
        'out': OUT / 'switch_board_ipc.json',
        'min_components': 20,
        'min_traces': 500,
        'must_layers': {'Top Layer', 'Bottom Layer', 'DRILL', 'BOARD_CUTOUT'},
    },
]

for case in CASES:
    code = __import__('subprocess').run([
        'python3', str(SCRIPT), str(case['src']), case['id'], case['name'], str(case['out'])
    ], capture_output=True, text=True)
    if code.returncode != 0:
        raise SystemExit(code.stderr or code.stdout)
    data = json.loads(case['out'].read_text('utf-8'))
    assert len(data['components']) >= case['min_components'], (case['id'], 'components too low')
    assert len(data['traces']) >= case['min_traces'], (case['id'], 'traces too low')
    layers = {x['id'] for x in data['layers']}
    missing = case['must_layers'] - layers
    assert not missing, (case['id'], 'missing layers', missing)
    assert data['board']['widthMm'] > 0 and data['board']['heightMm'] > 0, (case['id'], 'invalid board size')
    assert data['nets'], (case['id'], 'nets empty')
    meta = data.get('importMetadata')
    assert meta and meta.get('sourceFormat') == 'ipc2581', (case['id'], 'missing importMetadata')
    assert isinstance(meta.get('warnings'), list), (case['id'], 'warnings missing')
    assert isinstance(meta.get('layerCategories'), dict), (case['id'], 'layerCategories missing')
    stats = meta.get('stats') or {}
    assert stats.get('traceCount') == len(data['traces']), (case['id'], 'traceCount mismatch')
    print(case['id'], 'OK', len(data['components']), len(data['traces']), len(data['nets']), 'warnings', len(meta.get('warnings', [])))
print('validate_ipc_import: OK')
