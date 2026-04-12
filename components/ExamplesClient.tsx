"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { ExampleBoardData, ExampleIndexItem } from "@/lib/examples";

const PcbCanvas = dynamic(() => import("@/components/PcbCanvas"), { ssr: false });

const CANVAS_W = 980;
const CANVAS_H = 620;

type ExampleMap = Record<string, ExampleBoardData>;

export default function ExamplesClient({
  index,
  examples,
}: {
  index: ExampleIndexItem[];
  examples: ExampleMap;
}) {
  const [activeId, setActiveId] = useState(index[0]?.id || "");
  const [hoveredType, setHoveredType] = useState<"component" | "trace" | undefined>(undefined);
  const [hoveredId, setHoveredId] = useState<string | undefined>(undefined);

  const active = examples[activeId];

  const relation = useMemo(() => {
    if (!active || !hoveredId || !hoveredType) {
      return { directIds: [] as string[], traceIds: [] as string[], netIds: [] as string[] };
    }

    let netIds: string[] = [];

    if (hoveredType === "component") {
      const target = active.components.find((c) => c.id === hoveredId);
      netIds = (target?.nets || []).map((n) => String(n.id));
    } else {
      const t = active.traces.find((tr) => tr.id === hoveredId);
      if (t) netIds = [String(t.netId)];
    }

    const directIds = active.components
      .filter((c) => {
        if (hoveredType === "component" && c.id === hoveredId) return false;
        const cNets = (c.nets || []).map((n) => String(n.id));
        return cNets.some((nid) => netIds.includes(nid));
      })
      .map((c) => c.id);

    const traceIds = active.traces.filter((t) => netIds.includes(String(t.netId))).map((t) => t.id);

    return { directIds, traceIds, netIds };
  }, [active, hoveredId, hoveredType]);

  return (
    <div style={{ padding: 20 }}>
      <h1 style={{ marginTop: 0 }}>默认示例板卡</h1>
      <p style={{ opacity: 0.8 }}>数据来源于公开 GitHub 硬件项目，经过 Python 预处理后生成。</p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "12px 0 18px" }}>
        {index.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setActiveId(item.id);
              setHoveredType(undefined);
              setHoveredId(undefined);
            }}
            style={{
              border: item.id === activeId ? "1px solid #22d3ee" : "1px solid #334155",
              background: item.id === activeId ? "#0e7490" : "#0f172a",
              color: "#e2e8f0",
              padding: "8px 12px",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            {item.name} ({item.components})
          </button>
        ))}
      </div>

      {active && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
          <PcbCanvas
            width={CANVAS_W}
            height={CANVAS_H}
            boardWidthMm={active.board.widthMm}
            boardHeightMm={active.board.heightMm}
            components={active.components}
            traces={active.traces}
            hoveredId={hoveredId}
            hoveredType={hoveredType}
            directIds={relation.directIds}
            traceHighlightIds={relation.traceIds}
            onHoverFeature={(type, id) => {
              setHoveredType(type);
              setHoveredId(id);
            }}
          />

          <aside style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 14 }}>
            <h3 style={{ marginTop: 0 }}>示例信息</h3>
            <p><strong>名称：</strong>{active.board.name}</p>
            <p><strong>尺寸：</strong>{active.board.widthMm}mm × {active.board.heightMm}mm</p>
            <p><strong>元件数：</strong>{active.components.length}</p>
            <p><strong>线路段：</strong>{active.traces.length}</p>
            <p>
              <strong>数据来源：</strong>
              <a href={index.find((i) => i.id === activeId)?.source} target="_blank" style={{ color: "#67e8f9" }}>
                GitHub
              </a>
            </p>
            <hr style={{ borderColor: "#334155" }} />
            {!hoveredId && <p style={{ opacity: 0.8 }}>悬停元件或线路查看关联关系。</p>}
            {hoveredId && (
              <>
                <p><strong>目标类型：</strong>{hoveredType}</p>
                <p><strong>目标 ID：</strong>{hoveredId}</p>
                <p><strong>直接关联元件：</strong>{relation.directIds.length}</p>
                <p><strong>关联网络：</strong>{relation.netIds.join(", ") || "无"}</p>
                <p><strong>关联线路：</strong>{relation.traceIds.length}</p>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
