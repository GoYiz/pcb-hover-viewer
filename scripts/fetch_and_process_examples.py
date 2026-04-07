import json
import os
import re
import urllib.request
from pathlib import Path

ROOT = Path('/var/minis/workspace/pcb-hover-viewer')
RAW_DIR = ROOT / 'data' / 'raw'
OUT_DIR = ROOT / 'public' / 'examples'

SOURCES = [
    {
        'id': 'ch552g_dev_board',
        'name': 'CH552G Dev Board',
        'url': 'https://raw.githubusercontent.com/blueOkiris/ch552g-dev-board/main/pcb/ch552g-dev-board.kicad_pcb',
    },
    {
        'id': 'kl2_dev_board',
        'name': 'KL2 Dev Board',
        'url': 'https://raw.githubusercontent.com/kcuzner/kl2-dev/master/kicad/kl2-dev.kicad_pcb',
    },
    {
        'id': 'esp32_s3_dev_board',
        'name': 'ESP32-S3 Dev Board',
        'url': 'https://raw.githubusercontent.com/chof747/esp32-s3-dev-board/main/esp32-s3-dev-board.kicad_pcb',
    },
    {
        'id': 'mcp3561_dev_board',
        'name': 'MCP3561 Dev Board',
        'url': 'https://raw.githubusercontent.com/edmundsj/MCP3561DevBoard/master/kicad/MCP3561DevBoard.kicad_pcb',
    },
    {
        'id': 'arm_ke04_dev_board',
        'name': 'ARM KE04 Dev Board',
        'url': 'https://raw.githubusercontent.com/twitchyliquid64/arm-ke04-dev/master/arm_devboard_mke.kicad_pcb',
    },
]


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode('utf-8', errors='ignore')


def extract_blocks(text: str, head: str):
    blocks = []
    idx = 0
    needle = f'({head} '
    while True:
        start = text.find(needle, idx)
        if start == -1:
            break
        depth = 0
        end = start
        while end < len(text):
            ch = text[end]
            if ch == '(':
                depth += 1
            elif ch == ')':
                depth -= 1
                if depth == 0:
                    end += 1
                    break
            end += 1
        blocks.append(text[start:end])
        idx = end
    return blocks


def parse_board(text: str, board_id: str, board_name: str):
    footprints = extract_blocks(text, 'footprint')
    modules = extract_blocks(text, 'module')
    packages = footprints + modules
    segments = extract_blocks(text, 'segment')

    components = []
    coords_x = []
    coords_y = []

    for fp in packages:
        m_ref = re.search(r'\(property\s+"Reference"\s+"([^"]+)"', fp)
        if not m_ref:
            m_ref = re.search(r'\(fp_text\s+reference\s+"?([^"\s\)]+)"?', fp)
        if not m_ref:
            continue

        ref = m_ref.group(1)
        m_at = re.search(r'\(at\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)(?:\s+-?\d+(?:\.\d+)?)?\)', fp)
        if not m_at:
            continue

        x = float(m_at.group(1))
        y = float(m_at.group(2))
        nets = []
        for m in re.finditer(r'\(net\s+(\d+)\s+"([^"]+)"\)', fp):
            net_num = m.group(1)
            net_name = m.group(2)
            nets.append({'id': net_num, 'name': net_name})

        uniq = {}
        for n in nets:
            uniq[n['id']] = n['name']

        components.append({
            'id': ref,
            'refdes': ref,
            'x': x,
            'y': y,
            'rotation': 0,
            'bbox': [x - 0.7, y - 0.5, 1.4, 1.0],
            'nets': [{'id': k, 'name': v} for k, v in uniq.items()],
        })
        coords_x.append(x)
        coords_y.append(y)

    traces = []
    for i, seg in enumerate(segments, start=1):
        m_start = re.search(r'\(start\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\)', seg)
        m_end = re.search(r'\(end\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\)', seg)
        m_w = re.search(r'\(width\s+(-?\d+(?:\.\d+)?)\)', seg)
        m_layer = re.search(r'\(layer\s+"?([^"\s\)]+)"?\)', seg)
        m_net = re.search(r'\(net\s+(\d+)\)', seg)

        if not (m_start and m_end and m_w and m_layer and m_net):
            continue

        x1 = float(m_start.group(1))
        y1 = float(m_start.group(2))
        x2 = float(m_end.group(1))
        y2 = float(m_end.group(2))
        w = float(m_w.group(1))
        layer = m_layer.group(1)
        net_id = m_net.group(1)

        traces.append({
            'id': f'T{i}',
            'netId': str(net_id),
            'layerId': layer,
            'width': w,
            'path': [[x1, y1], [x2, y2]],
        })
        coords_x.extend([x1, x2])
        coords_y.extend([y1, y2])

    if not coords_x:
        coords_x = [0, 100]
        coords_y = [0, 60]

    min_x, max_x = min(coords_x), max(coords_x)
    min_y, max_y = min(coords_y), max(coords_y)
    width = max(20.0, max_x - min_x + 10)
    height = max(20.0, max_y - min_y + 10)

    for c in components:
        c['bbox'] = [
            c['bbox'][0] - min_x + 5,
            c['bbox'][1] - min_y + 5,
            c['bbox'][2],
            c['bbox'][3],
        ]
        c['x'] = c['x'] - min_x + 5
        c['y'] = c['y'] - min_y + 5

    for t in traces:
        t['path'] = [[p[0] - min_x + 5, p[1] - min_y + 5] for p in t['path']]

    net_name_map = {}
    for c in components:
        for n in c['nets']:
            net_name_map[n['id']] = n['name']

    nets = [{'id': nid, 'name': nname} for nid, nname in net_name_map.items()]

    return {
        'board': {
            'id': board_id,
            'name': board_name,
            'version': 'imported',
            'widthMm': round(width, 2),
            'heightMm': round(height, 2),
        },
        'layers': [
            {'id': 'F.Cu', 'name': 'F.Cu', 'zIndex': 1},
            {'id': 'B.Cu', 'name': 'B.Cu', 'zIndex': 2},
        ],
        'components': components,
        'traces': traces,
        'nets': nets,
    }


def main():
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    index = []

    for src in SOURCES:
        try:
            text = fetch(src['url'])
        except Exception as e:
            print(f"[WARN] fetch failed {src['id']}: {e}")
            continue

        raw_path = RAW_DIR / f"{src['id']}.kicad_pcb"
        raw_path.write_text(text, encoding='utf-8')

        data = parse_board(text, src['id'], src['name'])
        out_path = OUT_DIR / f"{src['id']}.json"
        out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')

        index.append({
            'id': src['id'],
            'name': src['name'],
            'source': src['url'],
            'file': f"/examples/{src['id']}.json",
            'components': len(data['components']),
            'traces': len(data['traces']),
        })
        print(f"[OK] {src['id']} components={len(data['components'])} traces={len(data['traces'])}")

    (OUT_DIR / 'index.json').write_text(json.dumps({'examples': index}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"[DONE] generated {len(index)} examples")


if __name__ == '__main__':
    main()
