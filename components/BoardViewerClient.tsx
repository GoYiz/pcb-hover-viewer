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
      (relationIndex.compToNets.get(hoveredFeatureId) || new Set()).forEach((n) => netSet.add(n));
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
    const timer = window.setTimeout(() => setFocusComponentId(undefined), 120);
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
    <div className="page-shell">
      <div className="title-row">
        <h2 style={{ margin: 0 }}>{boardName}</h2>
        <span className="chip">{boardWidthMm}mm × {boardHeightMm}mm</span>
        <span className="chip">{viewMode === "2d" ? "Pixi 2D" : "Three 3D"}</span>
      </div>
      <p className="dim" style={{ marginTop: 6 }}>boardId: {boardId}</p>

      <div className="topbar">
        <div className="toolbar-group">
          <button className={`btn ${layerMode === "all" ? "active" : ""}`} onClick={() => setLayerMode("all")}>All</button>
          <button className={`btn ${layerMode === "fcu" ? "active" : ""}`} onClick={() => setLayerMode("fcu")}>F.Cu</button>
          <button className={`btn ${layerMode === "bcu" ? "active" : ""}`} onClick={() => setLayerMode("bcu")}>B.Cu</button>
        </div>

        <div className="toolbar-group">
          <button className={`btn ${viewMode === "2d" ? "active" : ""}`} onClick={() => setViewMode("2d")}>2D</button>
          <button className={`btn ${viewMode === "3d" ? "active" : ""}`} onClick={() => setViewMode("3d")}>3D</button>
        </div>

        <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search component: U1200" />

        {searchMatches.length > 0 && (
          <div className="toolbar-group">
            {searchMatches.map((c) => (
              <button
                key={c.id}
                className="btn ghost"
                onClick={() => {
                  setFocusComponentId(c.id);
                  setHoveredFeature("component", c.id);
                }}
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
        <div className="canvas-layout">
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

          <aside className="side-panel" style={{ minHeight: CANVAS_H }}>
            <h3 className="section-title">Relation Inspector</h3>
            {!hoveredFeatureId && <p className="dim">Hover component or trace to inspect relations.</p>}

            {hoveredComponent && (
              <div style={{ display: "grid", gap: 10 }}>
                <div><strong>Target Component:</strong> {hoveredComponent.refdes}</div>
                <div><strong>Footprint:</strong> {hoveredComponent.footprint || "-"}</div>
                <div><strong>Related Components:</strong> {highlight.directComponentIds.length}</div>
                <div><strong>Nets:</strong> {highlight.netIds.join(", ") || "none"}</div>
                <div><strong>Highlighted Traces:</strong> {highlight.traceIds.length}</div>
              </div>
            )}

            {hoveredTrace && (
              <div style={{ display: "grid", gap: 10 }}>
                <div><strong>Target Trace:</strong> {hoveredTrace.id}</div>
                <div><strong>Net:</strong> {hoveredTrace.netId}</div>
                <div><strong>Related Components:</strong> {highlight.directComponentIds.length}</div>
                <div><strong>Related Traces:</strong> {highlight.traceIds.length}</div>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
