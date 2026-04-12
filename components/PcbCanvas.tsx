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
    let isDestroy = false;

    import("leafer-ui")
      .then(({ Leafer, Rect, Text, Line }) => {
        if (isDestroy || !hostRef.current) return;

        const viewId = `leafer-view-${Math.random().toString(36).slice(2)}`;
        hostRef.current.innerHTML = `<div id="${viewId}" style="width:${width}px;height:${height}px"></div>`;

        leafer = new Leafer({ view: viewId });

        const board = new Rect({
          x: PAD,
          y: PAD,
          width: width - PAD * 2,
          height: height - PAD * 2,
          stroke: "#1e40af",
          strokeWidth: 2,
          fill: "#0f172a",
        });
        leafer.add(board);

        for (const trace of traces) {
          if (visibleLayers.length && !visibleLayers.includes(String(trace.layerId))) continue;
          const points: number[] = [];
          for (const [x, y] of trace.path) {
            points.push(mapX(x, boardWidthMm, width), mapY(y, boardHeightMm, height));
          }

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
          leafer.add(line);
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
          leafer.add(rect);
          leafer.add(label);
        }

        if (focusComponentId) {
          const focus = components.find((c) => c.id === focusComponentId);
          if (focus) {
            const [bx, by] = focus.bbox;
            const x = mapX(bx, boardWidthMm, width);
            const y = mapY(by, boardHeightMm, height);
            const marker = new Rect({ x: x - 4, y: y - 4, width: 10, height: 10, stroke: "#f59e0b", strokeWidth: 2, fill: "rgba(0,0,0,0)", cornerRadius: 3 });
            leafer.add(marker);
          }
        }

        const title = new Text({
          x: 24,
          y: height - 24,
          text: `Leafer 2D · hover+relation restored · ${components.length} components · ${traces.length} traces`,
          fill: "#cbd5e1",
          fontSize: 12,
        });
        leafer.add(title);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      isDestroy = true;
      try {
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
