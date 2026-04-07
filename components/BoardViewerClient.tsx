"use client";

import { useEffect, useMemo, useState } from "react";
import PcbCanvas from "@/components/PcbCanvas";
import { fetchComponents, fetchGeometry, fetchRelations } from "@/lib/api";
import { useViewerStore } from "@/store/viewerStore";
import type { ComponentItem, TraceItem } from "@/types/pcb";

const CANVAS_W = 980;
const CANVAS_H = 620;

export default function BoardViewerClient({
  boardId,
  boardName,
  boardWidthMm,
  boardHeightMm,
}: {
  boardId: string;
  boardName: string;
  boardWidthMm: number;
  boardHeightMm: number;
}) {
  const [components, setComponents] = useState<ComponentItem[]>([]);
  const [traces, setTraces] = useState<TraceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hoveredComponentId = useViewerStore((s) => s.hoveredComponentId);
  const setHoveredComponentId = useViewerStore((s) => s.setHoveredComponentId);
  const highlight = useViewerStore((s) => s.highlight);
  const setHighlight = useViewerStore((s) => s.setHighlight);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [c, g] = await Promise.all([fetchComponents(boardId), fetchGeometry(boardId)]);
        if (!alive) return;
        setComponents(c.components);
        setTraces(g.traces);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [boardId]);

  useEffect(() => {
    let alive = true;

    async function loadRelations() {
      if (!hoveredComponentId) {
        setHighlight({
          targetId: undefined,
          directComponentIds: [],
          traceIds: [],
          netIds: [],
        });
        return;
      }

      try {
        const rel = await fetchRelations(boardId, hoveredComponentId);
        if (!alive) return;
        setHighlight({
          targetId: hoveredComponentId,
          directComponentIds: rel.direct
            .filter((d) => d.targetType === "component")
            .map((d) => d.targetId),
          traceIds: rel.traces.map((t) => t.id),
          netIds: rel.nets,
        });
      } catch {
        if (!alive) return;
      }
    }

    loadRelations();
    return () => {
      alive = false;
    };
  }, [boardId, hoveredComponentId, setHighlight]);

  const hoveredComponent = useMemo(
    () => components.find((c) => c.id === hoveredComponentId),
    [components, hoveredComponentId],
  );

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ margin: 0 }}>{boardName}</h2>
      <p style={{ marginTop: 6, opacity: 0.8 }}>
        boardId: {boardId} · size: {boardWidthMm}mm × {boardHeightMm}mm
      </p>

      {loading && <p>加载中...</p>}
      {error && <p style={{ color: "#f87171" }}>{error}</p>}

      {!loading && !error && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
          <PcbCanvas
            width={CANVAS_W}
            height={CANVAS_H}
            boardWidthMm={boardWidthMm}
            boardHeightMm={boardHeightMm}
            components={components}
            traces={traces}
            hoveredId={highlight.targetId}
            directIds={highlight.directComponentIds}
            traceHighlightIds={highlight.traceIds}
            onHoverComponent={(id) => setHoveredComponentId(id)}
          />

          <aside
            style={{
              background: "#0f172a",
              border: "1px solid #1e293b",
              borderRadius: 12,
              padding: 14,
              minHeight: CANVAS_H,
            }}
          >
            <h3 style={{ marginTop: 0 }}>关系面板</h3>
            {!hoveredComponent && <p style={{ opacity: 0.8 }}>将鼠标悬停在元件上查看关系。</p>}

            {hoveredComponent && (
              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <strong>目标元件：</strong> {hoveredComponent.refdes}
                </div>
                <div>
                  <strong>Footprint：</strong> {hoveredComponent.footprint || "-"}
                </div>
                <div>
                  <strong>直接关联元件：</strong>
                  <ul>
                    {highlight.directComponentIds.length === 0 && <li>无</li>}
                    {highlight.directComponentIds.map((id) => (
                      <li key={id}>{id}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <strong>关联 Net：</strong>
                  <ul>
                    {highlight.netIds.length === 0 && <li>无</li>}
                    {highlight.netIds.map((id) => (
                      <li key={id}>{id}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <strong>高亮 Trace：</strong> {highlight.traceIds.length}
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
