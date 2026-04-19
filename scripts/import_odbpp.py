from __future__ import annotations

import json
import math
import re
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / 'data' / 'raw'
OUT_DIR = ROOT / 'public' / 'examples'


def parse_matrix(text: str):
    layers = []
    layer_types = {}
    block = None
    for line in text.splitlines():
        s = line.strip()
        if s == 'LAYER {':
            block = {}
            continue
        if s == '}':
            if block:
                name = block.get('NAME', '')
                layer_type = block.get('TYPE', '')
                if name:
                    layers.append({'id': name, 'name': name, 'zIndex': len(layers) + 1})
                    layer_types[name] = layer_type
            block = None
            continue
        if block is not None and '=' in s:
            k, v = s.split('=', 1)
            block[k.strip()] = v.strip()
    return layers, layer_types


def parse_profile(text: str):
    xs = []
    ys = []
    outline = []
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith('#'):
            continue
        parts = s.split()
        if parts[0] in {'OS', 'OC', 'OB'} and len(parts) >= 3:
            x = float(parts[1])
            y = float(parts[2])
            xs.append(x)
            ys.append(y)
            outline.append((x, y))
    if not xs:
        return 100.0, 60.0, 0.0, 0.0, []
    return max(xs) - min(xs), max(ys) - min(ys), min(xs), min(ys), outline


def parse_netlist(text: str):
    net_map = {}
    for line in text.splitlines():
        s = line.strip()
        m = re.match(r'^\$(\d+)\s+(.+)$', s)
        if m:
            net_map[m.group(1)] = m.group(2).strip()
    return net_map


def parse_symbol_defs(text: str):
    defs = {}
    for line in text.splitlines():
        s = line.strip()
        if not s.startswith('$'):
            continue
        parts = s.split(None, 1)
        if len(parts) != 2:
            continue
        sid = parts[0][1:]
        spec = parts[1].strip().lower()
        if spec.startswith('rect'):
            m = re.search(r'rect([\d.]+)x([\d.]+)', spec)
            if m:
                defs[sid] = ('rect', float(m.group(1)) / 1000.0, float(m.group(2)) / 1000.0)
        elif spec.startswith('r'):
            m = re.search(r'r([\d.]+)', spec)
            if m:
                d = float(m.group(1)) / 1000.0
                defs[sid] = ('circle', d, d)
        elif spec.startswith('s'):
            m = re.search(r's([\d.]+)', spec)
            if m:
                d = float(m.group(1)) / 1000.0
                defs[sid] = ('square', d, d)
    return defs


def symbol_dims(symbol_defs, sid: str, fallback: float = 0.15):
    return symbol_defs.get(sid, ('line', fallback, fallback))


def symbol_width(symbol_defs, sid: str, fallback: float = 0.15):
    _kind, w, h = symbol_dims(symbol_defs, sid, fallback)
    return round(max(w, h), 4)


def round_point(x: float, y: float):
    return [round(x, 4), round(y, 4)]


def symbol_flash_path(symbol_defs, sid: str, cx: float, cy: float):
    kind, w, h = symbol_dims(symbol_defs, sid, 0.6)
    if kind in {'rect', 'square'}:
        hw = w / 2
        hh = h / 2
        return [
            round_point(cx - hw, cy - hh),
            round_point(cx + hw, cy - hh),
            round_point(cx + hw, cy + hh),
            round_point(cx - hw, cy + hh),
            round_point(cx - hw, cy - hh),
        ]
    r = max(w, h) / 2
    pts = []
    for i in range(13):
        t = math.tau * i / 12
        pts.append(round_point(cx + math.cos(t) * r, cy + math.sin(t) * r))
    return pts


def arc_points(x1: float, y1: float, x2: float, y2: float, xc: float, yc: float, segments: int = 16):
    r = math.hypot(x1 - xc, y1 - yc)
    if r <= 0:
        return [round_point(x1, y1), round_point(x2, y2)]
    a1 = math.atan2(y1 - yc, x1 - xc)
    a2 = math.atan2(y2 - yc, x2 - xc)
    delta = a2 - a1
    while delta <= -math.pi:
        delta += math.tau
    while delta > math.pi:
        delta -= math.tau
    pts = []
    for i in range(segments + 1):
        t = a1 + delta * (i / segments)
        pts.append(round_point(xc + math.cos(t) * r, yc + math.sin(t) * r))
    return pts


def map_xy(parts, i: int, j: int, min_x: float, min_y: float, pad: float):
    return float(parts[i]) - min_x + pad, float(parts[j]) - min_y + pad


def human_layer_name(layer_name: str):
    aliases = {
        'TOP_LAYER': 'Top Layer',
        'BOTTOM_LAYER': 'Bottom Layer',
        'TOP_PASTE': 'Top Paste',
        'BOTTOM_PASTE': 'Bottom Paste',
        'TOP_SOLDER': 'Top Solder',
        'BOTTOM_SOLDER': 'Bottom Solder',
        'TOP_OVERLAY': 'Top Overlay',
        'BOTTOM_OVERLAY': 'Bottom Overlay',
    }
    return aliases.get(layer_name.upper(), layer_name.replace('_', ' ').title())


def layer_family(layer_name: str, layer_type: str):
    upper_type = layer_type.upper()
    if upper_type == 'ROUT':
        return 'outline'
    if upper_type == 'DRILL':
        return 'drill'
    if upper_type == 'SIGNAL':
        return 'signal'
    if upper_type == 'SILK_SCREEN':
        return 'silkscreen'
    if upper_type in {'SOLDER_PASTE', 'SOLDER_MASK'}:
        return 'pad'
    return 'other'


def parse_components(text: str, min_x: float, min_y: float, pad: float, net_map: dict[str, str]):
    comps = []
    current = None
    nets = set()
    pin_pts = []
    for line in text.splitlines():
        s = line.strip()
        if s.startswith('# CMP'):
            if current:
                if pin_pts:
                    xs = [x for x, _ in pin_pts]
                    ys = [y for _, y in pin_pts]
                    current['bbox'] = [round(min(xs) - 0.35, 4), round(min(ys) - 0.35, 4), round(max(xs) - min(xs) + 0.7, 4), round(max(ys) - min(ys) + 0.7, 4)]
                current['netIds'] = [net_map.get(nid, nid) for nid in sorted(nets)]
                comps.append(current)
            current = None
            nets = set()
            pin_pts = []
            continue
        if s.startswith('CMP '):
            parts = s.split()
            if len(parts) >= 7:
                x = float(parts[2]) - min_x + pad
                y = float(parts[3]) - min_y + pad
                rot = float(parts[4])
                refdes = parts[6]
                value = parts[7] if len(parts) > 7 else ''
                current = {
                    'id': refdes,
                    'refdes': refdes,
                    'x': round(x, 4),
                    'y': round(y, 4),
                    'rotation': round(rot, 4),
                    'bbox': [round(x - 0.7, 4), round(y - 0.5, 4), 1.4, 1.0],
                    'netIds': [],
                    'footprint': value or None,
                }
            continue
        if s.startswith('TOP ') and current:
            parts = s.split()
            if len(parts) >= 8:
                try:
                    px = float(parts[2]) - min_x + pad
                    py = float(parts[3]) - min_y + pad
                    pin_pts.append((px, py))
                except Exception:
                    pass
                net_id = parts[-1]
                if net_id.isdigit() and net_id != '0':
                    nets.add(net_id)
    if current:
        if pin_pts:
            xs = [x for x, _ in pin_pts]
            ys = [y for _, y in pin_pts]
            current['bbox'] = [round(min(xs) - 0.35, 4), round(min(ys) - 0.35, 4), round(max(xs) - min(xs) + 0.7, 4), round(max(ys) - min(ys) + 0.7, 4)]
        current['netIds'] = [net_map.get(nid, nid) for nid in sorted(nets)]
        comps.append(current)
    return comps


def make_item(idx: int, net_id: str, layer_id: str, width: float, path):
    return {
        'id': f'T{idx}',
        'netId': net_id,
        'layerId': layer_id,
        'width': round(width, 4),
        'path': path,
    }


def parse_feature_file(text: str, layer_name: str, family: str, min_x: float, min_y: float, pad: float, net_map: dict[str, str], symbol_defs: dict[str, tuple], start_idx: int):
    result = {
        'traces': [],
        'zones': [],
        'vias': [],
        'pads': [],
        'keepouts': [],
        'silkscreen': [],
        'boardOutlines': [],
        'documentation': [],
        'mechanical': [],
        'graphics': [],
        'drills': [],
    }
    idx = start_idx
    contour = None
    contour_kind = None

    def emit(kind: str, net_id: str, width: float, path_pts, layer_id: str | None = None):
        nonlocal idx
        if len(path_pts) < 2:
            return
        result[kind].append(make_item(idx, net_id, layer_id or human_layer_name(layer_name), width, path_pts))
        idx += 1

    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith('#') or s.startswith('$') or s.startswith('@') or s.startswith('&') or s.startswith('UNITS='):
            continue
        parts = s.split()
        op = parts[0]

        if op == 'L' and len(parts) >= 7:
            x1, y1 = map_xy(parts, 1, 2, min_x, min_y, pad)
            x2, y2 = map_xy(parts, 3, 4, min_x, min_y, pad)
            sym = parts[5]
            width = symbol_width(symbol_defs, sym)
            net_id = net_map.get(parts[7], '$NONE$') if len(parts) >= 8 and parts[7].isdigit() else '$NONE$'
            path_pts = [round_point(x1, y1), round_point(x2, y2)]
            if family == 'signal':
                emit('traces', net_id, width, path_pts, human_layer_name(layer_name))
            elif family == 'silkscreen':
                emit('silkscreen', '$NONE$', width, path_pts, human_layer_name(layer_name))
            elif family == 'outline':
                emit('boardOutlines', '$BOARD$', max(width, 0.1), path_pts, 'BOARD_EDGE')
            else:
                emit('graphics', '$NONE$', width, path_pts, human_layer_name(layer_name))
        elif op == 'A' and len(parts) >= 8:
            x1, y1 = map_xy(parts, 1, 2, min_x, min_y, pad)
            x2, y2 = map_xy(parts, 3, 4, min_x, min_y, pad)
            xc, yc = map_xy(parts, 5, 6, min_x, min_y, pad)
            sym = parts[7]
            width = symbol_width(symbol_defs, sym)
            path_pts = arc_points(x1, y1, x2, y2, xc, yc)
            if family == 'silkscreen':
                emit('silkscreen', '$NONE$', width, path_pts, human_layer_name(layer_name))
            elif family == 'outline':
                emit('boardOutlines', '$BOARD$', max(width, 0.1), path_pts, 'BOARD_EDGE')
            else:
                emit('graphics', '$NONE$', width, path_pts, human_layer_name(layer_name))
        elif op == 'P' and len(parts) >= 4:
            x, y = map_xy(parts, 1, 2, min_x, min_y, pad)
            sym = parts[3]
            path_pts = symbol_flash_path(symbol_defs, sym, x, y)
            width = symbol_width(symbol_defs, sym)
            if family == 'pad':
                emit('pads', '$NONE$', width, path_pts, human_layer_name(layer_name))
            elif family == 'drill':
                emit('drills', '$HOLE$', width, path_pts, 'DRILL')
                if 'PLATED' in layer_name.upper():
                    emit('vias', '$VIA$', width, path_pts, 'Top Layer')
            elif family == 'signal':
                emit('pads', '$NONE$', width, path_pts, human_layer_name(layer_name))
            elif family == 'silkscreen':
                emit('silkscreen', '$NONE$', width, path_pts, human_layer_name(layer_name))
            else:
                emit('graphics', '$NONE$', width, path_pts, human_layer_name(layer_name))
        elif op == 'OB' and len(parts) >= 3:
            x, y = map_xy(parts, 1, 2, min_x, min_y, pad)
            contour = [round_point(x, y)]
            if family == 'signal':
                contour_kind = 'zones'
            elif family == 'silkscreen':
                contour_kind = 'silkscreen'
            elif family == 'outline':
                contour_kind = 'boardOutlines'
            else:
                contour_kind = 'graphics'
        elif op == 'OS' and contour is not None and len(parts) >= 3:
            x, y = map_xy(parts, 1, 2, min_x, min_y, pad)
            contour.append(round_point(x, y))
        elif op in {'OE', 'SE'} and contour is not None:
            if len(contour) >= 2:
                if contour[0] != contour[-1]:
                    contour.append(contour[0])
                if contour_kind == 'boardOutlines':
                    emit('boardOutlines', '$BOARD$', 0.1, contour, 'BOARD_EDGE')
                elif contour_kind == 'silkscreen':
                    emit('silkscreen', '$NONE$', 0.1, contour, human_layer_name(layer_name))
                elif contour_kind == 'zones':
                    emit('zones', '$NONE$', 0.1, contour, human_layer_name(layer_name))
                else:
                    emit('graphics', '$NONE$', 0.1, contour, human_layer_name(layer_name))
            contour = None
            contour_kind = None
    return result, idx


def import_odb_zip(zip_path: Path, board_id: str, board_name: str):
    z = zipfile.ZipFile(zip_path)
    read = lambda name: z.read(name).decode('utf-8', 'ignore')
    matrix_text = read('odb/matrix/matrix')
    profile_text = read('odb/steps/pcb/profile')
    netlist_text = read('odb/steps/pcb/netlists/cadnet/netlist')
    comp_text = read('odb/steps/pcb/layers/comp_+_top/components')
    top_features_text = read('odb/steps/pcb/layers/top_layer/features')

    layers, layer_types = parse_matrix(matrix_text)
    width, height, min_x, min_y, profile_outline = parse_profile(profile_text)
    net_map = parse_netlist(netlist_text)
    symbol_defs = parse_symbol_defs(top_features_text)
    pad = 5.0
    components = parse_components(comp_text, min_x, min_y, pad, net_map)

    geometry = {
        'traces': [],
        'zones': [],
        'vias': [],
        'pads': [],
        'keepouts': [],
        'silkscreen': [],
        'boardOutlines': [],
        'documentation': [],
        'mechanical': [],
        'graphics': [],
        'drills': [],
    }

    trace_idx = 1
    for layer in layers:
        feature_path = f"odb/steps/pcb/layers/{layer['name'].lower()}/features"
        if feature_path not in z.namelist():
            continue
        family = layer_family(layer['name'], layer_types.get(layer['name'], ''))
        parsed, trace_idx = parse_feature_file(read(feature_path), layer['name'], family, min_x, min_y, pad, net_map, symbol_defs, trace_idx)
        for key, items in parsed.items():
            geometry[key].extend(items)

    if profile_outline and not geometry['boardOutlines']:
        pts = [round_point(x - min_x + pad, y - min_y + pad) for x, y in profile_outline]
        if pts and pts[0] != pts[-1]:
            pts.append(pts[0])
        if len(pts) >= 2:
            geometry['boardOutlines'].append(make_item(trace_idx, '$BOARD$', 'BOARD_EDGE', 0.1, pts))
            trace_idx += 1

    nets = [{'id': k, 'name': v} for k, v in sorted(net_map.items())]
    trace_semantics = {
        'board_outline': len(geometry['boardOutlines']),
        'copper': len(geometry['traces']),
        'via': len(geometry['vias']),
        'pad': len(geometry['pads']),
        'zone': len(geometry['zones']),
        'silkscreen': len(geometry['silkscreen']),
        'drill': len(geometry['drills']),
        'graphics': len(geometry['graphics']),
    }
    geometry_counts = {k: len(v) for k, v in geometry.items()}

    return {
        'board': {
            'id': board_id,
            'name': board_name,
            'version': 'imported-odbpp',
            'widthMm': round(width + pad * 2, 2),
            'heightMm': round(height + pad * 2, 2),
        },
        'layers': layers or [
            {'id': 'TOP_LAYER', 'name': 'TOP_LAYER', 'zIndex': 1},
            {'id': 'BOTTOM_LAYER', 'name': 'BOTTOM_LAYER', 'zIndex': 2},
        ],
        'components': components,
        'nets': nets,
        **geometry,
        'importMetadata': {
            'sourceFormat': 'odbpp',
            'stats': {
                'layerCount': len(layers),
                'componentCount': len(components),
                'traceCount': len(geometry['traces']),
                'netCount': len(nets),
                'traceCountBySemantic': trace_semantics,
                'geometryArrayCounts': geometry_counts,
            },
            'layerCategories': layer_types,
            'warnings': [],
        },
    }


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def main():
    if len(sys.argv) < 4:
        print('usage: python import_odbpp.py <input.zip|url> <board_id> <board_name> [output.json]')
        raise SystemExit(1)
    src = sys.argv[1]
    board_id = sys.argv[2]
    board_name = sys.argv[3]
    out = Path(sys.argv[4]) if len(sys.argv) > 4 else OUT_DIR / f'{board_id}.json'
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    out.parent.mkdir(parents=True, exist_ok=True)
    if src.startswith('http://') or src.startswith('https://'):
        raw = fetch(src)
        in_path = RAW_DIR / f'{board_id}.zip'
        in_path.write_bytes(raw)
    else:
        in_path = Path(src)
    data = import_odb_zip(in_path, board_id, board_name)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({
        'out': str(out),
        'board': data['board'],
        'components': len(data['components']),
        'nets': len(data['nets']),
        'geometryArrayCounts': data['importMetadata']['stats']['geometryArrayCounts'],
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
