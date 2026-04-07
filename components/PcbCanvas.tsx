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

const PAD = 20;

function mapX(x: number, boardWidthMm: number, width: number) {
  const base = Math.max(boardWidthMm, 1);
  return PAD + (x / base) * (width - PAD * 2);
}

function mapY(y: number, boardHeightMm: number, height: number) {
  const base = Math.max(boardHeightMm, 1);
  return PAD + (y / base) * (height - PAD * 2);
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
  const appRef = useRef<PIXI.Application | null>(null);

  useEffect(() => {
    let disposed = false;

    async function init() {
      const app = new PIXI.Application();
      await app.init({
        width,
        height,
        backgroundColor: 0x071025,
        antialias: true,
      });

      if (disposed) {
        app.destroy();
        return;
      }

      appRef.current = app;

      if (hostRef.current) {
        hostRef.current.innerHTML = "";
        hostRef.current.appendChild(app.canvas);
      }
    }

    init();

    return () => {
      disposed = true;
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
      }
      if (hostRef.current) {
        hostRef.current.innerHTML = "";
      }
    };
  }, [width, height]);

  useEffect(() => {
    const app = appRef.current;
    if (!app) return;

    app.stage.removeChildren();

    const border = new PIXI.Graphics();
    border.rect(PAD, PAD, width - PAD * 2, height - PAD * 2);
    border.stroke({ color: 0x1e40af, width: 2, alpha: 1 });
    app.stage.addChild(border);

    for (const trace of traces) {
      const isTarget = hoveredType === "trace" && hoveredId === trace.id;
      const highlighted = isTarget || traceHighlightIds.includes(trace.id);

      const color = isTarget ? 0xf43f5e : highlighted ? 0x22d3ee : 0x3b82f6;
      const alpha = highlighted ? 1 : 0.35;
      const lineWidth = isTarget ? 5 : highlighted ? 4 : 2;

      const g = new PIXI.Graphics();
      const points = trace.path;
      if (points.length > 0) {
        const [sx, sy] = points[0];
        g.moveTo(mapX(sx, boardWidthMm, width), mapY(sy, boardHeightMm, height));
        for (let i = 1; i < points.length; i += 1) {
          const [x, y] = points[i];
          g.lineTo(mapX(x, boardWidthMm, width), mapY(y, boardHeightMm, height));
        }
        g.stroke({ color, width: lineWidth, alpha });
      }

      g.eventMode = "static";
      g.cursor = "pointer";
      g.on("pointerover", () => onHoverFeature("trace", trace.id));
      g.on("pointerout", () => onHoverFeature(undefined, undefined));
      app.stage.addChild(g);
    }

    for (const c of components) {
      const [bx, by, bw, bh] = c.bbox;
      const isTarget = hoveredType === "component" && hoveredId === c.id;
      const isDirect = directIds.includes(c.id);

      const color = isTarget ? 0xf43f5e : isDirect ? 0x22d3ee : 0x94a3b8;
      const alpha = isTarget ? 1 : isDirect ? 0.92 : 0.45;

      const x = mapX(bx, boardWidthMm, width);
      const y = mapY(by, boardHeightMm, height);
      const w = (bw / Math.max(boardWidthMm, 1)) * (width - PAD * 2);
      const h = (bh / Math.max(boardHeightMm, 1)) * (height - PAD * 2);

      const g = new PIXI.Graphics();
      g.roundRect(x, y, w, h, 2);
      g.fill({ color, alpha });

      g.eventMode = "static";
      g.cursor = "pointer";
      g.on("pointerover", () => onHoverFeature("component", c.id));
      g.on("pointerout", () => onHoverFeature(undefined, undefined));
      app.stage.addChild(g);

      const label = new PIXI.Text({
        text: c.refdes,
        style: {
          fill: 0xe2e8f0,
          fontSize: 11,
          fontFamily: "Inter, sans-serif",
        },
      });
      label.x = x;
      label.y = Math.max(14, y - 12);
      app.stage.addChild(label);
    }

    const legend = new PIXI.Text({
      text: "Hover 元件或线路：Target(粉) / Related(青) / Normal(灰)",
      style: {
        fill: 0xcbd5e1,
        fontSize: 12,
        fontFamily: "Inter, sans-serif",
      },
    });
    legend.x = 24;
    legend.y = height - 20;
    app.stage.addChild(legend);
  }, [
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
  ]);

  return <div ref={hostRef} style={{ width, height, borderRadius: 12, overflow: "hidden" }} />;
}
