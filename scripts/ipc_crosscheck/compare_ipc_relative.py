import json, math
from pathlib import Path
from itertools import combinations

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


def our_comp_map(d):
    out = {}
    for c in d.get('components', []):
        ref = str(c.get('refdes') or c.get('id'))
        nets = sorted((n.get('name') or n.get('id')) for n in (c.get('nets') or []))
        out[ref] = {'x': float(c['x']), 'y': float(c['y']), 'nets': nets}
    return out


def ext_comp_map(d):
    out = {}
    nets = {str(n.get('id')): n.get('name') for n in d.get('nets', []) if isinstance(n, dict)}
    for c in d.get('components', []):
        ref = str(c.get('reference') or c.get('refdes') or c.get('id'))
        pos = c.get('position')
        if isinstance(pos, list) and len(pos) >= 2:
            x, y = float(pos[0]), float(pos[1])
        elif isinstance(pos, dict):
            x, y = float(pos['x']), float(pos['y'])
        else:
            continue
        pin_map = c.get('pin_net_map') or {}
        cnets = sorted({nets.get(str(v), v) for v in pin_map.values()})
        out[ref] = {'x': x, 'y': y, 'nets': cnets}
    return out


def compare(case):
    ours = our_comp_map(load(OURS[case]))
    ext = ext_comp_map(load(EXT[case]))
    shared = sorted(set(ours) & set(ext))
    print('##', case, 'shared', len(shared))
    bad_nets = []
    for ref in shared:
        on = set(ours[ref]['nets'])
        en = set(ext[ref]['nets'])
        if on != en:
            bad_nets.append((ref, sorted(on), sorted(en)))
    print('net mismatches', len(bad_nets))
    for item in bad_nets[:10]:
        print(' ', item)

    dist_errs = []
    for a, b in combinations(shared, 2):
        od = math.hypot(ours[a]['x'] - ours[b]['x'], ours[a]['y'] - ours[b]['y'])
        ed = math.hypot(ext[a]['x'] - ext[b]['x'], ext[a]['y'] - ext[b]['y'])
        dist_errs.append((abs(od - ed), a, b, od, ed))
    dist_errs.sort(reverse=True)
    print('max pairwise distance delta', round(dist_errs[0][0], 6) if dist_errs else 0.0)
    for err, a, b, od, ed in dist_errs[:8]:
        if err < 1e-3:
            break
        print(' ', a, b, 'err=', round(err, 6), 'ours=', round(od,6), 'ext=', round(ed,6))
    print()

for case in ['led', 'switch']:
    compare(case)
