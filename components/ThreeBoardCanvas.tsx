"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { ComponentItem, TraceItem } from "@/types/pcb";
import type { HoverFeatureType } from "@/store/viewerStore";

type Props = {
  width: number;
  height: number;
  boardWidthMm: number;
  boardHeightMm: number;
  components: ComponentItem[];
  traces: TraceItem[];
  zones?: TraceItem[];
  vias?: TraceItem[];
  pads?: TraceItem[];
  keepouts?: TraceItem[];
  silkscreen?: TraceItem[];
  documentation?: TraceItem[];
  mechanical?: TraceItem[];
  graphics?: TraceItem[];
  drills?: TraceItem[];
  boardOutlines?: TraceItem[];
  visibleDetail?: string[];
  visibleLayers?: string[];
  focusComponentId?: string;
  hoveredId?: string;
  hoveredType?: HoverFeatureType;
  directIds: string[];
  traceHighlightIds: string[];
  selectedComponentIds?: string[];
  selectedTraceIds?: string[];
  selectedOverlayKind?: Exclude<HoverFeatureType, 'component' | 'trace'>;
  selectedOverlayId?: string;
  overlayHighlightKeys?: string[];
  onHoverFeature: (type?: HoverFeatureType, id?: string) => void;
  onSelectFeature?: (type?: HoverFeatureType, id?: string) => void;
};

type SceneRefs = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  board: THREE.Mesh;
  hoverables: THREE.Object3D[];
  compMap: Map<string, THREE.Mesh>;
  traceMap: Map<string, THREE.Line>;
  overlayObjects: THREE.Object3D[];
  orbit: {
    yaw: number;
    pitch: number;
    radius: number;
    baseRadius: number;
  };
  rafId?: number;
};

const DEFAULT_VISIBLE_DETAIL = [
  "grid",
  "components",
  "labels",
  "measures",
  "zones",
  "vias",
  "pads",
  "keepouts",
  "silkscreen",
  "documentation",
  "mechanical",
  "graphics",
  "drills",
  "boardOutlines",
];

function xy(x: number, y: number, bw: number, bh: number) {
  return new THREE.Vector3(x - bw / 2, -(y - bh / 2), 0);
}

function setCompColor(mesh: THREE.Mesh, mode: "normal" | "related" | "selected" | "target") {
  const mat = mesh.material as THREE.MeshStandardMaterial;
  if (mode === "target") mat.color.set("#f43f5e");
  else if (mode === "selected") mat.color.set("#f59e0b");
  else if (mode === "related") mat.color.set("#22d3ee");
  else mat.color.set("#94a3b8");
  mat.emissive.set(mode === "target" ? "#7f1d1d" : mode === "selected" ? "#78350f" : mode === "related" ? "#164e63" : "#0f172a");
}

function setTraceColor(line: THREE.Line, mode: "normal" | "related" | "selected" | "target") {
  const mat = line.material as THREE.LineBasicMaterial;
  if (mode === "target") {
    mat.color.set("#f43f5e");
    mat.opacity = 1;
  } else if (mode === "selected") {
    mat.color.set("#f59e0b");
    mat.opacity = 1;
  } else if (mode === "related") {
    mat.color.set("#22d3ee");
    mat.opacity = 1;
  } else {
    mat.color.set("#3b82f6");
    mat.opacity = 0.4;
  }
  mat.transparent = true;
}

function layerMatchesVisible(layerId: unknown, visibleLayers: string[]) {
  const value = String(layerId || "");
  if (!value) return true;
  if (value === "F.Cu" || value === "B.Cu") return visibleLayers.length ? visibleLayers.includes(value) : true;
  return true;
}

function pathBounds(item: TraceItem) {
  const pts = item.path || [];
  if (!pts.length) return null;
  let minX = pts[0][0];
  let maxX = pts[0][0];
  let minY = pts[0][1];
  let maxY = pts[0][1];
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(0.4, maxX - minX),
    height: Math.max(0.4, maxY - minY),
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

function buildOverlayLine(item: TraceItem, bw: number, bh: number, color: string, opacity: number, z: number) {
  const pts = (item.path || []).map(([x, y]) => xy(x, y, bw, bh));
  if (pts.length < 2) return null;
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const line = new THREE.Line(geo, mat);
  line.position.z = z;
  return line;
}

function buildPadMesh(item: TraceItem, bw: number, bh: number, color: string, z: number) {
  const bounds = pathBounds(item);
  if (!bounds) return null;
  const geo = new THREE.BoxGeometry(bounds.width, bounds.height, 0.45);
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.32, roughness: 0.28, metalness: 0.38, transparent: true, opacity: 0.9 });
  const mesh = new THREE.Mesh(geo, mat);
  const p = xy(bounds.cx, bounds.cy, bw, bh);
  mesh.position.set(p.x, p.y, z);
  return mesh;
}

function buildCylinderMarker(item: TraceItem, bw: number, bh: number, color: string, z: number, depth: number, opacity: number) {
  const bounds = pathBounds(item);
  if (!bounds) return null;
  const radius = Math.max(bounds.width, bounds.height) / 2;
  const geo = new THREE.CylinderGeometry(Math.max(0.2, radius), Math.max(0.2, radius), depth, 20);
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.22, roughness: 0.36, metalness: 0.18, transparent: true, opacity });
  const mesh = new THREE.Mesh(geo, mat);
  const p = xy(bounds.cx, bounds.cy, bw, bh);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(p.x, p.y, z);
  return mesh;
}

export default function ThreeBoardCanvas({
  width,
  height,
  boardWidthMm,
  boardHeightMm,
  components,
  traces,
  zones = [],
  vias = [],
  pads = [],
  keepouts = [],
  silkscreen = [],
  documentation = [],
  mechanical = [],
  graphics = [],
  drills = [],
  boardOutlines = [],
  visibleDetail,
  visibleLayers = ["F.Cu", "B.Cu"],
  focusComponentId,
  hoveredId,
  hoveredType,
  directIds,
  traceHighlightIds,
  selectedComponentIds = [],
  selectedTraceIds = [],
  selectedOverlayKind,
  selectedOverlayId,
  overlayHighlightKeys = [],
  onHoverFeature,
  onSelectFeature,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const refs = useRef<SceneRefs | null>(null);
  const onHoverRef = useRef(onHoverFeature);
  const effectiveVisibleDetail = visibleDetail && visibleDetail.length ? visibleDetail : DEFAULT_VISIBLE_DETAIL;
  const visibleDetailKey = effectiveVisibleDetail.join(",");
  const [bridgeState, setBridgeState] = useState({
    tool: "orbit",
    zoom: 1,
    ox: 0,
    oy: 0,
    sc: [] as string[],
    st: [] as string[],
    sf: "all",
    vd: visibleDetailKey,
    lm: "three-orbit",
    gm: "perspective",
    th: "three-raycaster",
    le: "-",
  });

  useEffect(() => {
    onHoverRef.current = onHoverFeature;
  }, [onHoverFeature]);

  useEffect(() => {
    if (!hostRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#071025");

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    hostRef.current.innerHTML = "";
    hostRef.current.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    const dir = new THREE.DirectionalLight(0xffffff, 0.7);
    dir.position.set(80, -120, 160);
    const rim = new THREE.PointLight(0x22d3ee, 0.45, 800);
    rim.position.set(-120, 80, 120);
    scene.add(ambient, dir, rim);

    const boardGeo = new THREE.BoxGeometry(boardWidthMm, boardHeightMm, 2.2);
    const boardMat = new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.65, metalness: 0.15 });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.z = -1.2;
    scene.add(board);

    const baseRadius = Math.max(boardWidthMm, boardHeightMm) * 1.2;
    const refsObj: SceneRefs = {
      scene,
      camera,
      renderer,
      board,
      hoverables: [],
      compMap: new Map(),
      traceMap: new Map(),
      overlayObjects: [],
      orbit: {
        yaw: 0,
        pitch: 0.85,
        radius: baseRadius,
        baseRadius,
      },
    };
    refs.current = refsObj;

    let dragging = false;
    let moved = false;
    let lx = 0;
    let ly = 0;

    const syncOrbitBridge = () => {
      const orbit = refsObj.orbit;
      setBridgeState((prev) => ({
        ...prev,
        tool: "orbit",
        zoom: Number((orbit.baseRadius / orbit.radius).toFixed(3)),
        ox: Number(orbit.yaw.toFixed(3)),
        oy: Number(orbit.pitch.toFixed(3)),
      }));
    };

    const updateCamera = () => {
      const orbit = refsObj.orbit;
      const cx = orbit.radius * Math.cos(orbit.pitch) * Math.sin(orbit.yaw);
      const cy = -orbit.radius * Math.cos(orbit.pitch) * Math.cos(orbit.yaw);
      const cz = orbit.radius * Math.sin(orbit.pitch);
      camera.position.set(cx, cy, cz);
      camera.lookAt(0, 0, 0);
      syncOrbitBridge();
    };

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const pointerMove = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const py = ev.clientY - rect.top;

      if (dragging) {
        const dx = px - lx;
        const dy = py - ly;
        lx = px;
        ly = py;
        if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
        refsObj.orbit.yaw -= dx * 0.006;
        refsObj.orbit.pitch = Math.max(0.2, Math.min(1.4, refsObj.orbit.pitch + dy * 0.004));
        updateCamera();
        return;
      }

      mouse.x = (px / rect.width) * 2 - 1;
      mouse.y = -(py / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hit = raycaster.intersectObjects(refsObj.hoverables, false)[0];
      if (!hit) {
        onHoverRef.current(undefined, undefined);
        return;
      }
      const obj = hit.object as THREE.Object3D & { userData: { kind?: HoverFeatureType; id?: string } };
      const kind = obj.userData.kind;
      const id = obj.userData.id;
      if (kind && id) onHoverRef.current(kind, id);
    };

    const pointerDown = (ev: PointerEvent) => {
      dragging = true;
      moved = false;
      const rect = renderer.domElement.getBoundingClientRect();
      lx = ev.clientX - rect.left;
      ly = ev.clientY - rect.top;
    };

    const pointerUp = (ev: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (moved) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const py = ev.clientY - rect.top;
      mouse.x = (px / rect.width) * 2 - 1;
      mouse.y = -(py / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hit = raycaster.intersectObjects(refsObj.hoverables, false)[0];
      const obj = hit?.object as THREE.Object3D & { userData?: { kind?: HoverFeatureType; id?: string } };
      if (obj?.userData?.kind && obj?.userData?.id) onSelectFeature?.(obj.userData.kind, obj.userData.id);
      else onSelectFeature?.(undefined, undefined);
    };

    const wheel = (ev: WheelEvent) => {
      ev.preventDefault();
      refsObj.orbit.radius *= ev.deltaY < 0 ? 0.92 : 1.08;
      refsObj.orbit.radius = Math.max(Math.max(boardWidthMm, boardHeightMm) * 0.55, Math.min(refsObj.orbit.radius, Math.max(boardWidthMm, boardHeightMm) * 2.6));
      updateCamera();
    };

    renderer.domElement.addEventListener("pointermove", pointerMove);
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    window.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("wheel", wheel, { passive: false });

    updateCamera();

    const animate = () => {
      refsObj.rafId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      if (refsObj.rafId) cancelAnimationFrame(refsObj.rafId);
      renderer.domElement.removeEventListener("pointermove", pointerMove);
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      window.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("wheel", wheel);
      renderer.dispose();
      scene.clear();
      refs.current = null;
      if (hostRef.current) hostRef.current.innerHTML = "";
    };
  }, [width, height, boardWidthMm, boardHeightMm, onHoverFeature, onSelectFeature]);

  useEffect(() => {
    const r = refs.current;
    if (!r) return;

    for (const m of r.compMap.values()) r.scene.remove(m);
    for (const l of r.traceMap.values()) r.scene.remove(l);
    for (const obj of r.overlayObjects) r.scene.remove(obj);
    r.compMap.clear();
    r.traceMap.clear();
    r.overlayObjects = [];
    r.hoverables = [];

    const detailSet = new Set(effectiveVisibleDetail);
    const showComponents = detailSet.has("components");

    for (const t of traces) {
      if (!layerMatchesVisible(t.layerId, visibleLayers)) continue;
      const pts = (t.path || []).map(([x, y]) => xy(x, y, boardWidthMm, boardHeightMm));
      if (pts.length < 2) continue;
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: "#38bdf8", transparent: true, opacity: 0.52 });
      const line = new THREE.Line(geo, mat);
      line.position.z = 0.25;
      line.userData = { kind: "trace", id: t.id };
      r.scene.add(line);
      r.traceMap.set(t.id, line);
      r.hoverables.push(line);
    }

    const overlayLineBuckets = [
      { key: "zones", items: zones, color: "#60a5fa", opacity: 0.42, z: 0.22 },
      { key: "keepouts", items: keepouts, color: "#ef4444", opacity: 0.88, z: 0.56 },
      { key: "silkscreen", items: silkscreen, color: "#f8fafc", opacity: 0.92, z: 0.7 },
      { key: "boardOutlines", items: boardOutlines, color: "#a78bfa", opacity: 0.96, z: 0.84 },
      { key: "documentation", items: documentation, color: "#4ade80", opacity: 0.52, z: 0.96 },
      { key: "mechanical", items: mechanical, color: "#fb7185", opacity: 0.72, z: 1.08 },
      { key: "graphics", items: graphics, color: "#cbd5e1", opacity: 0.48, z: 1.18 },
    ] as const;

    for (const bucket of overlayLineBuckets) {
      if (!detailSet.has(bucket.key)) continue;
      for (const item of bucket.items) {
        if ((bucket.key === "zones") && !layerMatchesVisible(item.layerId, visibleLayers)) continue;
        const line = buildOverlayLine(item, boardWidthMm, boardHeightMm, bucket.color, bucket.opacity, bucket.z);
        if (!line) continue;
        line.userData = { kind: bucket.key as HoverFeatureType, id: item.id };
        r.scene.add(line);
        r.overlayObjects.push(line);
        r.hoverables.push(line);
      }
    }

    if (detailSet.has("pads")) {
      for (const item of pads) {
        if (!layerMatchesVisible(item.layerId, visibleLayers)) continue;
        const mesh = buildPadMesh(item, boardWidthMm, boardHeightMm, "#fbbf24", 0.5);
        if (!mesh) continue;
        mesh.userData = { kind: "pads" as HoverFeatureType, id: item.id };
        r.scene.add(mesh);
        r.overlayObjects.push(mesh);
        r.hoverables.push(mesh);
      }
    }

    if (detailSet.has("vias")) {
      for (const item of vias) {
        if (!layerMatchesVisible(item.layerId, visibleLayers)) continue;
        const mesh = buildCylinderMarker(item, boardWidthMm, boardHeightMm, "#22d3ee", 0.84, 1.0, 0.9);
        if (!mesh) continue;
        mesh.userData = { kind: "vias" as HoverFeatureType, id: item.id };
        r.scene.add(mesh);
        r.overlayObjects.push(mesh);
        r.hoverables.push(mesh);
      }
    }

    if (detailSet.has("drills")) {
      for (const item of drills) {
        const mesh = buildCylinderMarker(item, boardWidthMm, boardHeightMm, "#94a3b8", 0.16, 0.8, 0.84);
        if (!mesh) continue;
        mesh.userData = { kind: "drills" as HoverFeatureType, id: item.id };
        r.scene.add(mesh);
        r.overlayObjects.push(mesh);
        r.hoverables.push(mesh);
      }
    }

    if (showComponents) {
      for (const c of components) {
        const [bx, by, bw, bh] = c.bbox;
        const cx = bx + bw / 2;
        const cy = by + bh / 2;
        const geo = new THREE.BoxGeometry(Math.max(0.8, bw), Math.max(0.8, bh), 1.2);
        const mat = new THREE.MeshStandardMaterial({ color: "#94a3b8", roughness: 0.5, metalness: 0.1, emissive: "#0f172a" });
        const mesh = new THREE.Mesh(geo, mat);
        const p = xy(cx, cy, boardWidthMm, boardHeightMm);
        mesh.position.set(p.x, p.y, 1.08);
        mesh.userData = { kind: "component", id: c.id };
        r.scene.add(mesh);
        r.compMap.set(c.id, mesh);
        r.hoverables.push(mesh);
      }
    }
  }, [components, traces, zones, vias, pads, keepouts, silkscreen, documentation, mechanical, graphics, drills, boardOutlines, visibleLayers, visibleDetailKey, boardWidthMm, boardHeightMm]);

  useEffect(() => {
    const r = refs.current;
    if (!r) return;

    const direct = new Set(directIds);
    const hlTraces = new Set(traceHighlightIds);

    for (const [id, mesh] of r.compMap) {
      const isTarget = hoveredType === "component" && hoveredId === id;
      const isSelected = selectedComponentIds.includes(id);
      const isRelated = direct.has(id);
      setCompColor(mesh, isTarget ? "target" : isSelected ? "selected" : isRelated ? "related" : "normal");
    }

    for (const [id, line] of r.traceMap) {
      const isTarget = hoveredType === "trace" && hoveredId === id;
      const isSelected = selectedTraceIds.includes(id);
      const isRelated = hlTraces.has(id);
      setTraceColor(line, isTarget ? "target" : isSelected ? "selected" : isRelated ? "related" : "normal");
    }

    for (const obj of r.overlayObjects) {
      const kind = obj.userData?.kind as HoverFeatureType | undefined;
      const id = obj.userData?.id as string | undefined;
      if (!kind || !id) continue;
      const isTarget = hoveredType === kind && hoveredId === id;
      const isSelected = selectedOverlayKind === kind && selectedOverlayId === id;
      const isRelated = overlayHighlightKeys.includes(`${kind}:${id}`);
      const material = (obj as any).material as any;
      if (material?.opacity != null) material.opacity = isTarget ? 1 : isSelected ? Math.min((material.opacity || 0.6) + 0.22, 1) : isRelated ? Math.min((material.opacity || 0.48) + 0.12, 0.92) : material.opacity;
      if (material?.color?.set) {
        if (isTarget) material.color.set('#f43f5e');
        else if (isSelected) material.color.set('#f59e0b');
        else if (isRelated) material.color.set('#22d3ee');
      }
    }
  }, [hoveredId, hoveredType, directIds, traceHighlightIds, selectedComponentIds, selectedTraceIds, selectedOverlayKind, selectedOverlayId, overlayHighlightKeys]);

  useEffect(() => {
    setBridgeState((prev) => ({
      ...prev,
      tool: "orbit",
      sc: selectedComponentIds,
      st: selectedTraceIds,
      sf: "all",
      vd: visibleDetailKey,
      lm: "three-orbit",
      gm: "perspective",
      th: "three-raycaster",
      le: "-",
    }));
  }, [selectedComponentIds, selectedTraceIds, visibleDetailKey]);

  useEffect(() => {
    if (!focusComponentId) return;
    const r = refs.current;
    if (!r) return;
    const mesh = r.compMap.get(focusComponentId);
    if (!mesh) return;
    const target = mesh.position.clone();
    r.camera.position.set(target.x, target.y - boardHeightMm * 0.45, Math.max(boardWidthMm, boardHeightMm) * 0.72);
    r.camera.lookAt(target.x, target.y, 0);
    setBridgeState((prev) => ({ ...prev, zoom: Number((r.orbit.baseRadius / Math.max(r.orbit.radius, 0.001)).toFixed(3)) }));
  }, [focusComponentId, boardWidthMm, boardHeightMm]);

  return (
    <div style={{ position: "relative", width, height, borderRadius: 12, overflow: "hidden" }}>
      <div ref={hostRef} style={{ width, height }} />
      <div
        data-testid="canvas-state-bridge"
        style={{
          position: "absolute",
          left: 92,
          bottom: 8,
          maxWidth: 520,
          background: "rgba(2,6,23,0.72)",
          color: "#93c5fd",
          border: "1px solid rgba(148,163,184,0.18)",
          borderRadius: 8,
          padding: "6px 8px",
          fontSize: 10,
          lineHeight: 1.35,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          pointerEvents: "none",
          whiteSpace: "pre-wrap",
        }}
      >
        {`State tool=${bridgeState.tool} zoom=${bridgeState.zoom.toFixed(3)} ox=${bridgeState.ox.toFixed(1)} oy=${bridgeState.oy.toFixed(1)}
selected_components=${bridgeState.sc.join(",") || "-"}
selected_traces=${bridgeState.st.join(",") || "-"}
selection_filter=${bridgeState.sf || "all"}
visible_detail=${bridgeState.vd || "-"}
label_mode=${bridgeState.lm || "three-orbit"}
grid_mode=${bridgeState.gm || "perspective"}
trace_hit=${bridgeState.th || "three-raycaster"}
last_export=${bridgeState.le || "-"}`}
      </div>
    </div>
  );
}
