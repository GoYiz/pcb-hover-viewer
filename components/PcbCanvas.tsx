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
function unmapPoint(px: number, py: number, width: number, height: number, bw: number, bh: number) {
  return { x: ((px - PAD) / Math.max(width - PAD * 2, 1)) * bw, y: ((py - PAD) / Math.max(height - PAD * 2, 1)) * bh };
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
        const gridLayer = new Group();
        const boardLayer = new Group();
        const traceLayer = new Group();
        const compLayer = new Group();
        const overlayLayer = new Group();
        leafer.add(gridLayer);
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
          text: "Leafer 2D · selection / measure / partial updates",
          fill: "#cbd5e1",
          fontSize: 12,
        });
        overlayLayer.add(title);

        const hud = new Text({
          x: width - 320,
          y: 18,
          text: "Layer: All · Zoom 1.00x · Selected 0 · Measure —",
          fill: "#93c5fd",
          fontSize: 12,
        });
        overlayLayer.add(hud);

        const hint = new Text({
          x: 24,
          y: 18,
          text: "Drag pan · Wheel zoom · Shift box select · Alt+Shift box zoom · Double click to measure · Esc clears · Snap on points",
          fill: "#64748b",
          fontSize: 11,
        });
        overlayLayer.add(hint);

        const cursorH = new Line({ points: [0, 0, width, 0], stroke: "rgba(34,211,238,0.55)", strokeWidth: 1, visible: false });
        const cursorV = new Line({ points: [0, 0, 0, height], stroke: "rgba(34,211,238,0.55)", strokeWidth: 1, visible: false });
        overlayLayer.add(cursorH);
        overlayLayer.add(cursorV);

        const box = new Rect({
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          stroke: "#f59e0b",
          strokeWidth: 1.5,
          fill: "rgba(245,158,11,0.08)",
          visible: false,
        });
        overlayLayer.add(box);

        const measureLine = new Line({ points: [0, 0, 0, 0], stroke: "#a78bfa", strokeWidth: 2, visible: false });
        const measureLabel = new Text({ x: 0, y: 0, text: "", fill: "#ddd6fe", fontSize: 12, visible: false });
        const measureP1 = new Rect({ x: 0, y: 0, width: 6, height: 6, fill: "#c4b5fd", cornerRadius: 3, visible: false });
        const measureP2 = new Rect({ x: 0, y: 0, width: 6, height: 6, fill: "#c4b5fd", cornerRadius: 3, visible: false });
        overlayLayer.add(measureLine);
        overlayLayer.add(measureLabel);
        overlayLayer.add(measureP1);
        overlayLayer.add(measureP2);

        const traceMap = new Map<string, any>();
        const compMap = new Map<string, any>();
        const labelMap = new Map<string, any>();
        const markerMap = new Map<string, any>();
        const compBoundsMap = new Map<string, { x: number; y: number; width: number; height: number }>();
        const traceBoundsMap = new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>();

        const selectedCompIds = new Set<string>();
        const selectedTraceIds = new Set<string>();
        const scaleRef = { value: 1 };
        const offsetRef = { x: 0, y: 0 };
        const dragRef = { active: false, x: 0, y: 0 };
        const boxRef = { active: false, sx: 0, sy: 0, ex: 0, ey: 0, mode: "select" as "select" | "zoom" };
        const measureRef = { p1: null as null | { x: number; y: number }, p2: null as null | { x: number; y: number }, preview: null as null | { x: number; y: number }, distanceMm: null as null | number, dxMm: null as null | number, dyMm: null as null | number };
        const snapPoints: Array<{ x: number; y: number }> = [];
        const SNAP_RADIUS = 12;

        const applyCamera = () => {
          for (const layer of [gridLayer, boardLayer, traceLayer, compLayer]) {
            layer.scaleX = scaleRef.value;
            layer.scaleY = scaleRef.value;
            layer.x = offsetRef.x;
            layer.y = offsetRef.y;
          }
        };

        const updateHud = () => {
          const label = visibleLayers.length === 0 || visibleLayers.length === 2 ? "All" : visibleLayers.join(" + ");
          const count = selectedCompIds.size + selectedTraceIds.size;
          const measureText = measureRef.distanceMm == null ? "—" : `ΔX ${Math.abs(measureRef.dxMm || 0).toFixed(2)} · ΔY ${Math.abs(measureRef.dyMm || 0).toFixed(2)} · D ${measureRef.distanceMm.toFixed(2)} mm`;
          hud.text = `Layer: ${label} · Zoom ${scaleRef.value.toFixed(2)}x · Selected ${count} · Measure ${measureText}`;
          hud.x = width - 18 - Math.max(320, String(hud.text).length * 6.7);
        };

        const snapPoint = (x: number, y: number) => {
          let best = { x, y };
          let bestD = SNAP_RADIUS;
          for (const p of snapPoints) {
            const d = Math.hypot(p.x - x, p.y - y);
            if (d < bestD) {
              best = p;
              bestD = d;
            }
          }
          return best;
        };

        const updateMeasureOverlay = () => {
          if (!measureRef.p1) {
            measureLine.visible = false;
            measureLabel.visible = false;
            measureP1.visible = false;
            measureP2.visible = false;
            measureRef.distanceMm = null;
            measureRef.dxMm = null;
            measureRef.dyMm = null;
            updateHud();
            return;
          }
          measureP1.visible = true;
          measureP1.x = measureRef.p1.x - 3;
          measureP1.y = measureRef.p1.y - 3;
          const end = measureRef.p2 || measureRef.preview;
          if (!end) {
            measureLine.visible = false;
            measureLabel.visible = false;
            measureP2.visible = false;
            measureRef.distanceMm = null;
            measureRef.dxMm = null;
            measureRef.dyMm = null;
            updateHud();
            return;
          }
          measureP2.visible = true;
          measureP2.x = end.x - 3;
          measureP2.y = end.y - 3;
          measureLine.visible = true;
          measureLine.points = [measureRef.p1.x, measureRef.p1.y, end.x, end.y];
          const a = unmapPoint(measureRef.p1.x, measureRef.p1.y, width, height, boardWidthMm, boardHeightMm);
          const b = unmapPoint(end.x, end.y, width, height, boardWidthMm, boardHeightMm);
          measureRef.dxMm = b.x - a.x;
          measureRef.dyMm = b.y - a.y;
          measureRef.distanceMm = Math.hypot(measureRef.dxMm, measureRef.dyMm);
          measureLabel.visible = true;
          measureLabel.text = `ΔX ${Math.abs(measureRef.dxMm).toFixed(2)} · ΔY ${Math.abs(measureRef.dyMm).toFixed(2)} · D ${measureRef.distanceMm.toFixed(2)} mm`;
          measureLabel.x = (measureRef.p1.x + end.x) / 2 + 8;
          measureLabel.y = (measureRef.p1.y + end.y) / 2 - 18;
          updateHud();
        };

        const renderGrid = () => {
          gridLayer.clear();
          const worldStep = scaleRef.value >= 2.2 ? 2 : scaleRef.value >= 1.3 ? 5 : 10;
          const screenStepX = (worldStep / Math.max(boardWidthMm, 1)) * (width - PAD * 2) * scaleRef.value;
          const screenStepY = (worldStep / Math.max(boardHeightMm, 1)) * (height - PAD * 2) * scaleRef.value;
          if (screenStepX < 12 || screenStepY < 12) return;

          const left = PAD * scaleRef.value + offsetRef.x;
          const top = PAD * scaleRef.value + offsetRef.y;
          const bw = (width - PAD * 2) * scaleRef.value;
          const bh = (height - PAD * 2) * scaleRef.value;

          for (let x = left; x <= left + bw + 1; x += screenStepX) {
            gridLayer.add(new Line({ points: [x, top, x, top + bh], stroke: "rgba(51,65,85,0.45)", strokeWidth: 1 / scaleRef.value }));
          }
          for (let y = top; y <= top + bh + 1; y += screenStepY) {
            gridLayer.add(new Line({ points: [left, y, left + bw, y], stroke: "rgba(51,65,85,0.45)", strokeWidth: 1 / scaleRef.value }));
          }
        };

        const updateTraceStyle = (id: string) => {
          const line = traceMap.get(id);
          if (!line) return;
          const isTarget = hoveredType === "trace" && hoveredId === id;
          const isSelected = selectedTraceIds.has(id);
          const isRelated = traceHighlightIds.includes(id);
          line.stroke = isTarget ? "#f43f5e" : isSelected ? "#f59e0b" : isRelated ? "#22d3ee" : "#3b82f6";
          line.strokeWidth = (isTarget ? 5 : isSelected ? 4.5 : isRelated ? 4 : 2) / Math.max(scaleRef.value * 0.9, 0.8);
          line.opacity = isTarget || isSelected || isRelated ? 1 : 0.45;
          line.visible = true;
        };

        const updateCompStyle = (id: string) => {
          const rect = compMap.get(id);
          const label = labelMap.get(id);
          if (!rect) return;
          const isTarget = hoveredType === "component" && hoveredId === id;
          const isSelected = selectedCompIds.has(id);
          const isRelated = directIds.includes(id);
          rect.fill = isTarget ? "#f43f5e" : isSelected ? "#f59e0b" : isRelated ? "#22d3ee" : "#94a3b8";
          rect.opacity = isTarget ? 1 : isSelected ? 0.98 : isRelated ? 0.92 : 0.55;
          rect.stroke = isSelected ? "#fde68a" : isTarget ? "#fecdd3" : "rgba(0,0,0,0)";
          rect.strokeWidth = isSelected || isTarget ? 1.5 / Math.max(scaleRef.value, 0.8) : 0;
          if (label) {
            label.visible = scaleRef.value >= 0.85;
            label.fill = isTarget ? "#ffffff" : isSelected ? "#fef3c7" : isRelated ? "#a5f3fc" : "#e2e8f0";
          }
        };

        const refreshStyles = () => {
          for (const trace of traces) {
            const line = traceMap.get(trace.id);
            if (!line) continue;
            line.visible = visibleLayers.length ? visibleLayers.includes(String(trace.layerId)) : true;
          }
          for (const id of traceMap.keys()) updateTraceStyle(id);
          for (const id of compMap.keys()) updateCompStyle(id);
          for (const [id, marker] of markerMap) marker.visible = focusComponentId === id;
          updateMeasureOverlay();
          updateHud();
          leafer.forceRender?.();
        };

        const clearSelection = () => {
          selectedCompIds.clear();
          selectedTraceIds.clear();
          refreshStyles();
        };

        const selectOnly = (kind: "component" | "trace", id: string) => {
          selectedCompIds.clear();
          selectedTraceIds.clear();
          if (kind === "component") selectedCompIds.add(id);
          else selectedTraceIds.add(id);
          refreshStyles();
        };

        const boxSelect = () => {
          const sx = Math.min(boxRef.sx, boxRef.ex);
          const sy = Math.min(boxRef.sy, boxRef.ey);
          const ex = Math.max(boxRef.sx, boxRef.ex);
          const ey = Math.max(boxRef.sy, boxRef.ey);
          const wx1 = (sx - offsetRef.x) / scaleRef.value;
          const wy1 = (sy - offsetRef.y) / scaleRef.value;
          const wx2 = (ex - offsetRef.x) / scaleRef.value;
          const wy2 = (ey - offsetRef.y) / scaleRef.value;

          selectedCompIds.clear();
          selectedTraceIds.clear();

          for (const [id, b] of compBoundsMap) {
            if (b.x + b.width >= wx1 && b.x <= wx2 && b.y + b.height >= wy1 && b.y <= wy2) selectedCompIds.add(id);
          }
          for (const [id, b] of traceBoundsMap) {
            if (b.maxX >= wx1 && b.minX <= wx2 && b.maxY >= wy1 && b.minY <= wy2) selectedTraceIds.add(id);
          }
          refreshStyles();
        };

        const boxZoom = () => {
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
            renderGrid();
            applyCamera();
            refreshStyles();
          }
        };

        for (const trace of traces) {
          const points: number[] = [];
          let minX = Infinity;
          let minY = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;
          for (const [x, y] of trace.path) {
            const px = mapX(x, boardWidthMm, width);
            const py = mapY(y, boardHeightMm, height);
            points.push(px, py);
            snapPoints.push({ x: px, y: py });
            minX = Math.min(minX, px);
            minY = Math.min(minY, py);
            maxX = Math.max(maxX, px);
            maxY = Math.max(maxY, py);
          }
          const line = new Line({ points, stroke: "#3b82f6", strokeWidth: 2, opacity: 0.45, hitFill: "#ffffff", hitRadius: 8 });
          line.on("pointer.enter", () => onHoverFeature("trace", trace.id));
          line.on("pointer.leave", () => onHoverFeature(undefined, undefined));
          line.on("pointer.tap", () => selectOnly("trace", trace.id));
          traceLayer.add(line);
          traceMap.set(trace.id, line);
          traceBoundsMap.set(trace.id, { minX, minY, maxX, maxY });
        }

        for (const c of components) {
          const [bx, by, bw, bh] = c.bbox;
          const x = mapX(bx, boardWidthMm, width);
          const y = mapY(by, boardHeightMm, height);
          const w = (bw / Math.max(boardWidthMm, 1)) * (width - PAD * 2);
          const h = (bh / Math.max(boardHeightMm, 1)) * (height - PAD * 2);
          snapPoints.push({ x, y }, { x: x + w, y }, { x, y: y + h }, { x: x + w, y: y + h }, { x: x + w / 2, y: y + h / 2 });
          const rect = new Rect({ x, y, width: w, height: h, fill: "#94a3b8", opacity: 0.55, cornerRadius: 2, stroke: "rgba(0,0,0,0)", strokeWidth: 0 });
          rect.on("pointer.enter", () => onHoverFeature("component", c.id));
          rect.on("pointer.leave", () => onHoverFeature(undefined, undefined));
          rect.on("pointer.tap", () => selectOnly("component", c.id));
          const label = new Text({ x, y: Math.max(14, y - 12), text: c.refdes, fill: "#e2e8f0", fontSize: 11 });
          const marker = new Rect({ x: x - 4, y: y - 4, width: 10, height: 10, stroke: "#f59e0b", strokeWidth: 2, fill: "rgba(0,0,0,0)", cornerRadius: 3, visible: false });
          compLayer.add(rect);
          compLayer.add(label);
          compLayer.add(marker);
          compMap.set(c.id, rect);
          labelMap.set(c.id, label);
          markerMap.set(c.id, marker);
          compBoundsMap.set(c.id, { x, y, width: w, height: h });
        }

        const view = hostRef.current!;
        const renderVisibility = () => {
          renderGrid();
          applyCamera();
          refreshStyles();
        };

        const onPointerDown = (e: PointerEvent) => {
          const rect = view.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          if (e.shiftKey) {
            boxRef.active = true;
            boxRef.mode = e.altKey ? "zoom" : "select";
            boxRef.sx = x;
            boxRef.sy = y;
            boxRef.ex = x;
            boxRef.ey = y;
            box.visible = true;
            box.stroke = boxRef.mode === "zoom" ? "#22d3ee" : "#f59e0b";
            box.fill = boxRef.mode === "zoom" ? "rgba(34,211,238,0.08)" : "rgba(245,158,11,0.08)";
            box.x = x;
            box.y = y;
            box.width = 0;
            box.height = 0;
            leafer.forceRender?.();
            return;
          }
          clearSelection();
          dragRef.active = true;
          dragRef.x = x;
          dragRef.y = y;
        };

        const onPointerMove = (e: PointerEvent) => {
          const rect = view.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          cursorH.visible = true;
          cursorV.visible = true;
          cursorH.points = [0, y, width, y];
          cursorV.points = [x, 0, x, height];
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
          if (measureRef.p1 && !measureRef.p2) {
            measureRef.preview = snapPoint(x, y);
            updateMeasureOverlay();
          }
          if (!dragRef.active) {
            leafer.forceRender?.();
            return;
          }
          const dx = x - dragRef.x;
          const dy = y - dragRef.y;
          dragRef.x = x;
          dragRef.y = y;
          offsetRef.x += dx;
          offsetRef.y += dy;
          renderGrid();
          applyCamera();
          updateHud();
          leafer.forceRender?.();
        };

        const onPointerUp = () => {
          if (boxRef.active) {
            const w = Math.abs(boxRef.ex - boxRef.sx);
            const h = Math.abs(boxRef.ey - boxRef.sy);
            if (w > 12 && h > 12) {
              if (boxRef.mode === "zoom") boxZoom();
              else boxSelect();
            }
            boxRef.active = false;
            box.visible = false;
            applyCamera();
            leafer.forceRender?.();
          }
          dragRef.active = false;
        };

        const onDoubleClick = (e: MouseEvent) => {
          const rect = view.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const snapped = snapPoint(x, y);
          if (!measureRef.p1 || measureRef.p2) {
            measureRef.p1 = snapped;
            measureRef.p2 = null;
            measureRef.preview = null;
          } else {
            measureRef.p2 = snapped;
            measureRef.preview = null;
          }
          updateMeasureOverlay();
          leafer.forceRender?.();
        };

        const onPointerLeave = () => {
          cursorH.visible = false;
          cursorV.visible = false;
          dragRef.active = false;
          if (measureRef.p1 && !measureRef.p2) {
            measureRef.preview = null;
            updateMeasureOverlay();
          }
          leafer.forceRender?.();
        };

        const onKeyDown = (e: KeyboardEvent) => {
          if (e.key === "Escape") {
            measureRef.p1 = null;
            measureRef.p2 = null;
            measureRef.preview = null;
            measureRef.distanceMm = null;
            measureRef.dxMm = null;
            measureRef.dyMm = null;
            updateMeasureOverlay();
            leafer.forceRender?.();
          }
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
          renderGrid();
          applyCamera();
          refreshStyles();
        };

        view.addEventListener("pointerdown", onPointerDown);
        view.addEventListener("pointermove", onPointerMove);
        view.addEventListener("pointerleave", onPointerLeave);
        view.addEventListener("dblclick", onDoubleClick);
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("keydown", onKeyDown);
        view.addEventListener("wheel", onWheel, { passive: false });

        runtimeRef.current = {
          leafer,
          traceMap,
          compMap,
          labelMap,
          markerMap,
          selectedCompIds,
          selectedTraceIds,
          traces,
          visibleLayers,
          scaleRef,
          updateHud,
          cleanup: () => {
            view.removeEventListener("pointerdown", onPointerDown);
            view.removeEventListener("pointermove", onPointerMove);
            view.removeEventListener("pointerleave", onPointerLeave);
            view.removeEventListener("dblclick", onDoubleClick);
            window.removeEventListener("pointerup", onPointerUp);
            window.removeEventListener("keydown", onKeyDown);
            view.removeEventListener("wheel", onWheel);
          },
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
    for (const trace of rt.traces as TraceItem[]) {
      const line = rt.traceMap.get(trace.id);
      if (!line) continue;
      line.visible = visibleLayers.length ? visibleLayers.includes(String(trace.layerId)) : true;
      const isTarget = hoveredType === "trace" && hoveredId === trace.id;
      const isSelected = rt.selectedTraceIds.has(trace.id);
      const isRelated = traceHighlightIds.includes(trace.id);
      line.stroke = isTarget ? "#f43f5e" : isSelected ? "#f59e0b" : isRelated ? "#22d3ee" : "#3b82f6";
      line.strokeWidth = (isTarget ? 5 : isSelected ? 4.5 : isRelated ? 4 : 2) / Math.max(rt.scaleRef.value * 0.9, 0.8);
      line.opacity = isTarget || isSelected || isRelated ? 1 : 0.45;
    }
    for (const [id, rect] of rt.compMap) {
      const label = rt.labelMap.get(id);
      const isTarget = hoveredType === "component" && hoveredId === id;
      const isSelected = rt.selectedCompIds.has(id);
      const isRelated = directIds.includes(id);
      rect.fill = isTarget ? "#f43f5e" : isSelected ? "#f59e0b" : isRelated ? "#22d3ee" : "#94a3b8";
      rect.opacity = isTarget ? 1 : isSelected ? 0.98 : isRelated ? 0.92 : 0.55;
      rect.stroke = isSelected ? "#fde68a" : isTarget ? "#fecdd3" : "rgba(0,0,0,0)";
      rect.strokeWidth = isSelected || isTarget ? 1.5 / Math.max(rt.scaleRef.value, 0.8) : 0;
      if (label) {
        label.visible = rt.scaleRef.value >= 0.85;
        label.fill = isTarget ? "#ffffff" : isSelected ? "#fef3c7" : isRelated ? "#a5f3fc" : "#e2e8f0";
      }
    }
    for (const [id, marker] of rt.markerMap) marker.visible = focusComponentId === id;
    rt.updateHud?.();
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
