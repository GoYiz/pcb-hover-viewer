from __future__ import annotations

import json
import os
import subprocess
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PORT = 3105
BASE = f'http://127.0.0.1:{PORT}'
LOG = ROOT / '.tmp_validate_hosted_api_fallback.log'


def fetch_json(path: str):
    req = urllib.request.Request(f'{BASE}{path}', headers={'User-Agent': 'Minis'})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode('utf-8'))


def wait_ready() -> None:
    last = None
    for _ in range(60):
        try:
            fetch_json('/api/boards')
            return
        except Exception as e:
            last = e
            time.sleep(1)
    raise SystemExit(f'server not ready: {last}')


env = os.environ.copy()
env['PORT'] = str(PORT)
with LOG.open('w', encoding='utf-8') as log:
    proc = subprocess.Popen(['node_modules/.bin/next', 'start', '-p', str(PORT)], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, env=env)

try:
    wait_ready()

    boards = fetch_json('/api/boards')['boards']
    ids = {row['id'] for row in boards}
    for expected in ['iphone-mainboard-demo', 'ch552g_dev_board', 'led_power_board_ipc', 'switch_board_odb', 'switch_board_ipc']:
        assert expected in ids, f'missing board {expected}'

    demo_meta = fetch_json('/api/boards/iphone-mainboard-demo/meta')
    assert demo_meta['board']['id'] == 'iphone-mainboard-demo'
    assert len(demo_meta['layers']) == 2

    demo_geom = fetch_json('/api/boards/iphone-mainboard-demo/geometry?layer=TOP')
    assert len(demo_geom['traces']) == 2
    assert len(demo_geom['zones']) == 1
    assert len(demo_geom['vias']) == 1
    assert len(demo_geom['pads']) == 1
    assert len(demo_geom['keepouts']) == 1
    assert len(demo_geom['silkscreen']) == 1
    assert len(demo_geom['boardOutlines']) == 1
    assert len(demo_geom['documentation']) == 1
    assert len(demo_geom['mechanical']) == 1
    assert len(demo_geom['graphics']) == 1
    assert len(demo_geom['drills']) == 1

    demo_rel = fetch_json('/api/boards/iphone-mainboard-demo/relations/component/U1200')
    assert set(demo_rel['nets']) == {'PP_VDD_MAIN', 'PP_VDD_AON'}
    assert len(demo_rel['traces']) == 2
    assert len(demo_rel['direct']) >= 3

    for board_id, layer, min_components, min_geometry in [
        ('ch552g_dev_board', 'F.Cu', 5, 0),
        ('led_power_board_ipc', 'TOP_COPPER', 8, 20),
        ('switch_board_odb', 'TOP_LAYER', 20, 80),
        ('switch_board_ipc', 'Top Layer', 20, 100),
    ]:
        meta = fetch_json(f'/api/boards/{board_id}/meta')
        assert meta['board']['id'] == board_id
        components = fetch_json(f'/api/boards/{board_id}/components')
        assert len(components['components']) >= min_components, (board_id, 'component count too low')
        geometry = fetch_json(f'/api/boards/{board_id}/geometry?layer={urllib.request.quote(layer)}')
        total = sum(len(geometry.get(key, [])) for key in ['traces', 'zones', 'vias', 'pads', 'keepouts', 'silkscreen', 'boardOutlines', 'documentation', 'mechanical', 'graphics', 'drills'])
        assert total >= min_geometry, (board_id, 'geometry too low', total)

    page = urllib.request.urlopen(f'{BASE}/board/switch_board_ipc', timeout=20).read().decode('utf-8', errors='ignore')
    assert 'Switch Board IPC' in page

    print('validate_hosted_api_fallback: OK')
finally:
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=5)
