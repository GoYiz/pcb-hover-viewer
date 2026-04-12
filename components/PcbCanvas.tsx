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
  const runtimeRef = useRef<any>(null);

  useEffect(() => {
    let isDestroy = false;

    import("leafer-ui")
      .then(({ Leafer, Rect, Text, Line, Group }) => {
        if (isDestroy || !hostRef.current || runtimeRef.current) return;

        const viewId = `leafer-view-${Math.random().toString(36).slice(2)}`;
        hostRef.current.innerHTML = `<div id="${viewId}" style="width:${width}px;height:${height}px"></div>`;

        const leafer = new Leafer({ view: viewId });
        const boardLayer = new Group();
        const traceLayer = new Group();
        const compLayer = new Group();
        const overlayLayer = new Group();
        leafer.add(boardLayer);
        leafer.add(traceLayer);
        leafer.add(compLayer);
        leafer.add(overlayLayer);

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

        const title = new Text({
          x: 24,
          y: height - 24,
          text: "Leafer 2D · cached nodes / partial updates",
          fill: "#cbd5e1",
          fontSize: 12,
        });
        overlayLayer.add(title);

        const box = new Rect({ x: 0, y: 0, width: 0, height: 0, stroke: "#22d3ee", strokeWidth: 1.5, fill: "rgba(34,211,238,0.08)", visible: false });
        overlayLayer.add(box);

        const traceMap = new Map<string, any>();
        const compMap = new Map<string, any>();
        const labelMap = new Map<string, any>();
        const markerMap = new Map<string, any>();

        const scaleRef = { value: 1 };
        const offsetRef = { x: 0, y: 0 };
        const dragRef = { active: false, x: 0, y: 0 };
        const boxRef = { active: false, sx: 0, sy: 0, ex: 0, ey: 0 };

        const applyCamera = () => {
          for (const layer of [boardLayer, traceLayer, compLayer]) {
            layer.scaleX = scaleRef.value;
            layer.scaleY = scaleRef.value;
            layer.x = offsetRef.x;
            layer.y = offsetRef.y;
          }
        };

        const updateTraceStyle = (id: string) => {
          const line = traceMap.get(id);
          if (!line) return;
          const isTarget = hoveredType === "trace" && hoveredId === id;
          const isRelated = traceHighlightIds.includes(id);
          line.stroke = isTarget ? "#f43f5e" : isRelated ? "#22d3ee" : "#3b82f6";
          line.strokeWidth = isTarget ? 5 : isRelated ? 4 : 2;
          line.opacity = isTarget || isRelated ? 1 : 0.45;
          line.visible = true;
        };

        const updateCompStyle = (id: string) => {
          const rect = compMap.get(id);
          if (!rect) return;
          const isTarget = hoveredType === "component" && hoveredId === id;
          const isRelated = directIds.includes(id);
          rect.fill = isTarget ? "#f43f5e" : isRelated ? "#22d3ee" : "#94a3b8";
          rect.opacity = isTarget ? 1 : isRelated ? 0.92 : 0.55;
        };

        for (const trace of traces) {
          const points: number[] = [];
          for (const [x, y] of trace.path) points.push(mapX(x, boardWidthMm, width), mapY(y, boardHeightMm, height));
          const line = new Line({ points, stroke: "#3b82f6", strokeWidth: 2, opacity: 0.45, hitFill: "#ffffff", hitRadius: 8 });
          line.on("pointer.enter", () => onHoverFeature("trace", trace.id));
          line.on("pointer.leave", () => onHoverFeature(undefined, undefined));
          traceLayer.add(line);
          traceMap.set(trace.id, line);
        }

        for (const c of components) {
          const [bx, by, bw, bh] = c.bbox;
          const x = mapX(bx, boardWidthMm, width);
          const y = mapY(by, boardHeightMm, height);
          const w = (bw / Math.max(boardWidthMm, 1)) * (width - PAD * 2);
          const h = (bh / Math.max(boardHeightMm, 1)) * (height - PAD * 2);
          const rect = new Rect({ x, y, width: w, height: h, fill: "#94a3b8", opacity: 0.55, cornerRadius: 2 });
          rect.on("pointer.enter", () => onHoverFeature("component", c.id));
          rect.on("pointer.leave", () => onHoverFeature(undefined, undefined));
          const label = new Text({ x, y: Math.max(14, y - 12), text: c.refdes, fill: "#e2e8f0", fontSize: 11 });
          const marker = new Rect({ x: x - 4, y: y - 4, width: 10, height: 10, stroke: "#f59e0b", strokeWidth: 2, fill: "rgba(0,0,0,0)", cornerRadius: 3, visible: false });
          compLayer.add(rect);
          compLayer.add(label);
          compLayer.add(marker);
          compMap.set(c.id, rect);
          labelMap.set(c.id, label);
          markerMap.set(c.id, marker);
        }

        const view = hostRef.current!;
        const renderVisibility = () => {
          for (const trace of traces) {
            const line = traceMap.get(trace.id);
            if (!line) continue;
            line.visible = visibleLayers.length ? visibleLayers.includes(String(trace.layerId)) : true;
          }
          for (const id of traceMap.keys()) updateTraceStyle(id);
          for (const id of compMap.keys()) updateCompStyle(id);
          for (const [id, marker] of markerMap) marker.visible = focusComponentId === id;
          applyCamera();
          leafer.forceRender?.();
        };

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
            box.visible = true;
            box.x = x;
            box.y = y;
            box.width = 0;
            box.height = 0;
            leafer.forceRender?.();
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
            box.x = Math.min(boxRef.sx, boxRef.ex);
            box.y = Math.min(boxRef.sy, boxRef.ey);
            box.width = Math.abs(boxRef.ex - boxRef.sx);
            box.height = Math.abs(boxRef.ey - boxRef.sy);
            leafer.forceRender?.();
            return;
          }
          if (!dragRef.active) return;
          const dx = x - dragRef.x;
          const dy = y - dragRef.y;
          dragRef.x = x;
          dragRef.y = y;
          offsetRef.x += dx;
          offsetRef.y += dy;
          applyCamera();
          leafer.forceRender?.();
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
            box.visible = false;
            applyCamera();
            leafer.forceRender?.();
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
          applyCamera();
          leafer.forceRender?.();
        };

        view.addEventListener("pointerdown", onPointerDown);
        view.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
        view.addEventListener("wheel", onWheel, { passive: false });

        runtimeRef.current = {
          leafer,
          traceMap,
          compMap,
          markerMap,
          traces,
          visibleLayers,
          cleanup: () => {
            view.removeEventListener("pointerdown", onPointerDown);
            view.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
            view.removeEventListener("wheel", onWheel);
          },
          renderVisibility,
        };

        renderVisibility();
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

    return () => {
      isDestroy = true;
      try {
        runtimeRef.current?.cleanup?.();
        runtimeRef.current?.leafer?.destroy?.();
      } catch {}
      runtimeRef.current = null;
    };
  }, [width, height, boardWidthMm, boardHeightMm, components, traces, onHoverFeature]);

  useEffect(() => {
    const rt = runtimeRef.current;
    if (!rt) return;
    rt.visibleLayers = visibleLayers;
    for (const trace of rt.traces as TraceItem[]) {
      const line = rt.traceMap.get(trace.id);
      if (!line) continue;
      line.visible = visibleLayers.length ? visibleLayers.includes(String(trace.layerId)) : true;
    }
    for (const id of rt.traceMap.keys()) {
      const line = rt.traceMap.get(id);
      const isTarget = hoveredType === "trace" && hoveredId === id;
      const isRelated = traceHighlightIds.includes(id);
      line.stroke = isTarget ? "#f43f5e" : isRelated ? "#22d3ee" : "#3b82f6";
      line.strokeWidth = isTarget ? 5 : isRelated ? 4 : 2;
      line.opacity = isTarget || isRelated ? 1 : 0.45;
    }
    for (const id of rt.compMap.keys()) {
      const rect = rt.compMap.get(id);
      const isTarget = hoveredType === "component" && hoveredId === id;
      const isRelated = directIds.includes(id);
      rect.fill = isTarget ? "#f43f5e" : isRelated ? "#22d3ee" : "#94a3b8";
      rect.opacity = isTarget ? 1 : isRelated ? 0.92 : 0.55;
    }
    for (const [id, marker] of rt.markerMap) marker.visible = focusComponentId === id;
    rt.leafer.forceRender?.();
  }, [visibleLayers, hoveredId, hoveredType, directIds, traceHighlightIds, focusComponentId]);

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
