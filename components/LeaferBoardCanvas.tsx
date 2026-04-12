"use client";

import { useEffect, useRef } from "react";
import { App, Box, Line, Rect, Text } from "leafer-ui";
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
  onHoverFeature: (type?: "component" | "trace", id?: string) => void;
};

const PAD = 20;

function mapX(x: number, bw: number, w: number) {
  return PAD + (x / Math.max(bw, 1)) * (w - PAD * 2);
}
function mapY(y: number, bh: number, h: number) {
  return PAD + (y / Math.max(bh, 1)) * (h - PAD * 2);
}

export default function LeaferBoardCanvas({
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
  onHoverFeature,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<App | null>(null);
  const compMap = useRef<Map<string, Rect>>(new Map());
  const traceMap = useRef<Map<string, Line>>(new Map());

  useEffect(() => {
    if (!hostRef.current) return;
    const app = new App({
      view: hostRef.current,
      width,
      height,
      fill: "#071025",
    });
    appRef.current = app;

    const board = new Box({ x: PAD, y: PAD, width: width - PAD * 2, height: height - PAD * 2, stroke: "#1e40af", strokeWidth: 2 });
    app.tree.add(board);

    return () => {
      app.destroy();
      appRef.current = null;
      compMap.current.clear();
      traceMap.current.clear();
    };
  }, [width, height]);

  useEffect(() => {
    const app = appRef.current;
    if (!app) return;

    app.tree.clear();
    compMap.current.clear();
    traceMap.current.clear();

    const board = new Box({ x: PAD, y: PAD, width: width - PAD * 2, height: height - PAD * 2, stroke: "#1e40af", strokeWidth: 2 });
    app.tree.add(board);

    for (const t of traces) {
      if (visibleLayers.length && !visibleLayers.includes(String(t.layerId))) continue;
      const points: number[] = [];
      for (const [x, y] of t.path) {
        points.push(mapX(x, boardWidthMm, width), mapY(y, boardHeightMm, height));
      }
      const line = new Line({ points, stroke: "#3b82f6", strokeWidth: 2, opacity: 0.4, hitFill: "#fff", hitRadius: 6 });
      line.on("pointer.enter", () => onHoverFeature("trace", t.id));
      line.on("pointer.leave", () => onHoverFeature(undefined, undefined));
      app.tree.add(line);
      traceMap.current.set(t.id, line);
    }

    for (const c of components) {
      const [bx, by, bw, bh] = c.bbox;
      const x = mapX(bx, boardWidthMm, width);
      const y = mapY(by, boardHeightMm, height);
      const w = (bw / Math.max(boardWidthMm, 1)) * (width - PAD * 2);
      const h = (bh / Math.max(boardHeightMm, 1)) * (height - PAD * 2);

      const rect = new Rect({ x, y, width: w, height: h, fill: "#94a3b8", opacity: 0.45, cornerRadius: 2 });
      rect.on("pointer.enter", () => onHoverFeature("component", c.id));
      rect.on("pointer.leave", () => onHoverFeature(undefined, undefined));

      const label = new Text({ x, y: Math.max(14, y - 12), text: c.refdes, fill: "#e2e8f0", fontSize: 11 });
      app.tree.add(rect);
      app.tree.add(label);
      compMap.current.set(c.id, rect);
    }

    const legend = new Text({ x: 22, y: height - 22, text: "Leafer 2D validation mode", fill: "#cbd5e1", fontSize: 12 });
    app.tree.add(legend);
  }, [components, traces, visibleLayers, boardWidthMm, boardHeightMm, width, height, onHoverFeature]);

  useEffect(() => {
    for (const [id, rect] of compMap.current) {
      const isTarget = hoveredType === "component" && hoveredId === id;
      const isRelated = directIds.includes(id);
      rect.fill = isTarget ? "#f43f5e" : isRelated ? "#22d3ee" : "#94a3b8";
      rect.opacity = isTarget ? 1 : isRelated ? 0.92 : 0.45;
    }

    for (const [id, line] of traceMap.current) {
      const isTarget = hoveredType === "trace" && hoveredId === id;
      const isRelated = traceHighlightIds.includes(id);
      line.stroke = isTarget ? "#f43f5e" : isRelated ? "#22d3ee" : "#3b82f6";
      line.opacity = isTarget || isRelated ? 1 : 0.4;
      line.strokeWidth = isTarget ? 5 : isRelated ? 4 : 2;
    }

    appRef.current?.tree.forceRender?.();
  }, [hoveredId, hoveredType, directIds, traceHighlightIds]);

  useEffect(() => {
    if (!focusComponentId) return;
    const rect = compMap.current.get(focusComponentId);
    if (!rect) return;
    // 验证阶段先不做相机复杂动画，只做聚焦高亮
    rect.opacity = 1;
  }, [focusComponentId]);

  return <div ref={hostRef} style={{ width, height, borderRadius: 12, overflow: "hidden" }} />;
}
