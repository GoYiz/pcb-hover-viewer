from __future__ import annotations

import json
import os
import subprocess
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PORT = 3111
BASE = f'http://127.0.0.1:{PORT}'
BOARD_ID = 'switch_board_odb_db_validate'
BOARD_NAME = 'Switch Board ODB DB Validate'
LOG = ROOT / '.tmp_validate_odb_db_import_chain.log'


def fetch_json(path: str):
    req = urllib.request.Request(f'{BASE}{path}', headers={'User-Agent': 'Minis'})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode('utf-8'))


def fetch_text(path: str):
    req = urllib.request.Request(f'{BASE}{path}', headers={'User-Agent': 'Minis'})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read().decode('utf-8', errors='ignore')


def wait_ready() -> None:
    last = None
    for _ in range(60):
        try:
            fetch_json('/api/boards')
            return
        except Exception as exc:
            last = exc
            time.sleep(1)
    raise SystemExit(f'server not ready: {last}')

subprocess.run([
    'npx', 'tsx', 'scripts/import_board_json_to_db.ts',
    'public/examples/switch_board_odb.json', BOARD_ID, BOARD_NAME,
], cwd=ROOT, check=True)

env = os.environ.copy()
env['PORT'] = str(PORT)
with LOG.open('w', encoding='utf-8') as log:
    proc = subprocess.Popen(['node_modules/.bin/next', 'start', '-p', str(PORT)], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, env=env)

try:
    wait_ready()
    boards = fetch_json('/api/boards')['boards']
    ids = {row['id'] for row in boards}
    assert BOARD_ID in ids, 'imported odb db board missing from list'

    meta = fetch_json(f'/api/boards/{BOARD_ID}/meta')
    assert meta['board']['id'] == BOARD_ID
    assert meta['board']['name'] == BOARD_NAME
    assert len(meta['layers']) >= 10

    components = fetch_json(f'/api/boards/{BOARD_ID}/components')
    assert len(components['components']) >= 20
    target = next((c for c in components['components'] if c.get('netIds')), None)
    assert target, 'no odb component with netIds found'

    geom_top = fetch_json(f'/api/boards/{BOARD_ID}/geometry?layer=TOP')
    total_top = sum(len(geom_top.get(key, [])) for key in ['traces', 'zones', 'vias', 'pads', 'keepouts', 'silkscreen', 'boardOutlines', 'documentation', 'mechanical', 'graphics', 'drills'])
    assert total_top >= 500, ('top geometry too low', total_top)
    assert len(geom_top.get('boardOutlines', [])) >= 1
    assert len(geom_top.get('traces', [])) >= 50
    assert len(geom_top.get('pads', [])) >= 50

    geom_bottom = fetch_json(f'/api/boards/{BOARD_ID}/geometry?layer=BOTTOM')
    total_bottom = sum(len(geom_bottom.get(key, [])) for key in ['traces', 'zones', 'vias', 'pads', 'keepouts', 'silkscreen', 'boardOutlines', 'documentation', 'mechanical', 'graphics', 'drills'])
    assert total_bottom >= 100, ('bottom geometry too low', total_bottom)

    rel = fetch_json(f'/api/boards/{BOARD_ID}/relations/component/{urllib.request.quote(target["id"])}')
    assert len(rel['nets']) >= 1, 'odb db relations nets empty'
    assert len(rel['direct']) >= 1, 'odb db relations direct empty'

    page = fetch_text(f'/board/{BOARD_ID}')
    assert BOARD_NAME in page

    print('validate_odb_db_import_chain: OK')
finally:
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=5)
