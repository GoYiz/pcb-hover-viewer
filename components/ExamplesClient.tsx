"use client";

import { useMemo, useState } from "react";
import PcbCanvas from "@/components/PcbCanvas";
import type { ExampleBoardData, ExampleIndexItem } from "@/lib/examples";

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
  const [hoveredId, setHoveredId] = useState<string | undefined>(undefined);

  const active = examples[activeId];

  const relation = useMemo(() => {
    if (!active || !hoveredId) {
      return { directIds: [] as string[], traceIds: [] as string[], netIds: [] as string[] };
    }

    const target = active.components.find((c) => c.id === hoveredId);
    if (!target) return { directIds: [], traceIds: [], netIds: [] };

    const netIds = (target.nets || []).map((n) => String(n.id));

    const directIds = active.components
      .filter((c) => {
        if (c.id === hoveredId) return false;
        const cNets = (c.nets || []).map((n) => String(n.id));
        return cNets.some((nid) => netIds.includes(nid));
      })
      .map((c) => c.id);

    const traceIds = active.traces.filter((t) => netIds.includes(String(t.netId))).map((t) => t.id);

    return { directIds, traceIds, netIds };
  }, [active, hoveredId]);

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
            directIds={relation.directIds}
            traceHighlightIds={relation.traceIds}
            onHoverComponent={setHoveredId}
          />

          <aside style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 14 }}>
            <h3 style={{ marginTop: 0 }}>示例信息</h3>
            <p><strong>名称：</strong>{active.board.name}</p>
            <p><strong>尺寸：</strong>{active.board.widthMm}mm × {active.board.heightMm}mm</p>
            <p>
              <strong>数据来源：</strong>
              <a href={index.find((i) => i.id === activeId)?.source} target="_blank" style={{ color: "#67e8f9" }}>
                GitHub
              </a>
            </p>
            <hr style={{ borderColor: "#334155" }} />
            {!hoveredId && <p style={{ opacity: 0.8 }}>悬停元件查看关联关系。</p>}
            {hoveredId && (
              <>
                <p><strong>目标：</strong>{hoveredId}</p>
                <p><strong>直接关联元件：</strong>{relation.directIds.length}</p>
                <p><strong>关联网络：</strong>{relation.netIds.join(", ") || "无"}</p>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
