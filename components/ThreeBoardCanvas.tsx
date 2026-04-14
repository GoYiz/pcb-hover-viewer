"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { ComponentItem, TraceItem } from "@/types/pcb";

type Props = {
  width: number;
  height: number;
  boardWidthMm: number;
  boardHeightMm: number;
  components: ComponentItem[];
  traces: TraceItem[];
  visibleLayers?: string[];
  focusComponentId?: string;
  hoveredId?: string;
  hoveredType?: "component" | "trace";
  directIds: string[];
  traceHighlightIds: string[];
  selectedComponentIds?: string[];
  selectedTraceIds?: string[];
  onHoverFeature: (type?: "component" | "trace", id?: string) => void;
  onSelectFeature?: (type?: "component" | "trace", id?: string) => void;
};

type SceneRefs = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  board: THREE.Mesh;
  hoverables: THREE.Object3D[];
  compMap: Map<string, THREE.Mesh>;
  traceMap: Map<string, THREE.Line>;
  rafId?: number;
};

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

export default function ThreeBoardCanvas({
  width,
  height,
  boardWidthMm,
  boardHeightMm,
  components,
  traces,
  visibleLayers = ["F.Cu", "B.Cu"],
  focusComponentId,
  hoveredId,
  hoveredType,
  directIds,
  traceHighlightIds,
  selectedComponentIds = [],
  selectedTraceIds = [],
  onHoverFeature,
  onSelectFeature,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const refs = useRef<SceneRefs | null>(null);
  const onHoverRef = useRef(onHoverFeature);

  useEffect(() => {
    onHoverRef.current = onHoverFeature;
  }, [onHoverFeature]);

  useEffect(() => {
    if (!hostRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#071025");

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);
    camera.position.set(0, -boardHeightMm * 0.8, Math.max(boardWidthMm, boardHeightMm) * 1.1);
    camera.lookAt(0, 0, 0);

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

    const refsObj: SceneRefs = {
      scene,
      camera,
      renderer,
      board,
      hoverables: [],
      compMap: new Map(),
      traceMap: new Map(),
    };
    refs.current = refsObj;

    let dragging = false;
    let moved = false;
    let lx = 0;
    let ly = 0;
    let yaw = 0;
    let pitch = 0.85;
    let radius = Math.max(boardWidthMm, boardHeightMm) * 1.2;

    const updateCamera = () => {
      const cx = radius * Math.cos(pitch) * Math.sin(yaw);
      const cy = -radius * Math.cos(pitch) * Math.cos(yaw);
      const cz = radius * Math.sin(pitch);
      camera.position.set(cx, cy, cz);
      camera.lookAt(0, 0, 0);
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
        yaw -= dx * 0.006;
        pitch = Math.max(0.2, Math.min(1.4, pitch + dy * 0.004));
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
      const obj = hit.object as THREE.Object3D & { userData: { kind?: "component" | "trace"; id?: string } };
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
      const obj = hit?.object as THREE.Object3D & { userData?: { kind?: "component" | "trace"; id?: string } };
      if (obj?.userData?.kind && obj?.userData?.id) onSelectFeature?.(obj.userData.kind, obj.userData.id);
      else onSelectFeature?.(undefined, undefined);
    };

    const wheel = (ev: WheelEvent) => {
      ev.preventDefault();
      radius *= ev.deltaY < 0 ? 0.92 : 1.08;
      radius = Math.max(Math.max(boardWidthMm, boardHeightMm) * 0.55, Math.min(radius, Math.max(boardWidthMm, boardHeightMm) * 2.6));
      updateCamera();
    };

    renderer.domElement.addEventListener("pointermove", pointerMove);
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    window.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("wheel", wheel, { passive: false });

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
  }, [width, height, boardWidthMm, boardHeightMm]);

  useEffect(() => {
    const r = refs.current;
    if (!r) return;

    for (const m of r.compMap.values()) {
      r.scene.remove(m);
    }
    for (const l of r.traceMap.values()) {
      r.scene.remove(l);
    }
    r.compMap.clear();
    r.traceMap.clear();
    r.hoverables = [];

    for (const t of traces) {
      if (visibleLayers.length && !visibleLayers.includes(String(t.layerId))) continue;
      const pts = t.path.map(([x, y]) => xy(x, y, boardWidthMm, boardHeightMm));
      if (pts.length < 2) continue;
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: "#3b82f6", transparent: true, opacity: 0.4 });
      const line = new THREE.Line(geo, mat);
      line.position.z = 0.25;
      line.userData = { kind: "trace", id: t.id };
      r.scene.add(line);
      r.traceMap.set(t.id, line);
      r.hoverables.push(line);
    }

    for (const c of components) {
      const [bx, by, bw, bh] = c.bbox;
      const cx = bx + bw / 2;
      const cy = by + bh / 2;
      const geo = new THREE.BoxGeometry(Math.max(0.8, bw), Math.max(0.8, bh), 1.2);
      const mat = new THREE.MeshStandardMaterial({ color: "#94a3b8", roughness: 0.5, metalness: 0.1, emissive: "#0f172a" });
      const mesh = new THREE.Mesh(geo, mat);
      const p = xy(cx, cy, boardWidthMm, boardHeightMm);
      mesh.position.set(p.x, p.y, 0.8);
      mesh.userData = { kind: "component", id: c.id };
      r.scene.add(mesh);
      r.compMap.set(c.id, mesh);
      r.hoverables.push(mesh);
    }
  }, [components, traces, visibleLayers, boardWidthMm, boardHeightMm]);

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
  }, [hoveredId, hoveredType, directIds, traceHighlightIds, selectedComponentIds, selectedTraceIds]);

  useEffect(() => {
    if (!focusComponentId) return;
    const r = refs.current;
    if (!r) return;
    const mesh = r.compMap.get(focusComponentId);
    if (!mesh) return;
    const target = mesh.position.clone();
    r.camera.position.set(target.x, target.y - boardHeightMm * 0.45, Math.max(boardWidthMm, boardHeightMm) * 0.72);
    r.camera.lookAt(target.x, target.y, 0);
  }, [focusComponentId]);

  return <div ref={hostRef} style={{ width, height, borderRadius: 12, overflow: "hidden" }} />;
}
