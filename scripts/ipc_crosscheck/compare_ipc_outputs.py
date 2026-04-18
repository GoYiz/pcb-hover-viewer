import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OURS = {
    'led': ROOT / 'public/examples/led_power_board_ipc.json',
    'switch': ROOT / 'public/examples/switch_board_ipc.json',
}
EXT = {
    'led': Path.home() / 'tmp_ipc_align/led_cpp.json',
    'switch': Path.home() / 'tmp_ipc_align/switch_cpp.json',
}



def load_json(p):
    return json.load(open(p))


def summarize_ours(d):
    comps = d.get('components', [])
    traces = d.get('traces', [])
    layers = d.get('layers', [])
    nets = d.get('nets', [])
    refdes = sorted({c.get('refdes') or c.get('id') for c in comps if (c.get('refdes') or c.get('id'))})
    return {
        'board': d.get('board', {}),
        'component_count': len(comps),
        'trace_count': len(traces),
        'layer_count': len(layers),
        'net_count': len(nets),
        'layer_trace_counts': dict(sorted(Counter(t.get('layerId') for t in traces).items())),
        'refdes': refdes,
    }


def first_list(d, keys):
    for k in keys:
        v = d.get(k)
        if isinstance(v, list):
            return v
    return []


def summarize_external(d):
    board = d.get('board', d.get('pcb', {})) if isinstance(d, dict) else {}
    comps = first_list(d, ['components', 'footprints', 'modules'])
    tracks = first_list(d, ['tracks', 'traces', 'segments', 'wires'])
    vias = first_list(d, ['vias'])
    layers = first_list(d, ['layers'])
    nets = first_list(d, ['nets', 'netClasses'])
    refdes = []
    for c in comps:
        if not isinstance(c, dict):
            continue
        ref = c.get('reference') or c.get('refdes') or c.get('ref') or c.get('id')
        if ref:
            refdes.append(str(ref))
    layer_counter = Counter()
    for t in tracks:
        if isinstance(t, dict):
            layer_counter[str(t.get('layer') or t.get('layerId') or t.get('layer_name') or '?')] += 1
    for v in vias:
        layer_counter['VIA'] += 1
    return {
        'board': board,
        'component_count': len(comps),
        'trace_count': len(tracks) + len(vias),
        'layer_count': len(layers),
        'net_count': len(nets),
        'layer_trace_counts': dict(sorted(layer_counter.items())),
        'refdes': sorted(set(refdes)),
        'raw_keys': list(d.keys())[:40] if isinstance(d, dict) else [],
    }


def compare(name):
    ours = summarize_ours(load_json(OURS[name]))
    ext = summarize_external(load_json(EXT[name]))
    print(f'## CASE {name}')
    print('OURS board', ours['board'])
    print('EXT board', ext['board'])
    print('OURS counts', {k: ours[k] for k in ['component_count','trace_count','layer_count','net_count']})
    print('EXT  counts', {k: ext[k] for k in ['component_count','trace_count','layer_count','net_count']})
    ours_refs = set(ours['refdes'])
    ext_refs = set(ext['refdes'])
    print('refdes only ours', sorted(list(ours_refs - ext_refs))[:20], 'count', len(ours_refs - ext_refs))
    print('refdes only ext ', sorted(list(ext_refs - ours_refs))[:20], 'count', len(ext_refs - ours_refs))
    print('top ours layers', sorted(ours['layer_trace_counts'].items(), key=lambda x: x[1], reverse=True)[:8])
    print('top ext layers ', sorted(ext['layer_trace_counts'].items(), key=lambda x: x[1], reverse=True)[:8])
    print('ext keys', ext.get('raw_keys'))
    print()

for case in ['led','switch']:
    compare(case)
