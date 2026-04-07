"use client";

import type { ComponentItem, TraceItem } from "@/types/pcb";

type Props = {
  width: number;
  height: number;
  boardWidthMm: number;
  boardHeightMm: number;
  components: ComponentItem[];
  traces: TraceItem[];
  hoveredId?: string;
  directIds: string[];
  traceHighlightIds: string[];
  onHoverComponent: (id?: string) => void;
};

const PAD = 20;

function mapX(x: number, boardWidthMm: number, width: number) {
  return PAD + (x / boardWidthMm) * (width - PAD * 2);
}

function mapY(y: number, boardHeightMm: number, height: number) {
  return PAD + (y / boardHeightMm) * (height - PAD * 2);
}

export default function PcbCanvas({
  width,
  height,
  boardWidthMm,
  boardHeightMm,
  components,
  traces,
  hoveredId,
  directIds,
  traceHighlightIds,
  onHoverComponent,
}: Props) {
  return (
    <svg width={width} height={height} style={{ background: "#071025", borderRadius: 12, border: "1px solid #1e3a8a" }}>
      <rect x={PAD} y={PAD} width={width - PAD * 2} height={height - PAD * 2} fill="none" stroke="#1e40af" strokeWidth={2} />

      {traces.map((trace) => {
        const highlighted = traceHighlightIds.includes(trace.id);
        const d = trace.path
          .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${mapX(x, boardWidthMm, width)} ${mapY(y, boardHeightMm, height)}`)
          .join(" ");

        return (
          <path
            key={trace.id}
            d={d}
            fill="none"
            stroke={highlighted ? "#22d3ee" : "#3b82f6"}
            strokeOpacity={highlighted ? 1 : 0.35}
            strokeWidth={highlighted ? 4 : 2}
          />
        );
      })}

      {components.map((c) => {
        const [bx, by, bw, bh] = c.bbox;
        const isTarget = hoveredId === c.id;
        const isDirect = directIds.includes(c.id);
        const fill = isTarget ? "#f43f5e" : isDirect ? "#22d3ee" : "#94a3b8";
        const opacity = isTarget ? 1 : isDirect ? 0.92 : 0.45;

        const x = mapX(bx, boardWidthMm, width);
        const y = mapY(by, boardHeightMm, height);
        const w = (bw / boardWidthMm) * (width - PAD * 2);
        const h = (bh / boardHeightMm) * (height - PAD * 2);

        return (
          <g key={c.id} onMouseEnter={() => onHoverComponent(c.id)} onMouseLeave={() => onHoverComponent(undefined)} style={{ cursor: "pointer" }}>
            <rect x={x} y={y} width={w} height={h} rx={2} fill={fill} fillOpacity={opacity} />
            <text x={x} y={Math.max(14, y - 4)} fill="#e2e8f0" fontSize={11}>
              {c.refdes}
            </text>
          </g>
        );
      })}

      <text x={24} y={height - 10} fill="#cbd5e1" fontSize={12}>
        Target(粉) / Direct(青) / Normal(灰)
      </text>
    </svg>
  );
}
