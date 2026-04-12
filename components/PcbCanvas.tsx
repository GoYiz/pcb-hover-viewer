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

export default function PcbCanvas({ width, height }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let leafer: { destroy: () => void; add: (...args: any[]) => void } | null = null;
    let isDestroy = false;

    import("leafer-ui")
      .then(({ Leafer, Rect, Text }) => {
        if (isDestroy || !hostRef.current) return;

        const viewId = `leafer-view-${Math.random().toString(36).slice(2)}`;
        hostRef.current.innerHTML = `<div id="${viewId}" style="width:${width}px;height:${height}px"></div>`;

        leafer = new Leafer({ view: viewId });

        const board = new Rect({
          x: 40,
          y: 40,
          width: width - 80,
          height: height - 80,
          stroke: "#1e40af",
          strokeWidth: 2,
          fill: "#0f172a",
        });
        const title = new Text({ x: 56, y: 56, text: "Leafer official-style runtime probe", fill: "#e2e8f0", fontSize: 16 });
        const note = new Text({ x: 56, y: 86, text: "If this renders, official Leafer init works.", fill: "#94a3b8", fontSize: 12 });

        leafer.add(board);
        leafer.add(title);
        leafer.add(note);
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
  }, [width, height]);

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
