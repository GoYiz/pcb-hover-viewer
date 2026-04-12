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
  const contentRef = useRef<Box | null>(null);
  const boxRef = useRef<Rect | null>(null);
  const compMap = useRef<Map<string, Rect>>(new Map());
  const traceMap = useRef<Map<string, Line>>(new Map());
  const hoverRef = useRef(onHoverFeature);
  const cameraRef = useRef({ scale: 1, x: 0, y: 0, dragging: false, lastX: 0, lastY: 0, boxSelecting: false, sx: 0, sy: 0, ex: 0, ey: 0 });

  useEffect(() => {
    hoverRef.current = onHoverFeature;
  }, [onHoverFeature]);

  useEffect(() => {
    if (!hostRef.current) return;
    const app = new App({ view: hostRef.current, width, height, fill: "#071025" });
    const content = new Box();
    const box = new Rect({ x: 0, y: 0, width: 0, height: 0, stroke: "#22d3ee", strokeWidth: 1.5, fill: "rgba(34,211,238,0.08)", visible: false });
    app.tree.add(content);
    app.tree.add(box);

    appRef.current = app;
    contentRef.current = content;
    boxRef.current = box;

    const applyCamera = () => {
      if (!contentRef.current) return;
      contentRef.current.scaleX = cameraRef.current.scale;
      contentRef.current.scaleY = cameraRef.current.scale;
      contentRef.current.x = cameraRef.current.x;
      contentRef.current.y = cameraRef.current.y;
    };

    const view = hostRef.current;
    const onPointerDown = (e: PointerEvent) => {
      const rect = view.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (e.shiftKey) {
        cameraRef.current.boxSelecting = true;
        cameraRef.current.sx = x;
        cameraRef.current.sy = y;
        cameraRef.current.ex = x;
        cameraRef.current.ey = y;
        if (boxRef.current) {
          boxRef.current.visible = true;
          boxRef.current.x = x;
          boxRef.current.y = y;
          boxRef.current.width = 0;
          boxRef.current.height = 0;
        }
        app.tree.forceRender?.();
        return;
      }
      cameraRef.current.dragging = true;
      cameraRef.current.lastX = x;
      cameraRef.current.lastY = y;
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = view.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (cameraRef.current.boxSelecting) {
        cameraRef.current.ex = x;
        cameraRef.current.ey = y;
        if (boxRef.current) {
          boxRef.current.x = Math.min(cameraRef.current.sx, cameraRef.current.ex);
          boxRef.current.y = Math.min(cameraRef.current.sy, cameraRef.current.ey);
          boxRef.current.width = Math.abs(cameraRef.current.ex - cameraRef.current.sx);
          boxRef.current.height = Math.abs(cameraRef.current.ey - cameraRef.current.sy);
        }
        app.tree.forceRender?.();
        return;
      }
      if (!cameraRef.current.dragging) return;
      const dx = x - cameraRef.current.lastX;
      const dy = y - cameraRef.current.lastY;
      cameraRef.current.lastX = x;
      cameraRef.current.lastY = y;
      cameraRef.current.x += dx;
      cameraRef.current.y += dy;
      applyCamera();
      app.tree.forceRender?.();
    };

    const onPointerUp = () => {
      if (cameraRef.current.boxSelecting) {
        const w = Math.abs(cameraRef.current.ex - cameraRef.current.sx);
        const h = Math.abs(cameraRef.current.ey - cameraRef.current.sy);
        if (w > 10 && h > 10) {
          const worldX = (Math.min(cameraRef.current.sx, cameraRef.current.ex) - cameraRef.current.x) / cameraRef.current.scale;
          const worldY = (Math.min(cameraRef.current.sy, cameraRef.current.ey) - cameraRef.current.y) / cameraRef.current.scale;
          const worldW = w / cameraRef.current.scale;
          const worldH = h / cameraRef.current.scale;
          const nextScale = Math.min(width / worldW, height / worldH, 3.5);
          cameraRef.current.scale = Math.max(0.6, nextScale);
          cameraRef.current.x = -worldX * cameraRef.current.scale + (width - worldW * cameraRef.current.scale) / 2;
          cameraRef.current.y = -worldY * cameraRef.current.scale + (height - worldH * cameraRef.current.scale) / 2;
          applyCamera();
        }
        cameraRef.current.boxSelecting = false;
        if (boxRef.current) boxRef.current.visible = false;
        app.tree.forceRender?.();
      }
      cameraRef.current.dragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = view.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const old = cameraRef.current.scale;
      const next = Math.max(0.6, Math.min(3.5, old * (e.deltaY < 0 ? 1.1 : 0.9)));
      if (next === old) return;
      cameraRef.current.x = x - ((x - cameraRef.current.x) / old) * next;
      cameraRef.current.y = y - ((y - cameraRef.current.y) / old) * next;
      cameraRef.current.scale = next;
      applyCamera();
      app.tree.forceRender?.();
    };

    view.addEventListener("pointerdown", onPointerDown);
    view.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    view.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      view.removeEventListener("pointerdown", onPointerDown);
      view.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      view.removeEventListener("wheel", onWheel);
      app.destroy();
      appRef.current = null;
      contentRef.current = null;
      boxRef.current = null;
      compMap.current.clear();
      traceMap.current.clear();
    };
  }, [width, height]);

  useEffect(() => {
    const app = appRef.current;
    const content = contentRef.current;
    if (!app || !content) return;

    content.clear();
    compMap.current.clear();
    traceMap.current.clear();

    const board = new Box({ x: PAD, y: PAD, width: width - PAD * 2, height: height - PAD * 2, stroke: "#1e40af", strokeWidth: 2 });
    content.add(board);

    for (const t of traces) {
      if (visibleLayers.length && !visibleLayers.includes(String(t.layerId))) continue;
      const points: number[] = [];
      for (const [x, y] of t.path) points.push(mapX(x, boardWidthMm, width), mapY(y, boardHeightMm, height));
      const line = new Line({ points, stroke: "#3b82f6", strokeWidth: 2, opacity: 0.4, hitFill: "#fff", hitRadius: 8 });
      line.on("pointer.enter", () => hoverRef.current("trace", t.id));
      line.on("pointer.leave", () => hoverRef.current(undefined, undefined));
      content.add(line);
      traceMap.current.set(t.id, line);
    }

    for (const c of components) {
      const [bx, by, bw, bh] = c.bbox;
      const x = mapX(bx, boardWidthMm, width);
      const y = mapY(by, boardHeightMm, height);
      const w = (bw / Math.max(boardWidthMm, 1)) * (width - PAD * 2);
      const h = (bh / Math.max(boardHeightMm, 1)) * (height - PAD * 2);
      const rect = new Rect({ x, y, width: w, height: h, fill: "#94a3b8", opacity: 0.45, cornerRadius: 2 });
      rect.on("pointer.enter", () => hoverRef.current("component", c.id));
      rect.on("pointer.leave", () => hoverRef.current(undefined, undefined));
      const label = new Text({ x, y: Math.max(14, y - 12), text: c.refdes, fill: "#e2e8f0", fontSize: 11 });
      content.add(rect);
      content.add(label);
      compMap.current.set(c.id, rect);
    }

    const legend = new Text({ x: 22, y: height - 22, text: "Leafer validation · wheel zoom / drag pan / shift box zoom", fill: "#cbd5e1", fontSize: 12 });
    content.add(legend);
    app.tree.forceRender?.();
  }, [components, traces, visibleLayers, boardWidthMm, boardHeightMm, width, height]);

  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
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
    app.tree.forceRender?.();
  }, [hoveredId, hoveredType, directIds, traceHighlightIds]);

  useEffect(() => {
    const app = appRef.current;
    const rect = focusComponentId ? compMap.current.get(focusComponentId) : null;
    if (!app || !rect) return;
    const x = Number(rect.x || 0);
    const y = Number(rect.y || 0);
    const w = Number(rect.width || 0);
    const h = Number(rect.height || 0);
    const cx = x + w / 2;
    const cy = y + h / 2;
    cameraRef.current.scale = Math.max(1.2, cameraRef.current.scale);
    cameraRef.current.x = width / 2 - cx * cameraRef.current.scale;
    cameraRef.current.y = height / 2 - cy * cameraRef.current.scale;
    if (contentRef.current) {
      contentRef.current.scaleX = cameraRef.current.scale;
      contentRef.current.scaleY = cameraRef.current.scale;
      contentRef.current.x = cameraRef.current.x;
      contentRef.current.y = cameraRef.current.y;
    }
    app.tree.forceRender?.();
  }, [focusComponentId, width, height]);

  return <div ref={hostRef} style={{ width, height, borderRadius: 12, overflow: "hidden" }} />;
}
