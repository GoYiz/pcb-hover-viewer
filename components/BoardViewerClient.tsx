"use client";

import { useEffect, useMemo, useState } from "react";
import PcbCanvas from "@/components/PcbCanvas";
import ThreeBoardCanvas from "@/components/ThreeBoardCanvas";
import { fetchComponents, fetchGeometry } from "@/lib/api";
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
  const [layerMode, setLayerMode] = useState<"all" | "fcu" | "bcu">("all");
  const [search, setSearch] = useState("");
  const [focusComponentId, setFocusComponentId] = useState<string | undefined>(undefined);
  const [viewMode, setViewMode] = useState<"2d" | "3d">("2d");

  const visibleLayers = useMemo(() => {
    if (layerMode === "fcu") return ["F.Cu"];
    if (layerMode === "bcu") return ["B.Cu"];
    return ["F.Cu", "B.Cu"];
  }, [layerMode]);

  const hoveredFeatureId = useViewerStore((s) => s.hoveredFeatureId);
  const hoveredFeatureType = useViewerStore((s) => s.hoveredFeatureType);
  const setHoveredFeature = useViewerStore((s) => s.setHoveredFeature);
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

  const relationIndex = useMemo(() => {
    const netToComponents = new Map<string, Set<string>>();
    const netToTraces = new Map<string, Set<string>>();
    const traceToNet = new Map<string, string>();
    const compToNets = new Map<string, Set<string>>();

    for (const c of components) {
      const nets = new Set((c.netIds || []).map((n) => String(n)));
      compToNets.set(c.id, nets);
      for (const net of nets) {
        if (!netToComponents.has(net)) netToComponents.set(net, new Set());
        netToComponents.get(net)!.add(c.id);
      }
    }

    for (const t of traces) {
      const net = String(t.netId);
      traceToNet.set(t.id, net);
      if (!netToTraces.has(net)) netToTraces.set(net, new Set());
      netToTraces.get(net)!.add(t.id);
    }

    return { netToComponents, netToTraces, traceToNet, compToNets };
  }, [components, traces]);

  useEffect(() => {
    if (!hoveredFeatureId || !hoveredFeatureType) {
      setHighlight({
        targetId: undefined,
        targetType: undefined,
        directComponentIds: [],
        traceIds: [],
        netIds: [],
      });
      return;
    }

    const netSet = new Set<string>();

    if (hoveredFeatureType === "component") {
      const nets = relationIndex.compToNets.get(hoveredFeatureId) || new Set();
      nets.forEach((n) => netSet.add(n));
    } else {
      const net = relationIndex.traceToNet.get(hoveredFeatureId);
      if (net) netSet.add(net);
    }

    const compSet = new Set<string>();
    const traceSet = new Set<string>();

    for (const net of netSet) {
      (relationIndex.netToComponents.get(net) || new Set()).forEach((id) => compSet.add(id));
      (relationIndex.netToTraces.get(net) || new Set()).forEach((id) => traceSet.add(id));
    }

    if (hoveredFeatureType === "component") compSet.delete(hoveredFeatureId);

    setHighlight({
      targetId: hoveredFeatureId,
      targetType: hoveredFeatureType,
      directComponentIds: [...compSet],
      traceIds: [...traceSet],
      netIds: [...netSet],
    });
  }, [hoveredFeatureId, hoveredFeatureType, relationIndex, setHighlight]);

  useEffect(() => {
    if (!focusComponentId) return;
    const timer = window.setTimeout(() => setFocusComponentId(undefined), 100);
    return () => window.clearTimeout(timer);
  }, [focusComponentId]);


  const hoveredComponent = useMemo(
    () => (hoveredFeatureType === "component" ? components.find((c) => c.id === hoveredFeatureId) : undefined),
    [components, hoveredFeatureId, hoveredFeatureType],
  );

  const hoveredTrace = useMemo(
    () => (hoveredFeatureType === "trace" ? traces.find((t) => t.id === hoveredFeatureId) : undefined),
    [traces, hoveredFeatureId, hoveredFeatureType],
  );

  const searchMatches = useMemo(() => {
    const kw = search.trim().toUpperCase();
    if (!kw) return [] as ComponentItem[];
    return components.filter((c) => c.refdes.toUpperCase().includes(kw)).slice(0, 8);
  }, [components, search]);

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ margin: 0 }}>{boardName}</h2>
      <p style={{ marginTop: 6, opacity: 0.8 }}>
        boardId: {boardId} · size: {boardWidthMm}mm × {boardHeightMm}mm
      </p>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "10px 0 14px" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => setLayerMode("all")}
            style={{ padding: "6px 10px", borderRadius: 8, border: layerMode === "all" ? "1px solid #22d3ee" : "1px solid #334155", background: layerMode === "all" ? "#0e7490" : "#111827", color: "#e2e8f0" }}
          >
            All
          </button>
          <button
            onClick={() => setLayerMode("fcu")}
            style={{ padding: "6px 10px", borderRadius: 8, border: layerMode === "fcu" ? "1px solid #22d3ee" : "1px solid #334155", background: layerMode === "fcu" ? "#0e7490" : "#111827", color: "#e2e8f0" }}
          >
            F.Cu
          </button>
          <button
            onClick={() => setLayerMode("bcu")}
            style={{ padding: "6px 10px", borderRadius: 8, border: layerMode === "bcu" ? "1px solid #22d3ee" : "1px solid #334155", background: layerMode === "bcu" ? "#0e7490" : "#111827", color: "#e2e8f0" }}
          >
            B.Cu
          </button>
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => setViewMode("2d")}
            style={{ padding: "6px 10px", borderRadius: 8, border: viewMode === "2d" ? "1px solid #22d3ee" : "1px solid #334155", background: viewMode === "2d" ? "#155e75" : "#111827", color: "#e2e8f0" }}
          >
            2D
          </button>
          <button
            onClick={() => setViewMode("3d")}
            style={{ padding: "6px 10px", borderRadius: 8, border: viewMode === "3d" ? "1px solid #22d3ee" : "1px solid #334155", background: viewMode === "3d" ? "#155e75" : "#111827", color: "#e2e8f0" }}
          >
            3D
          </button>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索元件，如 U1200"
          style={{ minWidth: 220, padding: "7px 10px", borderRadius: 8, border: "1px solid #334155", background: "#0b1220", color: "#e2e8f0" }}
        />

        {searchMatches.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {searchMatches.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setFocusComponentId(c.id);
                  setHoveredFeature("component", c.id);
                }}
                style={{ padding: "6px 9px", borderRadius: 8, border: "1px solid #334155", background: "#1f2937", color: "#c7d2fe" }}
              >
                {c.refdes}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && <p>加载中...</p>}
      {error && <p style={{ color: "#f87171" }}>{error}</p>}

      {!loading && !error && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
          {viewMode === "2d" ? (
            <PcbCanvas
              width={CANVAS_W}
              height={CANVAS_H}
              boardWidthMm={boardWidthMm}
              boardHeightMm={boardHeightMm}
              components={components}
              traces={traces}
              visibleLayers={visibleLayers}
              focusComponentId={focusComponentId}
              hoveredId={highlight.targetId}
              hoveredType={highlight.targetType}
              directIds={highlight.directComponentIds}
              traceHighlightIds={highlight.traceIds}
              onHoverFeature={(type, id) => setHoveredFeature(type, id)}
            />
          ) : (
            <ThreeBoardCanvas
              width={CANVAS_W}
              height={CANVAS_H}
              boardWidthMm={boardWidthMm}
              boardHeightMm={boardHeightMm}
              components={components}
              traces={traces}
              visibleLayers={visibleLayers}
              focusComponentId={focusComponentId}
              hoveredId={highlight.targetId}
              hoveredType={highlight.targetType}
              directIds={highlight.directComponentIds}
              traceHighlightIds={highlight.traceIds}
              onHoverFeature={(type, id) => setHoveredFeature(type, id)}
            />
          )}

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
            <p style={{ marginTop: -4, opacity: 0.7 }}>
              当前视图：<strong>{viewMode === "2d" ? "2D(Pixi)" : "3D(Three)"}</strong>
            </p>
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
