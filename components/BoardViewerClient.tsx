"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

  const hoveredFeatureId = useViewerStore((s) => s.hoveredFeatureId);
  const hoveredFeatureType = useViewerStore((s) => s.hoveredFeatureType);
  const setHoveredFeature = useViewerStore((s) => s.setHoveredFeature);
  const highlight = useViewerStore((s) => s.highlight);
  const setHighlight = useViewerStore((s) => s.setHighlight);
  const relationCacheRef = useRef<Map<string, Awaited<ReturnType<typeof fetchRelations>>>>(new Map());
  const hoverTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    relationCacheRef.current.clear();

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

    const clearTimer = () => {
      if (hoverTimerRef.current) {
        window.clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = undefined;
      }
    };

    async function resolveRelations(type: "component" | "trace", id: string) {
      const cacheKey = `${boardId}:${type}:${id}`;
      const cached = relationCacheRef.current.get(cacheKey);
      if (cached) return cached;
      const rel = await fetchRelations(boardId, type, id);
      relationCacheRef.current.set(cacheKey, rel);
      return rel;
    }

    if (!hoveredFeatureId || !hoveredFeatureType) {
      clearTimer();
      setHighlight({
        targetId: undefined,
        targetType: undefined,
        directComponentIds: [],
        traceIds: [],
        netIds: [],
      });
      return () => {
        alive = false;
        clearTimer();
      };
    }

    clearTimer();
    hoverTimerRef.current = window.setTimeout(async () => {
      try {
        const rel = await resolveRelations(hoveredFeatureType, hoveredFeatureId);
        if (!alive) return;
        setHighlight({
          targetId: hoveredFeatureId,
          targetType: hoveredFeatureType,
          directComponentIds: rel.direct
            .filter((d) => d.targetType === "component")
            .map((d) => d.targetId),
          traceIds: rel.traces.map((t) => t.id),
          netIds: rel.nets,
        });
      } catch {
        if (!alive) return;
      }
    }, 28);

    return () => {
      alive = false;
      clearTimer();
    };
  }, [boardId, hoveredFeatureId, hoveredFeatureType, setHighlight]);

  const hoveredComponent = useMemo(
    () => (hoveredFeatureType === "component" ? components.find((c) => c.id === hoveredFeatureId) : undefined),
    [components, hoveredFeatureId, hoveredFeatureType],
  );

  const hoveredTrace = useMemo(
    () => (hoveredFeatureType === "trace" ? traces.find((t) => t.id === hoveredFeatureId) : undefined),
    [traces, hoveredFeatureId, hoveredFeatureType],
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
            hoveredType={highlight.targetType}
            directIds={highlight.directComponentIds}
            traceHighlightIds={highlight.traceIds}
            onHoverFeature={(type, id) => setHoveredFeature(type, id)}
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
            {!hoveredFeatureId && <p style={{ opacity: 0.8 }}>将鼠标悬停在元件或线路上查看关系。</p>}

            {hoveredComponent && (
              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <strong>目标元件：</strong> {hoveredComponent.refdes}
                </div>
                <div>
                  <strong>Footprint：</strong> {hoveredComponent.footprint || "-"}
                </div>
                <div>
                  <strong>直接关联元件：</strong> {highlight.directComponentIds.length}
                </div>
                <div>
                  <strong>关联 Net：</strong> {highlight.netIds.join(", ") || "无"}
                </div>
                <div>
                  <strong>高亮 Trace：</strong> {highlight.traceIds.length}
                </div>
              </div>
            )}

            {hoveredTrace && (
              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <strong>目标线路：</strong> {hoveredTrace.id}
                </div>
                <div>
                  <strong>Net：</strong> {hoveredTrace.netId}
                </div>
                <div>
                  <strong>同网络关联元件：</strong> {highlight.directComponentIds.length}
                </div>
                <div>
                  <strong>同网络高亮线路：</strong> {highlight.traceIds.length}
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
