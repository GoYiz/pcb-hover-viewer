import json, math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OURS = json.load(open(ROOT / 'public/examples/switch_board_ipc.json'))
CPP = json.load(open(Path.home() / 'tmp_ipc_align/switch_cpp.json'))
JAVA = json.load(open(Path.home() / 'tmp_ipc_align/switch_java.json'))



def our_comp_map(d):
    out = {}
    for c in d.get('components', []):
        ref = str(c.get('refdes') or c.get('id'))
        out[ref] = {
            'x': float(c['x']),
            'y': float(c['y']),
            'nets': sorted((n.get('name') or n.get('id')) for n in (c.get('nets') or [])),
        }
    return out


def cpp_comp_map(d):
    nets = {str(n.get('id')): n.get('name') for n in d.get('nets', []) if isinstance(n, dict)}
    out = {}
    for c in d.get('components', []):
        ref = str(c.get('refdes') or c.get('reference') or c.get('id'))
        pos = c.get('position') or [0,0]
        pin_map = c.get('pin_net_map') or {}
        out[ref] = {
            'x': float(pos[0]),
            'y': float(pos[1]),
            'nets': sorted({nets.get(str(v), v) for v in pin_map.values()}),
        }
    return out


def java_comp_map(d):
    out = {}
    for c in d.get('components', []):
        ref = str(c.get('refDes') or c.get('refdes') or c.get('id'))
        out[ref] = {
            'x': float(c.get('x', 0.0)),
            'y': float(c.get('y', 0.0)),
            'nets': sorted(set(c.get('nets', []) or [])),
        }
    return out

ours = our_comp_map(OURS)
cpp = cpp_comp_map(CPP)
java = java_comp_map(JAVA)
shared = sorted(set(ours) & set(cpp) & set(java))
print('shared components', len(shared))

net_mismatch_vs_cpp = []
net_mismatch_vs_java = []
pos_delta_cpp = []
pos_delta_java = []
for ref in shared:
    on = set(ours[ref]['nets'])
    cn = set(cpp[ref]['nets'])
    jn = set(java[ref]['nets'])
    if on != cn:
        net_mismatch_vs_cpp.append((ref, sorted(on), sorted(cn)))
    if on != jn:
        net_mismatch_vs_java.append((ref, sorted(on), sorted(jn)))
    pos_delta_cpp.append((math.hypot(ours[ref]['x'] - cpp[ref]['x'], ours[ref]['y'] - cpp[ref]['y']), ref, ours[ref], cpp[ref]))
    pos_delta_java.append((math.hypot(ours[ref]['x'] - java[ref]['x'], ours[ref]['y'] - java[ref]['y']), ref, ours[ref], java[ref]))

pos_delta_cpp.sort(reverse=True)
pos_delta_java.sort(reverse=True)
print('net mismatches vs cpp', len(net_mismatch_vs_cpp))
print('net mismatches vs java', len(net_mismatch_vs_java))
print('max pos delta vs cpp', round(pos_delta_cpp[0][0], 6) if pos_delta_cpp else 0)
print('max pos delta vs java', round(pos_delta_java[0][0], 6) if pos_delta_java else 0)
print('sample java mismatches', net_mismatch_vs_java[:12])
