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
  hoveredId?: string;
  hoveredType?: "component" | "trace";
  directIds: string[];
  traceHighlightIds: string[];
  onHoverFeature: (type?: "component" | "trace", id?: string) => void;
};

type TraceNode = {
  id: string;
  base: PIXI.Graphics;
  hit: PIXI.Graphics;
  points: Array<[number, number]>;
  cumulative: number[];
  totalLength: number;
};

type ComponentNode = {
  id: string;
  graphic: PIXI.Graphics;
  label: PIXI.Text;
  rect: { x: number; y: number; w: number; h: number };
};

type Scene = {
  app: PIXI.Application;
  viewport: PIXI.Container;
  borderLayer: PIXI.Container;
  traceLayer: PIXI.Container;
  hitLayer: PIXI.Container;
  flowLayer: PIXI.Container;
  compLayer: PIXI.Container;
  labelLayer: PIXI.Container;
  legendLayer: PIXI.Container;
  traceNodes: Map<string, TraceNode>;
  compNodes: Map<string, ComponentNode>;
  flowState: { traceIds: Set<string>; targetTraceId?: string; phase: number };
  camera: { scale: number; x: number; y: number; dragging: boolean; lastX: number; lastY: number };
};

const PAD = 20;
const MIN_SCALE = 0.6;
const MAX_SCALE = 3.5;

function mapX(x: number, boardWidthMm: number, width: number) {
  return PAD + (x / Math.max(boardWidthMm, 1)) * (width - PAD * 2);
}

function mapY(y: number, boardHeightMm: number, height: number) {
  return PAD + (y / Math.max(boardHeightMm, 1)) * (height - PAD * 2);
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

function drawComponent(node: ComponentNode, mode: "normal" | "related" | "target") {
  const color = mode === "target" ? 0xf43f5e : mode === "related" ? 0x22d3ee : 0x94a3b8;
  const alpha = mode === "target" ? 1 : mode === "related" ? 0.92 : 0.45;
  node.graphic.clear();
  node.graphic.roundRect(node.rect.x, node.rect.y, node.rect.w, node.rect.h, 2);
  node.graphic.fill({ color, alpha });
}

function applyCamera(scene: Scene) {
  scene.viewport.scale.set(scene.camera.scale);
  scene.viewport.position.set(scene.camera.x, scene.camera.y);
  scene.labelLayer.visible = scene.camera.scale >= 0.9;
}

export default function PcbCanvas(props: Props) {
  const { width, height, boardWidthMm, boardHeightMm, components, traces, hoveredId, hoveredType, directIds, traceHighlightIds, onHoverFeature } = props;

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
      const borderLayer = new PIXI.Container();
      const traceLayer = new PIXI.Container();
      const flowLayer = new PIXI.Container();
      const hitLayer = new PIXI.Container();
      const compLayer = new PIXI.Container();
      const labelLayer = new PIXI.Container();
      const legendLayer = new PIXI.Container();

      viewport.addChild(borderLayer, traceLayer, flowLayer, hitLayer, compLayer, labelLayer);
      app.stage.addChild(viewport, legendLayer);

      const scene: Scene = {
        app,
        viewport,
        borderLayer,
        traceLayer,
        hitLayer,
        flowLayer,
        compLayer,
        labelLayer,
        legendLayer,
        traceNodes: new Map(),
        compNodes: new Map(),
        flowState: { traceIds: new Set(), targetTraceId: undefined, phase: 0 },
        camera: { scale: 1, x: 0, y: 0, dragging: false, lastX: 0, lastY: 0 },
      };

      const flow = new PIXI.Graphics();
      flowLayer.addChild(flow);

      app.stage.eventMode = "static";
      app.stage.hitArea = new PIXI.Rectangle(0, 0, width, height);
      app.stage.on("pointerdown", (e) => {
        scene.camera.dragging = true;
        scene.camera.lastX = e.global.x;
        scene.camera.lastY = e.global.y;
      });
      app.stage.on("pointerup", () => (scene.camera.dragging = false));
      app.stage.on("pointerupoutside", () => (scene.camera.dragging = false));
      app.stage.on("pointermove", (e) => {
        if (!scene.camera.dragging) return;
        const dx = e.global.x - scene.camera.lastX;
        const dy = e.global.y - scene.camera.lastY;
        scene.camera.lastX = e.global.x;
        scene.camera.lastY = e.global.y;
        scene.camera.x += dx;
        scene.camera.y += dy;
        applyCamera(scene);
      });

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
      };
      app.canvas.addEventListener("wheel", onWheel, { passive: false });
      removeWheel = () => app.canvas.removeEventListener("wheel", onWheel);

      app.ticker.add((ticker) => {
        const s = sceneRef.current;
        if (!s) return;
        const g = s.flowLayer.children[0] as PIXI.Graphics;
        g.clear();
        if (!s.flowState.traceIds.size) return;
        s.flowState.phase += ticker.deltaTime * 2.2;

        for (const id of s.flowState.traceIds) {
          const node = s.traceNodes.get(id);
          if (!node || node.totalLength < 1) continue;
          const color = s.flowState.targetTraceId === id ? 0xfda4af : 0x67e8f9;
          for (let k = 0; k < 2; k += 1) {
            const dist = (s.flowState.phase * 5 + (k * node.totalLength) / 2) % node.totalLength;
            const p = pointAtDistance(node.points, node.cumulative, dist);
            g.circle(p.x, p.y, 2.8);
            g.fill({ color, alpha: 0.95 });
          }
        }
      });

      sceneRef.current = scene;
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
      const node: TraceNode = { id: t.id, base, hit, points, cumulative, totalLength };
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

      const label = new PIXI.Text({ text: c.refdes, style: { fill: 0xe2e8f0, fontSize: 11, fontFamily: "Inter, sans-serif" } });
      label.x = x;
      label.y = Math.max(14, y - 12);

      const node: ComponentNode = { id: c.id, graphic: g, label, rect: { x, y, w, h } };
      scene.compNodes.set(c.id, node);
      drawComponent(node, "normal");
      scene.compLayer.addChild(g);
      scene.labelLayer.addChild(label);
    }

    const legend = new PIXI.Text({
      text: "滚轮缩放 / 拖拽平移 · Hover 元件或线路：Target(粉) / Related(青)",
      style: { fill: 0xcbd5e1, fontSize: 12, fontFamily: "Inter, sans-serif" },
    });
    legend.x = 24;
    legend.y = height - 20;
    scene.legendLayer.addChild(legend);

    applyCamera(scene);
    prevRef.current = { hoveredId: undefined, hoveredType: undefined, direct: new Set(), traces: new Set() };
  }, [components, traces, boardWidthMm, boardHeightMm, width, height]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const directSet = new Set(directIds);
    const traceSet = new Set(traceHighlightIds);
    const prev = prevRef.current;

    const changedTrace = new Set<string>([...prev.traces, ...traceSet]);
    if (prev.hoveredType === "trace" && prev.hoveredId) changedTrace.add(prev.hoveredId);
    if (hoveredType === "trace" && hoveredId) changedTrace.add(hoveredId);

    const changedComp = new Set<string>([...prev.direct, ...directSet]);
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
      const isRel = directSet.has(id);
      drawComponent(n, isTarget ? "target" : isRel ? "related" : "normal");
    }

    scene.flowState.traceIds = new Set(traceHighlightIds);
    scene.flowState.targetTraceId = hoveredType === "trace" ? hoveredId : undefined;

    prevRef.current = { hoveredId, hoveredType, direct: directSet, traces: traceSet };
  }, [hoveredId, hoveredType, directIds, traceHighlightIds]);

  return <div ref={hostRef} style={{ width, height, borderRadius: 12, overflow: "hidden", touchAction: "none" }} />;
}
