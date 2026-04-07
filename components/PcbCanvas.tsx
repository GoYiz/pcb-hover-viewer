"use client";

import { useEffect, useRef } from "react";
import * as PIXI from "pixi.js";
import type { ComponentItem, TraceItem } from "@/types/pcb";

type Props = {
  width: number;
  height: number;
  boardWidthMm: number;
  boardHeightMm: number;
  components: ComponentItem[];
  traces: TraceItem[];
  visibleLayers: string[];
  focusComponentId?: string;
  hoveredId?: string;
  hoveredType?: "component" | "trace";
  directIds: string[];
  traceHighlightIds: string[];
  onHoverFeature: (type?: "component" | "trace", id?: string) => void;
};

type TraceNode = {
  id: string;
  points: Array<[number, number]>;
  cumulative: number[];
  totalLength: number;
  base: PIXI.Graphics;
  hit: PIXI.Graphics;
};

type CompNode = {
  id: string;
  rect: { x: number; y: number; w: number; h: number };
  g: PIXI.Graphics;
  label: PIXI.Text;
};

type Camera = {
  scale: number;
  x: number;
  y: number;
  dragging: boolean;
  lastX: number;
  lastY: number;
  boxSelecting: boolean;
  boxStartX: number;
  boxStartY: number;
  boxEndX: number;
  boxEndY: number;
};

type Scene = {
  app: PIXI.Application;
  viewport: PIXI.Container;
  overlay: PIXI.Container;
  borderLayer: PIXI.Container;
  traceLayer: PIXI.Container;
  flowLayer: PIXI.Container;
  hitLayer: PIXI.Container;
  compLayer: PIXI.Container;
  labelLayer: PIXI.Container;
  legendLayer: PIXI.Container;
  minimapLayer: PIXI.Container;
  boxLayer: PIXI.Container;
  traceNodes: Map<string, TraceNode>;
  compNodes: Map<string, CompNode>;
  flowState: { traceIds: Set<string>; targetTraceId?: string; phase: number };
  camera: Camera;
};

const PAD = 20;
const MIN_SCALE = 0.6;
const MAX_SCALE = 3.5;

function mapX(x: number, bw: number, w: number) {
  return PAD + (x / Math.max(bw, 1)) * (w - PAD * 2);
}
function mapY(y: number, bh: number, h: number) {
  return PAD + (y / Math.max(bh, 1)) * (h - PAD * 2);
}

function buildCumulative(points: Array<[number, number]>) {
  const cumulative = [0];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    total += Math.hypot(dx, dy);
    cumulative.push(total);
  }
  return { cumulative, totalLength: total };
}

function pointAtDistance(points: Array<[number, number]>, cumulative: number[], dist: number) {
  if (points.length < 2) return points[0] ? { x: points[0][0], y: points[0][1] } : { x: 0, y: 0 };
  const total = cumulative[cumulative.length - 1] || 1;
  let d = dist % total;
  if (d < 0) d += total;
  for (let i = 1; i < cumulative.length; i += 1) {
    const c0 = cumulative[i - 1];
    const c1 = cumulative[i];
    if (d <= c1) {
      const t = (d - c0) / Math.max(c1 - c0, 0.0001);
      return {
        x: points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t,
        y: points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t,
      };
    }
  }
  const last = points[points.length - 1];
  return { x: last[0], y: last[1] };
}

function drawTrace(node: TraceNode, mode: "normal" | "related" | "target") {
  const color = mode === "target" ? 0xf43f5e : mode === "related" ? 0x22d3ee : 0x3b82f6;
  const alpha = mode === "normal" ? 0.35 : 1;
  const width = mode === "target" ? 5 : mode === "related" ? 4 : 2;

  node.base.clear();
  if (!node.points.length) return;
  node.base.moveTo(node.points[0][0], node.points[0][1]);
  for (let i = 1; i < node.points.length; i += 1) node.base.lineTo(node.points[i][0], node.points[i][1]);
  node.base.stroke({ color, width, alpha });
}

function drawComp(node: CompNode, mode: "normal" | "related" | "target") {
  const color = mode === "target" ? 0xf43f5e : mode === "related" ? 0x22d3ee : 0x94a3b8;
  const alpha = mode === "target" ? 1 : mode === "related" ? 0.92 : 0.45;

  node.g.clear();
  node.g.roundRect(node.rect.x, node.rect.y, node.rect.w, node.rect.h, 2);
  node.g.fill({ color, alpha });
}

function applyCamera(scene: Scene) {
  scene.viewport.scale.set(scene.camera.scale);
  scene.viewport.position.set(scene.camera.x, scene.camera.y);
  scene.labelLayer.visible = scene.camera.scale >= 0.9;
}

function drawMinimap(scene: Scene, width: number, height: number) {
  scene.minimapLayer.removeChildren();

  const mmW = 180;
  const mmH = 110;
  const margin = 12;
  const mmX = width - mmW - margin;
  const mmY = 12;

  const boardX = PAD;
  const boardY = PAD;
  const boardW = width - PAD * 2;
  const boardH = height - PAD * 2;

  const bg = new PIXI.Graphics();
  bg.roundRect(mmX, mmY, mmW, mmH, 8);
  bg.fill({ color: 0x0f172a, alpha: 0.92 });
  bg.stroke({ color: 0x334155, width: 1, alpha: 1 });
  scene.minimapLayer.addChild(bg);

  const mapPad = 10;
  const mapX = mmX + mapPad;
  const mapY = mmY + mapPad;
  const mapW = mmW - mapPad * 2;
  const mapH = mmH - mapPad * 2;

  const boardRect = new PIXI.Graphics();
  boardRect.rect(mapX, mapY, mapW, mapH);
  boardRect.stroke({ color: 0x64748b, width: 1, alpha: 1 });
  scene.minimapLayer.addChild(boardRect);

  const vx0 = (0 - scene.camera.x) / scene.camera.scale;
  const vy0 = (0 - scene.camera.y) / scene.camera.scale;
  const vx1 = (width - scene.camera.x) / scene.camera.scale;
  const vy1 = (height - scene.camera.y) / scene.camera.scale;

  const nx0 = (vx0 - boardX) / Math.max(boardW, 1);
  const ny0 = (vy0 - boardY) / Math.max(boardH, 1);
  const nx1 = (vx1 - boardX) / Math.max(boardW, 1);
  const ny1 = (vy1 - boardY) / Math.max(boardH, 1);

  const rx = mapX + Math.max(0, Math.min(1, nx0)) * mapW;
  const ry = mapY + Math.max(0, Math.min(1, ny0)) * mapH;
  const rw = Math.max(4, (Math.max(0, Math.min(1, nx1)) - Math.max(0, Math.min(1, nx0))) * mapW);
  const rh = Math.max(4, (Math.max(0, Math.min(1, ny1)) - Math.max(0, Math.min(1, ny0))) * mapH);

  const viewRect = new PIXI.Graphics();
  viewRect.rect(rx, ry, rw, rh);
  viewRect.stroke({ color: 0x22d3ee, width: 1.5, alpha: 1 });
  scene.minimapLayer.addChild(viewRect);
}

function drawBox(scene: Scene) {
  scene.boxLayer.removeChildren();
  if (!scene.camera.boxSelecting) return;

  const x = Math.min(scene.camera.boxStartX, scene.camera.boxEndX);
  const y = Math.min(scene.camera.boxStartY, scene.camera.boxEndY);
  const w = Math.abs(scene.camera.boxEndX - scene.camera.boxStartX);
  const h = Math.abs(scene.camera.boxEndY - scene.camera.boxStartY);

  const box = new PIXI.Graphics();
  box.rect(x, y, w, h);
  box.fill({ color: 0x22d3ee, alpha: 0.08 });
  box.stroke({ color: 0x22d3ee, width: 1.5, alpha: 1 });
  scene.boxLayer.addChild(box);
}

export default function PcbCanvas({
  width,
  height,
  boardWidthMm,
  boardHeightMm,
  components,
  traces,
  visibleLayers,
  focusComponentId,
  hoveredId,
  hoveredType,
  directIds,
  traceHighlightIds,
  onHoverFeature,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const onHoverRef = useRef(onHoverFeature);
  const prevRef = useRef<{ hoveredId?: string; hoveredType?: "component" | "trace"; direct: Set<string>; traces: Set<string> }>({
    hoveredId: undefined,
    hoveredType: undefined,
    direct: new Set(),
    traces: new Set(),
  });

  useEffect(() => {
    onHoverRef.current = onHoverFeature;
  }, [onHoverFeature]);

  useEffect(() => {
    let disposed = false;
    let removeWheel: (() => void) | null = null;

    async function init() {
      const app = new PIXI.Application();
      await app.init({ width, height, backgroundColor: 0x071025, antialias: true });
      if (disposed) {
        app.destroy();
        return;
      }

      const viewport = new PIXI.Container();
      const overlay = new PIXI.Container();
      const borderLayer = new PIXI.Container();
      const traceLayer = new PIXI.Container();
      const flowLayer = new PIXI.Container();
      const hitLayer = new PIXI.Container();
      const compLayer = new PIXI.Container();
      const labelLayer = new PIXI.Container();
      const legendLayer = new PIXI.Container();
      const minimapLayer = new PIXI.Container();
      const boxLayer = new PIXI.Container();

      viewport.addChild(borderLayer, traceLayer, flowLayer, hitLayer, compLayer, labelLayer);
      overlay.addChild(legendLayer, minimapLayer, boxLayer);
      app.stage.addChild(viewport, overlay);

      const flowG = new PIXI.Graphics();
      flowLayer.addChild(flowG);

      const scene: Scene = {
        app,
        viewport,
        overlay,
        borderLayer,
        traceLayer,
        hitLayer,
        flowLayer,
        compLayer,
        labelLayer,
        legendLayer,
        minimapLayer,
        boxLayer,
        traceNodes: new Map(),
        compNodes: new Map(),
        flowState: { traceIds: new Set(), targetTraceId: undefined, phase: 0 },
        camera: {
          scale: 1,
          x: 0,
          y: 0,
          dragging: false,
          lastX: 0,
          lastY: 0,
          boxSelecting: false,
          boxStartX: 0,
          boxStartY: 0,
          boxEndX: 0,
          boxEndY: 0,
        },
      };

      app.stage.eventMode = "static";
      app.stage.hitArea = new PIXI.Rectangle(0, 0, width, height);

      app.stage.on("pointerdown", (e) => {
        const native = (e as unknown as { originalEvent?: PointerEvent }).originalEvent;
        const shift = !!native?.shiftKey;
        if (shift) {
          scene.camera.boxSelecting = true;
          scene.camera.boxStartX = e.global.x;
          scene.camera.boxStartY = e.global.y;
          scene.camera.boxEndX = e.global.x;
          scene.camera.boxEndY = e.global.y;
          drawBox(scene);
          return;
        }

        scene.camera.dragging = true;
        scene.camera.lastX = e.global.x;
        scene.camera.lastY = e.global.y;
      });

      app.stage.on("pointermove", (e) => {
        if (scene.camera.boxSelecting) {
          scene.camera.boxEndX = e.global.x;
          scene.camera.boxEndY = e.global.y;
          drawBox(scene);
          return;
        }
        if (!scene.camera.dragging) return;

        const dx = e.global.x - scene.camera.lastX;
        const dy = e.global.y - scene.camera.lastY;
        scene.camera.lastX = e.global.x;
        scene.camera.lastY = e.global.y;
        scene.camera.x += dx;
        scene.camera.y += dy;
        applyCamera(scene);
        drawMinimap(scene, width, height);
      });

      const finishPointer = () => {
        if (scene.camera.boxSelecting) {
          const x0 = Math.min(scene.camera.boxStartX, scene.camera.boxEndX);
          const y0 = Math.min(scene.camera.boxStartY, scene.camera.boxEndY);
          const w = Math.abs(scene.camera.boxEndX - scene.camera.boxStartX);
          const h = Math.abs(scene.camera.boxEndY - scene.camera.boxStartY);

          if (w > 10 && h > 10) {
            const wx = (x0 - scene.camera.x) / scene.camera.scale;
            const wy = (y0 - scene.camera.y) / scene.camera.scale;
            const ww = w / scene.camera.scale;
            const wh = h / scene.camera.scale;

            const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min(width / ww, height / wh)));
            scene.camera.scale = nextScale;
            scene.camera.x = -wx * nextScale + (width - ww * nextScale) / 2;
            scene.camera.y = -wy * nextScale + (height - wh * nextScale) / 2;
            applyCamera(scene);
            drawMinimap(scene, width, height);
          }

          scene.camera.boxSelecting = false;
          drawBox(scene);
        }

        scene.camera.dragging = false;
      };

      app.stage.on("pointerup", finishPointer);
      app.stage.on("pointerupoutside", finishPointer);

      const onWheel = (ev: WheelEvent) => {
        ev.preventDefault();
        const old = scene.camera.scale;
        const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, old * (ev.deltaY < 0 ? 1.1 : 0.9)));
        if (next === old) return;

        const rect = app.canvas.getBoundingClientRect();
        const mx = ev.clientX - rect.left;
        const my = ev.clientY - rect.top;

        scene.camera.x = mx - ((mx - scene.camera.x) / old) * next;
        scene.camera.y = my - ((my - scene.camera.y) / old) * next;
        scene.camera.scale = next;

        applyCamera(scene);
        drawMinimap(scene, width, height);
      };
      app.canvas.addEventListener("wheel", onWheel, { passive: false });
      removeWheel = () => app.canvas.removeEventListener("wheel", onWheel);

      app.ticker.add((ticker) => {
        const s = sceneRef.current;
        if (!s) return;
        const g = s.flowLayer.children[0] as PIXI.Graphics;
        g.clear();

        if (!s.flowState.traceIds.size || s.camera.scale < 0.8) return;

        s.flowState.phase += ticker.deltaTime * 2.2;
        for (const id of s.flowState.traceIds) {
          const n = s.traceNodes.get(id);
          if (!n || n.totalLength < 1) continue;
          const color = s.flowState.targetTraceId === id ? 0xfda4af : 0x67e8f9;
          for (let k = 0; k < 2; k += 1) {
            const dist = (s.flowState.phase * 5 + (k * n.totalLength) / 2) % n.totalLength;
            const p = pointAtDistance(n.points, n.cumulative, dist);
            g.circle(p.x, p.y, 2.8);
            g.fill({ color, alpha: 0.95 });
          }
        }
      });

      sceneRef.current = scene;
      applyCamera(scene);
      drawMinimap(scene, width, height);

      if (hostRef.current) {
        hostRef.current.innerHTML = "";
        hostRef.current.appendChild(app.canvas);
      }
    }

    init();

    return () => {
      disposed = true;
      if (removeWheel) removeWheel();
      const scene = sceneRef.current;
      if (scene) {
        scene.app.destroy(true, { children: true });
        sceneRef.current = null;
      }
      if (hostRef.current) hostRef.current.innerHTML = "";
    };
  }, [width, height]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    scene.borderLayer.removeChildren();
    scene.traceLayer.removeChildren();
    scene.hitLayer.removeChildren();
    scene.compLayer.removeChildren();
    scene.labelLayer.removeChildren();
    scene.legendLayer.removeChildren();
    scene.traceNodes.clear();
    scene.compNodes.clear();

    const border = new PIXI.Graphics();
    border.rect(PAD, PAD, width - PAD * 2, height - PAD * 2);
    border.stroke({ color: 0x1e40af, width: 2, alpha: 1 });
    scene.borderLayer.addChild(border);

    for (const t of traces) {
      if (visibleLayers.length && !visibleLayers.includes(String(t.layerId))) continue;
      const points = t.path.map(([x, y]) => [mapX(x, boardWidthMm, width), mapY(y, boardHeightMm, height)] as [number, number]);
      const base = new PIXI.Graphics();
      const hit = new PIXI.Graphics();

      if (points.length) {
        hit.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i += 1) hit.lineTo(points[i][0], points[i][1]);
        hit.stroke({ color: 0xffffff, width: 12, alpha: 0.001 });
      }

      hit.eventMode = "static";
      hit.cursor = "pointer";
      hit.on("pointerover", () => onHoverRef.current("trace", t.id));
      hit.on("pointerout", () => onHoverRef.current(undefined, undefined));

      const { cumulative, totalLength } = buildCumulative(points);
      const node: TraceNode = { id: t.id, points, cumulative, totalLength, base, hit };
      scene.traceNodes.set(t.id, node);

      drawTrace(node, "normal");
      scene.traceLayer.addChild(base);
      scene.hitLayer.addChild(hit);
    }

    for (const c of components) {
      const [bx, by, bw, bh] = c.bbox;
      const x = mapX(bx, boardWidthMm, width);
      const y = mapY(by, boardHeightMm, height);
      const w = (bw / Math.max(boardWidthMm, 1)) * (width - PAD * 2);
      const h = (bh / Math.max(boardHeightMm, 1)) * (height - PAD * 2);

      const g = new PIXI.Graphics();
      g.eventMode = "static";
      g.cursor = "pointer";
      g.on("pointerover", () => onHoverRef.current("component", c.id));
      g.on("pointerout", () => onHoverRef.current(undefined, undefined));

      const label = new PIXI.Text({
        text: c.refdes,
        style: { fill: 0xe2e8f0, fontSize: 11, fontFamily: "Inter, sans-serif" },
      });
      label.x = x;
      label.y = Math.max(14, y - 12);

      const node: CompNode = { id: c.id, rect: { x, y, w, h }, g, label };
      scene.compNodes.set(c.id, node);

      drawComp(node, "normal");
      scene.compLayer.addChild(g);
      scene.labelLayer.addChild(label);
    }

    const legend = new PIXI.Text({
      text: "滚轮缩放 / 拖拽平移 / Shift+拖拽框选缩放",
      style: { fill: 0xcbd5e1, fontSize: 12, fontFamily: "Inter, sans-serif" },
    });
    legend.x = 20;
    legend.y = height - 22;
    scene.legendLayer.addChild(legend);

    applyCamera(scene);
    drawMinimap(scene, width, height);
    prevRef.current = { hoveredId: undefined, hoveredType: undefined, direct: new Set(), traces: new Set() };
  }, [components, traces, visibleLayers, boardWidthMm, boardHeightMm, width, height]);

  useEffect(() => {
    if (!focusComponentId) return;
    const scene = sceneRef.current;
    if (!scene) return;
    const node = scene.compNodes.get(focusComponentId);
    if (!node) return;

    const cx = node.rect.x + node.rect.w / 2;
    const cy = node.rect.y + node.rect.h / 2;
    const targetScale = Math.max(1.2, scene.camera.scale);

    scene.camera.scale = Math.min(MAX_SCALE, targetScale);
    scene.camera.x = width / 2 - cx * scene.camera.scale;
    scene.camera.y = height / 2 - cy * scene.camera.scale;
    applyCamera(scene);
    drawMinimap(scene, width, height);
  }, [focusComponentId, width, height]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const direct = new Set(directIds);
    const traceSet = new Set(traceHighlightIds);
    const prev = prevRef.current;

    const changedTrace = new Set<string>([...prev.traces, ...traceSet]);
    if (prev.hoveredType === "trace" && prev.hoveredId) changedTrace.add(prev.hoveredId);
    if (hoveredType === "trace" && hoveredId) changedTrace.add(hoveredId);

    const changedComp = new Set<string>([...prev.direct, ...direct]);
    if (prev.hoveredType === "component" && prev.hoveredId) changedComp.add(prev.hoveredId);
    if (hoveredType === "component" && hoveredId) changedComp.add(hoveredId);

    for (const id of changedTrace) {
      const n = scene.traceNodes.get(id);
      if (!n) continue;
      const isTarget = hoveredType === "trace" && hoveredId === id;
      const isRel = traceSet.has(id);
      drawTrace(n, isTarget ? "target" : isRel ? "related" : "normal");
    }

    for (const id of changedComp) {
      const n = scene.compNodes.get(id);
      if (!n) continue;
      const isTarget = hoveredType === "component" && hoveredId === id;
      const isRel = direct.has(id);
      drawComp(n, isTarget ? "target" : isRel ? "related" : "normal");
    }

    scene.flowState.traceIds = new Set(traceHighlightIds);
    scene.flowState.targetTraceId = hoveredType === "trace" ? hoveredId : undefined;
    prevRef.current = { hoveredId, hoveredType, direct, traces: traceSet };
  }, [hoveredId, hoveredType, directIds, traceHighlightIds]);

  return <div ref={hostRef} style={{ width, height, borderRadius: 12, overflow: "hidden", touchAction: "none" }} />;
}
