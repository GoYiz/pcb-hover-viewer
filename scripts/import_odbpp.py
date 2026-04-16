from __future__ import annotations
import json, re, sys, urllib.request, zipfile
from pathlib import Path
ROOT = Path('/var/minis/workspace/pcb-hover-viewer')
RAW_DIR = ROOT / 'data' / 'raw'
OUT_DIR = ROOT / 'public' / 'examples'

def parse_matrix(text: str):
    layers=[]; block=None
    for line in text.splitlines():
        s=line.strip()
        if s=='LAYER {': block={}; continue
        if s=='}':
            if block and block.get('TYPE')=='SIGNAL':
                name=block.get('NAME','')
                layers.append({'id':name,'name':name,'zIndex':len(layers)+1})
            block=None; continue
        if block is not None and '=' in s:
            k,v=s.split('=',1); block[k.strip()]=v.strip()
    return layers

def parse_profile(text: str):
    xs=[]; ys=[]
    for line in text.splitlines():
        s=line.strip()
        if not s or s.startswith('#'): continue
        parts=s.split()
        if parts[0] in {'OS','OC','OB'} and len(parts)>=3:
            xs.append(float(parts[1])); ys.append(float(parts[2]))
    if not xs: return 100.0,60.0,0.0,0.0
    return max(xs)-min(xs), max(ys)-min(ys), min(xs), min(ys)

def parse_netlist(text: str):
    net_map={}
    for line in text.splitlines():
        s=line.strip()
        m=re.match(r'^\$(\d+)\s+(.+)$', s)
        if m: net_map[m.group(1)] = m.group(2).strip()
    return net_map

def parse_components(text: str, min_x: float, min_y: float, pad: float, net_map: dict[str,str]):
    comps=[]; current=None; nets=set(); pin_pts=[]
    for line in text.splitlines():
        s=line.strip()
        if s.startswith('# CMP'):
            if current:
                if pin_pts:
                    xs=[x for x,_ in pin_pts]; ys=[y for _,y in pin_pts]
                    current['bbox']=[round(min(xs)-0.35,4), round(min(ys)-0.35,4), round(max(xs)-min(xs)+0.7,4), round(max(ys)-min(ys)+0.7,4)]
                current['nets']=[{'id':nid,'name':net_map.get(nid,nid)} for nid in sorted(nets)]
                comps.append(current)
            current=None; nets=set(); pin_pts=[]; continue
        if s.startswith('CMP '):
            parts=s.split()
            if len(parts)>=7:
                x=float(parts[2])-min_x+pad; y=float(parts[3])-min_y+pad; rot=float(parts[4]); refdes=parts[6]; value=parts[7] if len(parts)>7 else ''
                current={'id':refdes,'refdes':refdes,'x':round(x,4),'y':round(y,4),'rotation':round(rot,4),'bbox':[round(x-0.7,4),round(y-0.5,4),1.4,1.0],'nets':[],'footprint':value or None}
            continue
        if s.startswith('TOP ') and current:
            parts=s.split()
            if len(parts)>=8:
                try:
                    px=float(parts[2])-min_x+pad; py=float(parts[3])-min_y+pad
                    pin_pts.append((px,py))
                except Exception:
                    pass
                net_id=parts[-1]
                if net_id.isdigit() and net_id!='0': nets.add(net_id)
    if current:
        if pin_pts:
            xs=[x for x,_ in pin_pts]; ys=[y for _,y in pin_pts]
            current['bbox']=[round(min(xs)-0.35,4), round(min(ys)-0.35,4), round(max(xs)-min(xs)+0.7,4), round(max(ys)-min(ys)+0.7,4)]
        current['nets']=[{'id':nid,'name':net_map.get(nid,nid)} for nid in sorted(nets)]
        comps.append(current)
    return comps

def parse_features(text: str, layer_name: str, min_x: float, min_y: float, pad: float, net_map: dict[str,str], start_idx: int):
    traces=[]; idx=start_idx
    for line in text.splitlines():
        s=line.strip()
        if not s or s.startswith('#') or s.startswith('$') or s.startswith('@') or s.startswith('&'): continue
        parts=s.split()
        if parts[0]=='L' and len(parts)>=7:
            x1=float(parts[1])-min_x+pad; y1=float(parts[2])-min_y+pad; x2=float(parts[3])-min_x+pad; y2=float(parts[4])-min_y+pad
            sym=parts[5]
            net_id=parts[7] if len(parts)>=8 and parts[7].isdigit() else 'UNKNOWN'
            width=0.254 if sym=='7' else 0.15
            traces.append({'id':f'T{idx}','netId':net_map.get(net_id, net_id),'layerId':layer_name,'width':round(width,4),'path':[[round(x1,4),round(y1,4)],[round(x2,4),round(y2,4)]]})
            idx+=1
    return traces, idx

def import_odb_zip(zip_path: Path, board_id: str, board_name: str):
    z=zipfile.ZipFile(zip_path)
    read=lambda name: z.read(name).decode('utf-8','ignore')
    layers=parse_matrix(read('odb/matrix/matrix'))
    width,height,min_x,min_y=parse_profile(read('odb/steps/pcb/profile'))
    net_map=parse_netlist(read('odb/steps/pcb/netlists/cadnet/netlist'))
    pad=5.0
    components=parse_components(read('odb/steps/pcb/layers/comp_+_top/components'), min_x, min_y, pad, net_map)
    traces=[]; trace_idx=1
    for layer in layers:
        feature_path=f"odb/steps/pcb/layers/{layer['name'].lower()}/features"
        if feature_path not in z.namelist(): continue
        t, trace_idx = parse_features(read(feature_path), layer['name'], min_x, min_y, pad, net_map, trace_idx)
        traces.extend(t)
    nets=[{'id':k,'name':v} for k,v in sorted(net_map.items()) if k!='0']
    return {'board':{'id':board_id,'name':board_name,'version':'imported-odbpp','widthMm':round(width+pad*2,2),'heightMm':round(height+pad*2,2)},'layers':layers or [{'id':'TOP_LAYER','name':'TOP_LAYER','zIndex':1},{'id':'BOTTOM_LAYER','name':'BOTTOM_LAYER','zIndex':2}],'components':components,'traces':traces,'nets':nets}

def fetch(url:str)->bytes:
    req=urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as resp: return resp.read()

def main():
    if len(sys.argv)<4:
        print('usage: python import_odbpp.py <input.zip|url> <board_id> <board_name> [output.json]'); raise SystemExit(1)
    src=sys.argv[1]; board_id=sys.argv[2]; board_name=sys.argv[3]; out=Path(sys.argv[4]) if len(sys.argv)>4 else OUT_DIR / f'{board_id}.json'
    RAW_DIR.mkdir(parents=True, exist_ok=True); out.parent.mkdir(parents=True, exist_ok=True)
    if src.startswith('http://') or src.startswith('https://'):
        raw=fetch(src); in_path=RAW_DIR / f'{board_id}.zip'; in_path.write_bytes(raw)
    else:
        in_path=Path(src)
    data=import_odb_zip(in_path, board_id, board_name)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'out':str(out),'board':data['board'],'components':len(data['components']),'traces':len(data['traces']),'nets':len(data['nets'])}, ensure_ascii=False))
if __name__=='__main__':
    main()
