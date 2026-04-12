"use client";

import { useEffect, useRef, useState } from "react";
import { App, Rect, Text } from "leafer-ui";
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
    let app: App | null = null;
    try {
      if (!hostRef.current) return;
      app = new App({ view: hostRef.current, width, height, fill: "#071025" });
      const board = new Rect({ x: 40, y: 40, width: width - 80, height: height - 80, stroke: "#1e40af", strokeWidth: 2, fill: "#0f172a" });
      const title = new Text({ x: 56, y: 56, text: "Leafer minimal runtime probe", fill: "#e2e8f0", fontSize: 16 });
      const note = new Text({ x: 56, y: 86, text: "If this renders, runtime is healthy.", fill: "#94a3b8", fontSize: 12 });
      app.tree.add(board);
      app.tree.add(title);
      app.tree.add(note);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    return () => {
      try { app?.destroy(); } catch {}
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

  return <div ref={hostRef} style={{ width, height, borderRadius: 12, overflow: "hidden" }} />;
}
