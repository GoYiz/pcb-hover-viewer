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
  borderLayer: PIXI.Container;
  traceLayer: PIXI.Container;
  hitLayer: PIXI.Container;
  flowLayer: PIXI.Container;
  compLayer: PIXI.Container;
  labelLayer: PIXI.Container;
  legendLayer: PIXI.Container;
  traceNodes: Map<string, TraceNode>;
  compNodes: Map<string, ComponentNode>;
  flowState: {
    traceIds: Set<string>;
    targetTraceId?: string;
    phase: number;
  };
};

const PAD = 20;

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
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1 || cumulative.length <= 1) return { x: points[0][0], y: points[0][1] };

  const total = cumulative[cumulative.length - 1] || 1;
  let d = dist % total;
  if (d < 0) d += total;

  for (let i = 1; i < cumulative.length; i += 1) {
    const c0 = cumulative[i - 1];
    const c1 = cumulative[i];
    if (d <= c1) {
      const seg = Math.max(c1 - c0, 0.0001);
      const t = (d - c0) / seg;
      const x = points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t;
      const y = points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t;
      return { x, y };
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
  if (node.points.length === 0) return;
  node.base.moveTo(node.points[0][0], node.points[0][1]);
  for (let i = 1; i < node.points.length; i += 1) {
    node.base.lineTo(node.points[i][0], node.points[i][1]);
  }
  node.base.stroke({ color, width, alpha });
}

function drawComponent(node: ComponentNode, mode: "normal" | "related" | "target") {
  const color = mode === "target" ? 0xf43f5e : mode === "related" ? 0x22d3ee : 0x94a3b8;
  const alpha = mode === "target" ? 1 : mode === "related" ? 0.92 : 0.45;

  node.graphic.clear();
  node.graphic.roundRect(node.rect.x, node.rect.y, node.rect.w, node.rect.h, 2);
  node.graphic.fill({ color, alpha });
}

export default function PcbCanvas({
  width,
  height,
  boardWidthMm,
  boardHeightMm,
  components,
  traces,
  hoveredId,
  hoveredType,
  directIds,
  traceHighlightIds,
  onHoverFeature,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const prevStateRef = useRef<{
    hoveredId?: string;
    hoveredType?: "component" | "trace";
    directIds: Set<string>;
    traceIds: Set<string>;
  }>({ hoveredId: undefined, hoveredType: undefined, directIds: new Set(), traceIds: new Set() });

  useEffect(() => {
    let disposed = false;

    async function init() {
      const app = new PIXI.Application();
      await app.init({ width, height, backgroundColor: 0x071025, antialias: true });
      if (disposed) {
        app.destroy();
        return;
      }

      const borderLayer = new PIXI.Container();
      const traceLayer = new PIXI.Container();
      const hitLayer = new PIXI.Container();
      const flowLayer = new PIXI.Container();
      const compLayer = new PIXI.Container();
      const labelLayer = new PIXI.Container();
      const legendLayer = new PIXI.Container();

      app.stage.addChild(borderLayer, traceLayer, flowLayer, hitLayer, compLayer, labelLayer, legendLayer);

      // 分层缓存思路：静态图层不在 hover 时重建
      traceLayer.sortableChildren = false;
      labelLayer.sortableChildren = false;
      compLayer.sortableChildren = false;

      const flowGraphics = new PIXI.Graphics();
      flowLayer.addChild(flowGraphics);

      app.ticker.add((ticker) => {
        const scene = sceneRef.current;
        if (!scene) return;

        const g = scene.flowLayer.children[0] as PIXI.Graphics;
        g.clear();

        if (scene.flowState.traceIds.size === 0) return;

        scene.flowState.phase += ticker.deltaTime * 2.2;

        for (const id of scene.flowState.traceIds) {
          const node = scene.traceNodes.get(id);
          if (!node || node.totalLength < 1) continue;

          const color = scene.flowState.targetTraceId === id ? 0xfda4af : 0x67e8f9;
          const total = node.totalLength;

          for (let k = 0; k < 2; k += 1) {
            const dist = (scene.flowState.phase * 5 + (k * total) / 2) % total;
            const p = pointAtDistance(node.points, node.cumulative, dist);
            g.circle(p.x, p.y, 2.8);
            g.fill({ color, alpha: 0.95 });
          }
        }
      });

      const scene: Scene = {
        app,
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
      };

      sceneRef.current = scene;

      if (hostRef.current) {
        hostRef.current.innerHTML = "";
        hostRef.current.appendChild(app.canvas);
      }
    }

    init();

    return () => {
      disposed = true;
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

    for (const trace of traces) {
      const points = trace.path.map(([x, y]) => [mapX(x, boardWidthMm, width), mapY(y, boardHeightMm, height)] as [number, number]);
      const base = new PIXI.Graphics();
      const hit = new PIXI.Graphics();

      if (points.length > 0) {
        hit.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i += 1) hit.lineTo(points[i][0], points[i][1]);
        hit.stroke({ color: 0xffffff, width: 12, alpha: 0.001 }); // 更宽 hit area
      }

      hit.eventMode = "static";
      hit.cursor = "pointer";
      hit.on("pointerover", () => onHoverFeature("trace", trace.id));
      hit.on("pointerout", () => onHoverFeature(undefined, undefined));

      const { cumulative, totalLength } = buildCumulative(points);
      const node: TraceNode = { id: trace.id, base, hit, points, cumulative, totalLength };
      scene.traceNodes.set(trace.id, node);

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

      const graphic = new PIXI.Graphics();
      graphic.eventMode = "static";
      graphic.cursor = "pointer";
      graphic.on("pointerover", () => onHoverFeature("component", c.id));
      graphic.on("pointerout", () => onHoverFeature(undefined, undefined));

      const label = new PIXI.Text({
        text: c.refdes,
        style: { fill: 0xe2e8f0, fontSize: 11, fontFamily: "Inter, sans-serif" },
      });
      label.x = x;
      label.y = Math.max(14, y - 12);

      const node: ComponentNode = { id: c.id, graphic, label, rect: { x, y, w, h } };
      scene.compNodes.set(c.id, node);

      drawComponent(node, "normal");
      scene.compLayer.addChild(graphic);
      scene.labelLayer.addChild(label);
    }

    const legend = new PIXI.Text({
      text: "Hover 元件或线路：Target(粉) / Related(青) / Normal(灰)",
      style: { fill: 0xcbd5e1, fontSize: 12, fontFamily: "Inter, sans-serif" },
    });
    legend.x = 24;
    legend.y = height - 20;
    scene.legendLayer.addChild(legend);

    prevStateRef.current = { hoveredId: undefined, hoveredType: undefined, directIds: new Set(), traceIds: new Set() };
  }, [components, traces, boardWidthMm, boardHeightMm, width, height, onHoverFeature]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const directSet = new Set(directIds);
    const traceSet = new Set(traceHighlightIds);
    const prev = prevStateRef.current;

    const changedTraceIds = new Set<string>([...prev.traceIds, ...traceSet]);
    if (prev.hoveredType === "trace" && prev.hoveredId) changedTraceIds.add(prev.hoveredId);
    if (hoveredType === "trace" && hoveredId) changedTraceIds.add(hoveredId);

    const changedCompIds = new Set<string>([...prev.directIds, ...directSet]);
    if (prev.hoveredType === "component" && prev.hoveredId) changedCompIds.add(prev.hoveredId);
    if (hoveredType === "component" && hoveredId) changedCompIds.add(hoveredId);

    for (const id of changedTraceIds) {
      const node = scene.traceNodes.get(id);
      if (!node) continue;
      const isTarget = hoveredType === "trace" && hoveredId === id;
      const isRelated = traceSet.has(id);
      drawTrace(node, isTarget ? "target" : isRelated ? "related" : "normal");
    }

    for (const id of changedCompIds) {
      const node = scene.compNodes.get(id);
      if (!node) continue;
      const isTarget = hoveredType === "component" && hoveredId === id;
      const isRelated = directSet.has(id);
      drawComponent(node, isTarget ? "target" : isRelated ? "related" : "normal");
    }

    scene.flowState.traceIds = new Set(traceHighlightIds);
    scene.flowState.targetTraceId = hoveredType === "trace" ? hoveredId : undefined;

    prevStateRef.current = {
      hoveredId,
      hoveredType,
      directIds: directSet,
      traceIds: traceSet,
    };
  }, [hoveredId, hoveredType, directIds, traceHighlightIds]);

  return <div ref={hostRef} style={{ width, height, borderRadius: 12, overflow: "hidden" }} />;
}
