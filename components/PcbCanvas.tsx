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

export default function PcbCanvas({ width, height, boardWidthMm, boardHeightMm, components, traces, visibleLayers = ["F.Cu", "B.Cu"] }: Props) {
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
          const line = new Line({ points, stroke: "#3b82f6", strokeWidth: 2, opacity: 0.45 });
          leafer.add(line);
        }

        for (const c of components) {
          const [bx, by, bw, bh] = c.bbox;
          const x = mapX(bx, boardWidthMm, width);
          const y = mapY(by, boardHeightMm, height);
          const w = (bw / Math.max(boardWidthMm, 1)) * (width - PAD * 2);
          const h = (bh / Math.max(boardHeightMm, 1)) * (height - PAD * 2);

          const rect = new Rect({ x, y, width: w, height: h, fill: "#94a3b8", opacity: 0.55, cornerRadius: 2 });
          const label = new Text({ x, y: Math.max(14, y - 12), text: c.refdes, fill: "#e2e8f0", fontSize: 11 });
          leafer.add(rect);
          leafer.add(label);
        }

        const title = new Text({ x: 24, y: height - 24, text: `Leafer render probe · ${components.length} components · ${traces.length} traces`, fill: "#cbd5e1", fontSize: 12 });
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
  }, [width, height, boardWidthMm, boardHeightMm, components, traces, visibleLayers]);

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
