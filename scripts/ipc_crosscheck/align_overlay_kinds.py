from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / 'data' / 'raw'
EXAMPLES = ROOT / 'public' / 'examples'
OUT = ROOT / '.tmp_ipc_crosscheck'
OUT.mkdir(exist_ok=True)

CPP_BIN = Path.home() / 'third_party' / 'ipc2581-to-kicad' / 'build' / 'ipc2581-to-kicad'
JAVA_JAR = Path.home() / 'third_party' / 'ipc2581-parser' / 'target' / 'ipc2581-parser-0.1.0-jar-with-dependencies.jar'

CASES = {
    'led': {
        'raw': RAW / 'led_power_board_ipc.xml',
        'ours': EXAMPLES / 'led_power_board_ipc.json',
    },
    'switch': {
        'raw': RAW / 'switch_board_ipc.xml',
        'ours': EXAMPLES / 'switch_board_ipc.json',
    },
}


def run_case(raw: Path, key: str):
    cpp_out = OUT / f'{key}_cpp.json'
    java_out = OUT / f'{key}_java.json'
    with cpp_out.open('w', encoding='utf-8') as f:
        subprocess.run([str(CPP_BIN), '--export-json', str(raw)], stdout=f, check=True)
    subprocess.run(['java', '-jar', str(JAVA_JAR), str(raw), str(java_out)], check=True, stdout=subprocess.DEVNULL)
    return json.loads(cpp_out.read_text(encoding='utf-8')), json.loads(java_out.read_text(encoding='utf-8'))


def summarize_ours(d: dict) -> dict:
    meta = (d.get('importMetadata') or {}).get('stats') or {}
    obj = meta.get('objectCountBySemantic') or {}
    projection = meta.get('externalBucketProjection') or {}
    return {
        'object_semantics': {k: obj.get(k, 0) for k in ['board_outline', 'copper', 'via', 'zone', 'graphics', 'drill']},
        'external_bucket_projection': {
            'board_outline': projection.get('board_outline', 0),
            'copper': projection.get('copper', 0),
            'via': projection.get('via', 0),
            'zone': projection.get('zone', 0),
            'graphics': projection.get('graphics', 0),
            'graphicsByLayer': projection.get('graphicsByLayer', {}),
            'graphicsBySource': projection.get('graphicsBySource', {}),
        },
        'expanded_arrays': {k: len(d.get(k, [])) for k in ['boardOutlines', 'zones', 'vias', 'pads', 'keepouts', 'silkscreen', 'documentation', 'mechanical', 'graphics', 'drills']},
        'components': len(d.get('components', [])),
        'nets': len(d.get('nets', [])),
    }


def summarize_cpp(d: dict) -> dict:
    outline = d.get('outline') or {}
    return {
        'bucket_counts': {
            'board_outline': len(outline.get('segments', [])) + len(outline.get('arcs', [])),
            'copper': len(d.get('traces', [])) + len(d.get('trace_arcs', [])),
            'via': len(d.get('vias', [])),
            'zone': len(d.get('zones', [])),
            'graphics': len(d.get('graphics', [])),
        },
        'components': len(d.get('components', [])),
        'nets': len(d.get('nets', [])),
    }


def summarize_java(d: dict) -> dict:
    return {
        'components': len(d.get('components', [])),
        'nets': len(d.get('nets', [])),
        'component_edges': len(d.get('componentEdges', [])),
    }


def main() -> None:
    rows = {}
    for key, cfg in CASES.items():
        ours = json.loads(cfg['ours'].read_text(encoding='utf-8'))
        cpp, java = run_case(cfg['raw'], key)
        rows[key] = {
            'ours': summarize_ours(ours),
            'cpp': summarize_cpp(cpp),
            'java': summarize_java(java),
        }
    print(json.dumps(rows, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
