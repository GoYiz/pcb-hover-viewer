from __future__ import annotations

import json
import math
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Iterable

ROOT = Path('/var/minis/workspace/pcb-hover-viewer')
RAW_DIR = ROOT / 'data' / 'raw'
OUT_DIR = ROOT / 'public' / 'examples'


def mm_factor(unit: str) -> float:
    u = (unit or 'mm').strip().lower()
    if u in {'mm', 'millimeter', 'millimeters'}:
        return 1.0
    if u in {'um', 'micron', 'microns'}:
        return 0.001
    if u in {'mil', 'mils'}:
        return 0.0254
    if u in {'inch', 'in', 'inches'}:
        return 25.4
    return 1.0


def strip_ns(tag: str) -> str:
    return tag.split('}', 1)[-1]


def iter_elems(root: ET.Element, names: set[str]) -> Iterable[ET.Element]:
    for el in root.iter():
        if strip_ns(el.tag) in names:
            yield el


def pick_attr(el: ET.Element, *names: str) -> str | None:
    attrs = {strip_ns(k): v for k, v in el.attrib.items()}
    for n in names:
        if n in attrs and attrs[n] != '':
            return attrs[n]
    return None


def to_float(v: str | None, default: float = 0.0) -> float:
    if v is None:
        return default
    try:
        return float(v)
    except Exception:
        m = re.search(r'-?\d+(?:\.\d+)?', str(v))
        return float(m.group(0)) if m else default


def parse_polyline_points(el: ET.Element, scale: float) -> list[list[float]]:
    pts: list[list[float]] = []
    attrs = {strip_ns(k): v for k, v in el.attrib.items()}
    if 'points' in attrs:
        nums = [float(x) for x in re.findall(r'-?\d+(?:\.\d+)?', attrs['points'])]
        for i in range(0, len(nums) - 1, 2):
            pts.append([round(nums[i] * scale, 4), round(nums[i + 1] * scale, 4)])
    if pts:
        return pts
    for child in el:
        ctag = strip_ns(child.tag)
        if ctag not in {'Pt', 'Point', 'Coord', 'Vertex'}:
            continue
        x = to_float(pick_attr(child, 'x', 'X')) * scale
        y = to_float(pick_attr(child, 'y', 'Y')) * scale
        pts.append([round(x, 4), round(y, 4)])
    return pts


def arc_to_polyline(x1: float, y1: float, x2: float, y2: float, cx: float, cy: float, clockwise: bool, segments: int = 16):
    a1 = math.atan2(y1 - cy, x1 - cx)
    a2 = math.atan2(y2 - cy, x2 - cx)
    if clockwise and a2 > a1:
        a2 -= math.tau
    if not clockwise and a2 < a1:
        a2 += math.tau
    r = math.hypot(x1 - cx, y1 - cy)
    pts = []
    for i in range(segments + 1):
        t = a1 + (a2 - a1) * i / segments
        pts.append([round(cx + math.cos(t) * r, 4), round(cy + math.sin(t) * r, 4)])
    return pts


def build_bbox_from_points(points: list[list[float]]):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    return [round(min_x, 4), round(min_y, 4), round(max_x - min_x, 4), round(max_y - min_y, 4)]


def rotate_point(x: float, y: float, deg: float):
    r = math.radians(deg)
    return x * math.cos(r) - y * math.sin(r), x * math.sin(r) + y * math.cos(r)


def circle_path(cx: float, cy: float, d: float, segments: int = 16):
    r = max(d, 0.2) / 2
    pts = []
    for i in range(segments + 1):
        t = math.tau * i / segments
        pts.append([round(cx + math.cos(t) * r, 4), round(cy + math.sin(t) * r, 4)])
    return pts


def parse_poly_steps(poly: ET.Element, scale: float):
    pts: list[list[float]] = []
    for child in poly:
        tag = strip_ns(child.tag)
        if tag == 'PolyBegin':
            x = to_float(pick_attr(child, 'x', 'X')) * scale
            y = to_float(pick_attr(child, 'y', 'Y')) * scale
            pts.append([round(x, 4), round(y, 4)])
        elif tag == 'PolyStepSegment':
            x = to_float(pick_attr(child, 'x', 'X')) * scale
            y = to_float(pick_attr(child, 'y', 'Y')) * scale
            pts.append([round(x, 4), round(y, 4)])
        elif tag == 'PolyStepCurve' and pts:
            x1, y1 = pts[-1]
            x2 = to_float(pick_attr(child, 'x', 'X')) * scale
            y2 = to_float(pick_attr(child, 'y', 'Y')) * scale
            cx = to_float(pick_attr(child, 'centerX', 'CenterX', 'cx', 'CX')) * scale
            cy = to_float(pick_attr(child, 'centerY', 'CenterY', 'cy', 'CY')) * scale
            cw = str(pick_attr(child, 'clockwise', 'Clockwise', 'cw', 'CW') or '').lower() in {'1', 'true', 'yes'}
            arc_pts = arc_to_polyline(x1, y1, x2, y2, cx, cy, cw, segments=12)
            pts.extend(arc_pts[1:])
    return pts


def append_trace(traces, coords, trace_index, net_id, layer_id, width, path):
    if len(path) < 2:
        return trace_index
    traces.append({
        'id': f'T{trace_index}',
        'netId': str(net_id),
        'layerId': str(layer_id),
        'width': round(width or 0.15, 4),
        'path': path,
    })
    coords.extend((px, py) for px, py in path)
    return trace_index + 1


def parse_ipc2581(path: Path, board_id: str, board_name: str):
    tree = ET.parse(path)
    root = tree.getroot()

    unit = 'mm'
    for el in root.iter():
        attrs = {strip_ns(k): v for k, v in el.attrib.items()}
        for key in ('units', 'Units', 'unit', 'Unit'):
            if key in attrs:
                unit = attrs[key]
                break
        if unit != 'mm':
            break
    scale = mm_factor(unit)

    layers = []
    layer_seen = set()
    for el in iter_elems(root, {'Layer', 'LayerRef'}):
        name = pick_attr(el, 'name', 'Name', 'layerName', 'LayerName')
        if not name:
            continue
        if name in layer_seen:
            continue
        layer_seen.add(name)
        layers.append({'id': name, 'name': name, 'zIndex': len(layers) + 1})
    if not layers:
        layers = [{'id': 'F.Cu', 'name': 'F.Cu', 'zIndex': 1}, {'id': 'B.Cu', 'name': 'B.Cu', 'zIndex': 2}]

    net_map: dict[str, str] = {}
    comp_pin_nets: dict[str, set[str]] = {}
    for el in iter_elems(root, {'Net', 'LogicalNet'}):
        nid = pick_attr(el, 'id', 'ID', 'name', 'Name')
        name = pick_attr(el, 'name', 'Name', 'netName', 'NetName') or nid
        if nid:
            net_map[str(nid)] = str(name)
        for child in el.iter():
            if strip_ns(child.tag) != 'PinRef':
                continue
            cref = pick_attr(child, 'componentRef', 'ComponentRef', 'compRef', 'CompRef')
            if cref and nid:
                comp_pin_nets.setdefault(str(cref), set()).add(str(nid))

    pad_defs: dict[str, tuple[float, float]] = {}
    for el in iter_elems(root, {'EntryStandard'}):
        eid = pick_attr(el, 'id', 'ID')
        if not eid:
            continue
        w = h = None
        for child in el:
            tag = strip_ns(child.tag)
            if tag == 'RectCenter':
                w = to_float(pick_attr(child, 'width', 'Width')) * scale
                h = to_float(pick_attr(child, 'height', 'Height')) * scale
                break
            if tag == 'Oval':
                w = to_float(pick_attr(child, 'width', 'Width')) * scale
                h = to_float(pick_attr(child, 'height', 'Height')) * scale
                break
            if tag == 'Circle':
                d = to_float(pick_attr(child, 'diameter', 'Diameter')) * scale
                w = h = d
                break
        if w and h:
            pad_defs[str(eid)] = (w, h)

    package_map: dict[str, list[tuple[float, float, float, float]]] = {}
    for el in iter_elems(root, {'Package'}):
        pname = pick_attr(el, 'name', 'Name')
        if not pname:
            continue
        rects = []
        for child in el:
            if strip_ns(child.tag) != 'Pin':
                continue
            px = to_float(pick_attr(child, 'x', 'X')) * scale
            py = to_float(pick_attr(child, 'y', 'Y')) * scale
            pref = pick_attr(child, 'padstackDefRef', 'PadstackDefRef')
            w, h = pad_defs.get(str(pref), (0.8, 0.8))
            rects.append((px - w / 2, py - h / 2, px + w / 2, py + h / 2))
        if rects:
            package_map[str(pname)] = rects

    components = []
    coords = []
    for el in iter_elems(root, {'Component', 'CompInstance', 'Placement', 'ComponentInstance'}):
        ref = pick_attr(el, 'refDes', 'RefDes', 'name', 'Name', 'id', 'ID')
        if not ref:
            continue
        x = to_float(pick_attr(el, 'x', 'X', 'locX', 'LocationX')) * scale
        y = to_float(pick_attr(el, 'y', 'Y', 'locY', 'LocationY')) * scale
        rot = to_float(pick_attr(el, 'rotation', 'Rotation', 'angle', 'Angle'))
        fp = pick_attr(el, 'packageRef', 'PackageRef', 'part', 'Part')
        xform = next((c for c in el if strip_ns(c.tag) == 'Xform'), None)
        if xform is not None:
            x = to_float(pick_attr(xform, 'x', 'X')) * scale or x
            y = to_float(pick_attr(xform, 'y', 'Y')) * scale or y
            rot = to_float(pick_attr(xform, 'rotation', 'Rotation')) or rot
        net_ids = sorted(comp_pin_nets.get(str(ref), set()))
        if not net_ids:
            tmp = []
            for child in el.iter():
                net_id = pick_attr(child, 'net', 'Net', 'netRef', 'NetRef')
                if net_id:
                    tmp.append(str(net_id))
            net_ids = sorted(set(tmp))
        if fp and fp in package_map:
            xs = []
            ys = []
            for x1, y1, x2, y2 in package_map[fp]:
                corners = [(x1,y1),(x2,y1),(x2,y2),(x1,y2)]
                for cx, cy in corners:
                    rx, ry = rotate_point(cx, cy, rot)
                    xs.append(x + rx)
                    ys.append(y + ry)
            bbox = [round(min(xs),4), round(min(ys),4), round(max(xs)-min(xs),4), round(max(ys)-min(ys),4)]
        else:
            bbox = [round(x - 0.7, 4), round(y - 0.5, 4), 1.4, 1.0]
        components.append({
            'id': str(ref),
            'refdes': str(ref),
            'x': round(x, 4),
            'y': round(y, 4),
            'rotation': round(rot, 4),
            'bbox': bbox,
            'footprint': fp,
            'nets': [{'id': nid, 'name': net_map.get(nid, nid)} for nid in net_ids],
        })
        coords.append((x, y))

    traces = []
    trace_index = 1

    for profile in iter_elems(root, {'Profile'}):
        for child in profile:
            if strip_ns(child.tag) != 'Polygon':
                continue
            path = parse_poly_steps(child, scale)
            if path and path[0] != path[-1]:
                path.append(path[0])
            trace_index = append_trace(traces, coords, trace_index, '$BOARD$', 'BOARD_EDGE', 0.1, path)

    for lf in iter_elems(root, {'LayerFeature'}):
        layer_id = pick_attr(lf, 'layerRef', 'LayerRef', 'layer', 'Layer') or layers[0]['id']
        for set_el in lf:
            if strip_ns(set_el.tag) != 'Set':
                continue
            net_id = pick_attr(set_el, 'net', 'Net', 'netRef', 'NetRef') or 'UNKNOWN'
            for child in set_el:
                tag = strip_ns(child.tag)
                if tag in {'Line', 'Segment'}:
                    width = to_float(pick_attr(child, 'width', 'Width', 'lineWidth', 'LineWidth'), 0.15) * scale
                    x1 = to_float(pick_attr(child, 'x1', 'X1', 'startX', 'StartX')) * scale
                    y1 = to_float(pick_attr(child, 'y1', 'Y1', 'startY', 'StartY')) * scale
                    x2 = to_float(pick_attr(child, 'x2', 'X2', 'endX', 'EndX')) * scale
                    y2 = to_float(pick_attr(child, 'y2', 'Y2', 'endY', 'EndY')) * scale
                    path = [[round(x1, 4), round(y1, 4)], [round(x2, 4), round(y2, 4)]]
                    trace_index = append_trace(traces, coords, trace_index, net_id, layer_id, width, path)
                elif tag == 'Arc':
                    width = to_float(pick_attr(child, 'width', 'Width', 'lineWidth', 'LineWidth'), 0.15) * scale
                    x1 = to_float(pick_attr(child, 'x1', 'X1', 'startX', 'StartX')) * scale
                    y1 = to_float(pick_attr(child, 'y1', 'Y1', 'startY', 'StartY')) * scale
                    x2 = to_float(pick_attr(child, 'x2', 'X2', 'endX', 'EndX')) * scale
                    y2 = to_float(pick_attr(child, 'y2', 'Y2', 'endY', 'EndY')) * scale
                    cx = to_float(pick_attr(child, 'cx', 'CX', 'centerX', 'CenterX')) * scale
                    cy = to_float(pick_attr(child, 'cy', 'CY', 'centerY', 'CenterY')) * scale
                    cw = str(pick_attr(child, 'clockwise', 'Clockwise', 'cw', 'CW') or '').lower() in {'1', 'true', 'yes'}
                    path = arc_to_polyline(x1, y1, x2, y2, cx, cy, cw)
                    trace_index = append_trace(traces, coords, trace_index, net_id, layer_id, width, path)
                elif tag in {'Polyline', 'Path'}:
                    width = to_float(pick_attr(child, 'width', 'Width', 'lineWidth', 'LineWidth'), 0.15) * scale
                    path = parse_polyline_points(child, scale)
                    trace_index = append_trace(traces, coords, trace_index, net_id, layer_id, width, path)
                elif tag == 'Polygon':
                    path = parse_poly_steps(child, scale)
                    if path and path[0] != path[-1]:
                        path.append(path[0])
                    trace_index = append_trace(traces, coords, trace_index, net_id, layer_id, 0.1, path)
                elif tag == 'Pad':
                    x = to_float(pick_attr(child, 'x', 'X')) * scale
                    y = to_float(pick_attr(child, 'y', 'Y')) * scale
                    pref = pick_attr(child, 'padstackDefRef', 'PadstackDefRef')
                    w, h = pad_defs.get(str(pref), (0.8, 0.8))
                    path = circle_path(x, y, max(w, h))
                    trace_index = append_trace(traces, coords, trace_index, net_id, layer_id, max(w, h), path)

    if not coords:
        coords = [(0.0, 0.0), (100.0, 60.0)]

    min_x = min(x for x, _ in coords)
    max_x = max(x for x, _ in coords)
    min_y = min(y for _, y in coords)
    max_y = max(y for _, y in coords)
    pad = 5.0
    width_mm = max(20.0, max_x - min_x + pad * 2)
    height_mm = max(20.0, max_y - min_y + pad * 2)

    def shift_point(pt):
        return [round(pt[0] - min_x + pad, 4), round(pt[1] - min_y + pad, 4)]

    for c in components:
        c['x'] = round(c['x'] - min_x + pad, 4)
        c['y'] = round(c['y'] - min_y + pad, 4)
        c['bbox'][0] = round(c['bbox'][0] - min_x + pad, 4)
        c['bbox'][1] = round(c['bbox'][1] - min_y + pad, 4)
    for t in traces:
        t['path'] = [shift_point(pt) for pt in t['path']]

    nets = [{'id': nid, 'name': name} for nid, name in sorted(net_map.items())]
    if not nets:
        seen = sorted(set(t['netId'] for t in traces))
        nets = [{'id': nid, 'name': nid} for nid in seen]

    return {
        'board': {
            'id': board_id,
            'name': board_name,
            'version': 'imported-ipc2581',
            'widthMm': round(width_mm, 2),
            'heightMm': round(height_mm, 2),
        },
        'layers': layers,
        'components': components,
        'traces': traces,
        'nets': nets,
    }


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def main():
    if len(sys.argv) < 4:
        print('usage: python import_ipc2581.py <input.xml|url> <board_id> <board_name> [output.json]')
        raise SystemExit(1)
    src = sys.argv[1]
    board_id = sys.argv[2]
    board_name = sys.argv[3]
    out = Path(sys.argv[4]) if len(sys.argv) > 4 else OUT_DIR / f'{board_id}.json'
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    out.parent.mkdir(parents=True, exist_ok=True)

    if src.startswith('http://') or src.startswith('https://'):
        raw = fetch(src)
        raw_path = RAW_DIR / f'{board_id}.xml'
        raw_path.write_bytes(raw)
        in_path = raw_path
    else:
        in_path = Path(src)

    data = parse_ipc2581(in_path, board_id, board_name)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({
        'out': str(out),
        'board': data['board'],
        'components': len(data['components']),
        'traces': len(data['traces']),
        'nets': len(data['nets']),
    }, ensure_ascii=False))

if __name__ == '__main__':
    main()
