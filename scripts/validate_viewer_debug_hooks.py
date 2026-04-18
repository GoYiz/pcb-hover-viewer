from __future__ import annotations

import os
import subprocess
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PORT = 3106
BASE = f"http://127.0.0.1:{PORT}"
LOG = ROOT / '.tmp_validate_viewer_debug_hooks.log'


def fetch_text(path: str) -> str:
    req = urllib.request.Request(f'{BASE}{path}', headers={'User-Agent': 'Minis'})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read().decode('utf-8', errors='ignore')


def wait_ready() -> None:
    last = None
    for _ in range(60):
        try:
            text = fetch_text('/examples')
            if 'REFERENCE EXAMPLE LIBRARY' in text:
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

    board = fetch_text('/board/switch_board_ipc?view=three&inspect_kind=documentation&inspect_id=T776')
    assert 'QA / Debug panel' in board
    assert 'QA / Debug panel' in board
    assert 'documentation' in board and 'Hovered overlay' in board
    assert 'Hovered overlay' in board
    assert 'Family buckets' in board

    examples = fetch_text('/examples?example=switch_board_ipc&inspect_kind=documentation&inspect_id=T776')
    assert 'REFERENCE EXAMPLE LIBRARY' in examples
    assert 'Switch Board IPC' in examples
    assert 'QA / Debug panel' in examples
    assert 'Deterministic overlay targets for automation across imported example boards.' in examples
    assert 'examples-overlay-target-documentation' in examples or 'documentation' in examples
    assert 'Family buckets' in examples

    print('validate_viewer_debug_hooks: OK')
finally:
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=5)
