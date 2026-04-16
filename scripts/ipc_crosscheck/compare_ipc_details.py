import json, math
from pathlib import Path

BASE = Path('/var/minis/workspace')
OURS = {
    'led': BASE / 'pcb-hover-viewer/public/examples/led_power_board_ipc.json',
    'switch': BASE / 'pcb-hover-viewer/public/examples/switch_board_ipc.json',
}
EXT = {
    'led': BASE / 'ipc_crosscheck/led_external.json',
    'switch': BASE / 'ipc_crosscheck/switch_external.json',
}


def load(p):
    return json.load(open(p))


def ext_comp_map(d):
    out = {}
    for c in d.get('components', []):
        ref = c.get('reference') or c.get('refdes') or c.get('id')
        if not ref:
            continue
        out[str(ref)] = c
    return out


def our_comp_map(d):
    return {str(c.get('refdes') or c.get('id')): c for c in d.get('components', [])}


def pos(c):
    for keys in [('x','y'), ('position_x','position_y')]:
        if all(k in c for k in keys):
            return float(c[keys[0]]), float(c[keys[1]])
    pos = c.get('position')
    if isinstance(pos, dict) and 'x' in pos and 'y' in pos:
        return float(pos['x']), float(pos['y'])
    return None


def compare(case):
    ours = load(OURS[case])
    ext = load(EXT[case])
    om = our_comp_map(ours)
    em = ext_comp_map(ext)
    shared = sorted(set(om) & set(em))
    diffs = []
    for ref in shared:
        op = pos(om[ref])
        ep = pos(em[ref])
        if op and ep:
            diffs.append((math.hypot(op[0]-ep[0], op[1]-ep[1]), ref, op, ep))
    diffs.sort(reverse=True)
    print('##', case)
    print('shared components', len(shared))
    print('largest position deltas:')
    for d, ref, op, ep in diffs[:10]:
        print(ref, 'delta_mm=', round(d,4), 'ours=', op, 'ext=', ep)
    print('external categories:', {
        'traces': len(ext.get('traces', [])),
        'trace_arcs': len(ext.get('trace_arcs', [])),
        'vias': len(ext.get('vias', [])),
        'zones': len(ext.get('zones', [])),
        'graphics': len(ext.get('graphics', [])),
    })
    print()

for case in ['led','switch']:
    compare(case)
