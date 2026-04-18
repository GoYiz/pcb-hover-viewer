import json, math
from pathlib import Path
from itertools import combinations

ROOT = Path(__file__).resolve().parents[2]
OURS = json.load(open(ROOT / 'public/examples/switch_board_ipc.json'))
JAVA = json.load(open(Path.home() / 'tmp_ipc_align/switch_java.json'))



def our_comp_map(d):
    out = {}
    for c in d.get('components', []):
        ref = str(c.get('refdes') or c.get('id'))
        out[ref] = {'x': float(c['x']), 'y': float(c['y']), 'nets': sorted((n.get('name') or n.get('id')) for n in (c.get('nets') or []))}
    return out


def java_comp_map(d):
    out = {}
    for c in d.get('components', []):
        ref = str(c.get('refDes') or c.get('refdes') or c.get('id'))
        out[ref] = {'x': float(c.get('x', 0.0)), 'y': float(c.get('y', 0.0))}
    return out


def our_edges(comp_map):
    refs = sorted(comp_map)
    edges = set()
    for a, b in combinations(refs, 2):
        nets = set(comp_map[a]['nets']) & set(comp_map[b]['nets'])
        for n in nets:
            edges.add((a, b, n))
    return edges


def java_edges(d):
    out = set()
    for e in d.get('componentEdges', []):
        a = str(e.get('fromRefDes'))
        b = str(e.get('toRefDes'))
        n = str(e.get('netName'))
        if a > b:
            a, b = b, a
        out.add((a, b, n))
    return out

ours = our_comp_map(OURS)
java = java_comp_map(JAVA)
shared = sorted(set(ours) & set(java))
# pairwise relative geometry
errs = []
for a, b in combinations(shared, 2):
    od = math.hypot(ours[a]['x'] - ours[b]['x'], ours[a]['y'] - ours[b]['y'])
    jd = math.hypot(java[a]['x'] - java[b]['x'], java[a]['y'] - java[b]['y'])
    errs.append(abs(od - jd))
print('shared components', len(shared))
print('max pairwise distance delta vs java', round(max(errs) if errs else 0.0, 6))
print('avg pairwise distance delta vs java', round(sum(errs)/len(errs) if errs else 0.0, 6))

our_e = our_edges(ours)
java_e = java_edges(JAVA)
print('our edges', len(our_e))
print('java edges', len(java_e))
print('edges only ours', len(our_e - java_e))
print('edges only java', len(java_e - our_e))
print('sample only ours', list(sorted(our_e - java_e))[:12])
print('sample only java', list(sorted(java_e - our_e))[:12])
