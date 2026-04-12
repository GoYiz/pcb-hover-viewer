"use client";

import { useEffect, useRef, useState } from "react";
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

export default function PcbCanvas({
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let leafer: any = null;
    let boardLayer: any = null;
    let overlayLayer: any = null;
    let isDestroy = false;
    const scaleRef = { value: 1 };
    const offsetRef = { x: 0, y: 0 };
    const dragRef = { active: false, x: 0, y: 0 };
    const boxRef = { active: false, sx: 0, sy: 0, ex: 0, ey: 0, rect: null as any };

    const renderAll = (Rect: any, Text: any, Line: any) => {
      if (!leafer || !boardLayer || !overlayLayer) return;
      boardLayer.clear();
      overlayLayer.clear();

      const board = new Rect({
        x: PAD,
        y: PAD,
        width: width - PAD * 2,
        height: height - PAD * 2,
        stroke: "#1e40af",
        strokeWidth: 2,
        fill: "#0f172a",
      });
      boardLayer.add(board);

      for (const trace of traces) {
        if (visibleLayers.length && !visibleLayers.includes(String(trace.layerId))) continue;
        const points: number[] = [];
        for (const [x, y] of trace.path) points.push(mapX(x, boardWidthMm, width), mapY(y, boardHeightMm, height));

        const isTarget = hoveredType === "trace" && hoveredId === trace.id;
        const isRelated = traceHighlightIds.includes(trace.id);

        const line = new Line({
          points,
          stroke: isTarget ? "#f43f5e" : isRelated ? "#22d3ee" : "#3b82f6",
          strokeWidth: isTarget ? 5 : isRelated ? 4 : 2,
          opacity: isTarget || isRelated ? 1 : 0.45,
          hitFill: "#ffffff",
          hitRadius: 8,
        });
        line.on("pointer.enter", () => onHoverFeature("trace", trace.id));
        line.on("pointer.leave", () => onHoverFeature(undefined, undefined));
        boardLayer.add(line);
      }

      for (const c of components) {
        const [bx, by, bw, bh] = c.bbox;
        const x = mapX(bx, boardWidthMm, width);
        const y = mapY(by, boardHeightMm, height);
        const w = (bw / Math.max(boardWidthMm, 1)) * (width - PAD * 2);
        const h = (bh / Math.max(boardHeightMm, 1)) * (height - PAD * 2);

        const isTarget = hoveredType === "component" && hoveredId === c.id;
        const isRelated = directIds.includes(c.id);

        const rect = new Rect({
          x,
          y,
          width: w,
          height: h,
          fill: isTarget ? "#f43f5e" : isRelated ? "#22d3ee" : "#94a3b8",
          opacity: isTarget ? 1 : isRelated ? 0.92 : 0.55,
          cornerRadius: 2,
        });
        rect.on("pointer.enter", () => onHoverFeature("component", c.id));
        rect.on("pointer.leave", () => onHoverFeature(undefined, undefined));
        const label = new Text({ x, y: Math.max(14, y - 12), text: c.refdes, fill: "#e2e8f0", fontSize: 11 });
        boardLayer.add(rect);
        boardLayer.add(label);
      }

      if (focusComponentId) {
        const focus = components.find((c) => c.id === focusComponentId);
        if (focus) {
          const [bx, by] = focus.bbox;
          const x = mapX(bx, boardWidthMm, width);
          const y = mapY(by, boardHeightMm, height);
          const marker = new Rect({ x: x - 4, y: y - 4, width: 10, height: 10, stroke: "#f59e0b", strokeWidth: 2, fill: "rgba(0,0,0,0)", cornerRadius: 3 });
          boardLayer.add(marker);
        }
      }

      const title = new Text({ x: 24, y: height - 24, text: "Leafer 2D · zoom / pan / box zoom restored", fill: "#cbd5e1", fontSize: 12 });
      overlayLayer.add(title);

      boardLayer.scaleX = scaleRef.value;
      boardLayer.scaleY = scaleRef.value;
      boardLayer.x = offsetRef.x;
      boardLayer.y = offsetRef.y;

      if (boxRef.active && boxRef.rect) {
        boxRef.rect.x = Math.min(boxRef.sx, boxRef.ex);
        boxRef.rect.y = Math.min(boxRef.sy, boxRef.ey);
        boxRef.rect.width = Math.abs(boxRef.ex - boxRef.sx);
        boxRef.rect.height = Math.abs(boxRef.ey - boxRef.sy);
      }
    };

    import("leafer-ui")
      .then(({ Leafer, Rect, Text, Line, Group }) => {
        if (isDestroy || !hostRef.current) return;

        const viewId = `leafer-view-${Math.random().toString(36).slice(2)}`;
        hostRef.current.innerHTML = `<div id="${viewId}" style="width:${width}px;height:${height}px"></div>`;

        leafer = new Leafer({ view: viewId });
        boardLayer = new Group();
        overlayLayer = new Group();
        leafer.add(boardLayer);
        leafer.add(overlayLayer);

        const box = new Rect({ x: 0, y: 0, width: 0, height: 0, stroke: "#22d3ee", strokeWidth: 1.5, fill: "rgba(34,211,238,0.08)", visible: false });
        boxRef.rect = box;
        overlayLayer.add(box);

        renderAll(Rect, Text, Line);

        const view = hostRef.current!;
        const onPointerDown = (e: PointerEvent) => {
          const rect = view.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          if (e.shiftKey) {
            boxRef.active = true;
            boxRef.sx = x;
            boxRef.sy = y;
            boxRef.ex = x;
            boxRef.ey = y;
            if (boxRef.rect) boxRef.rect.visible = true;
            renderAll(Rect, Text, Line);
            leafer?.forceRender?.();
            return;
          }
          dragRef.active = true;
          dragRef.x = x;
          dragRef.y = y;
        };

        const onPointerMove = (e: PointerEvent) => {
          const rect = view.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          if (boxRef.active) {
            boxRef.ex = x;
            boxRef.ey = y;
            renderAll(Rect, Text, Line);
            leafer?.forceRender?.();
            return;
          }
          if (!dragRef.active) return;
          const dx = x - dragRef.x;
          const dy = y - dragRef.y;
          dragRef.x = x;
          dragRef.y = y;
          offsetRef.x += dx;
          offsetRef.y += dy;
          renderAll(Rect, Text, Line);
          leafer?.forceRender?.();
        };

        const onPointerUp = () => {
          if (boxRef.active) {
            const w = Math.abs(boxRef.ex - boxRef.sx);
            const h = Math.abs(boxRef.ey - boxRef.sy);
            if (w > 12 && h > 12) {
              const worldX = (Math.min(boxRef.sx, boxRef.ex) - offsetRef.x) / scaleRef.value;
              const worldY = (Math.min(boxRef.sy, boxRef.ey) - offsetRef.y) / scaleRef.value;
              const worldW = w / scaleRef.value;
              const worldH = h / scaleRef.value;
              const nextScale = Math.max(0.6, Math.min(3.5, Math.min(width / worldW, height / worldH)));
              scaleRef.value = nextScale;
              offsetRef.x = -worldX * scaleRef.value + (width - worldW * scaleRef.value) / 2;
              offsetRef.y = -worldY * scaleRef.value + (height - worldH * scaleRef.value) / 2;
            }
            boxRef.active = false;
            if (boxRef.rect) boxRef.rect.visible = false;
            renderAll(Rect, Text, Line);
            leafer?.forceRender?.();
          }
          dragRef.active = false;
        };

        const onWheel = (e: WheelEvent) => {
          e.preventDefault();
          const rect = view.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const old = scaleRef.value;
          const next = Math.max(0.6, Math.min(3.5, old * (e.deltaY < 0 ? 1.1 : 0.9)));
          if (next === old) return;
          offsetRef.x = x - ((x - offsetRef.x) / old) * next;
          offsetRef.y = y - ((y - offsetRef.y) / old) * next;
          scaleRef.value = next;
          renderAll(Rect, Text, Line);
          leafer?.forceRender?.();
        };

        view.addEventListener("pointerdown", onPointerDown);
        view.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
        view.addEventListener("wheel", onWheel, { passive: false });

        leafer.__cleanup = () => {
          view.removeEventListener("pointerdown", onPointerDown);
          view.removeEventListener("pointermove", onPointerMove);
          window.removeEventListener("pointerup", onPointerUp);
          view.removeEventListener("wheel", onWheel);
        };
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      isDestroy = true;
      try {
        leafer?.__cleanup?.();
        leafer?.destroy();
      } catch {}
    };
  }, [width, height, boardWidthMm, boardHeightMm, components, traces, visibleLayers, hoveredId, hoveredType, directIds, traceHighlightIds, focusComponentId, onHoverFeature]);

  if (error) {
    return (
      <div style={{ width, height, background: "#071025", color: "#fca5a5", borderRadius: 12, padding: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Leafer runtime error</div>
        <div style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{error}</div>
      </div>
    );
  }

  return <div ref={hostRef} style={{ width, height, borderRadius: 12, overflow: "hidden", position: "relative" }} />;
}
