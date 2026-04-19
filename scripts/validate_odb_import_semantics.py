from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'public' / 'examples' / 'switch_board_odb.json'

d = json.loads(DATA.read_text())
meta = d.get('importMetadata', {})
stats = meta.get('stats', {})
counts = stats.get('geometryArrayCounts', {})
warnings = meta.get('warnings', [])

assert d.get('board', {}).get('id') == 'switch_board_odb'
assert meta.get('sourceFormat') == 'odbpp'
assert counts.get('traces', 0) >= 100
assert counts.get('pads', 0) >= 100
assert counts.get('vias', 0) >= 10
assert counts.get('drills', 0) >= 10
assert counts.get('boardOutlines', 0) >= 1
assert counts.get('silkscreen', 0) >= 50
assert len(warnings) >= 2
assert any('electrical net inference' in w for w in warnings)
print('validate_odb_import_semantics: OK')
