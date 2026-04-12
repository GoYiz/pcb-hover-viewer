"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import ThreeBoardCanvas from "@/components/ThreeBoardCanvas";
import { fetchBoardComponents, fetchBoardGeometry, fetchBoardMeta } from "@/lib/api";
import { useViewerStore } from "@/store/viewerStore";
import type { ComponentItem, TraceItem } from "@/types/pcb";

const PcbCanvas = dynamic(() => import("@/components/PcbCanvas"), { ssr: false });

const CANVAS_W = 980;
const CANVAS_H = 680;

const TOOL_SECTIONS = [
  { title: "Inspect", items: ["Select", "Probe", "Measure"] },
  { title: "Graph", items: ["Electrical", "Functional", "Overlay"] },
  { title: "Actions", items: ["Export", "Snapshot"] },
];

type Props = {
  boardId: string;
  boardName?: string;
  boardWidthMm?: number;
  boardHeightMm?: number;
  initialComponents?: ComponentItem[];
  initialTraces?: TraceItem[];
};

export default function BoardViewerClient({ boardId, boardName, boardWidthMm: initialBoardWidthMm, boardHeightMm: initialBoardHeightMm, initialComponents, initialTraces }: Props) {
  const [components, setComponents] = useState<ComponentItem[]>(initialComponents || []);
  const [traces, setTraces] = useState<TraceItem[]>(initialTraces || []);
  const [boardWidthMm, setBoardWidthMm] = useState(initialBoardWidthMm || 160);
  const [boardHeightMm, setBoardHeightMm] = useState(initialBoardHeightMm || 90);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
    const [layerMode, setLayerMode] = useState<"all" | "fcu" | "bcu">("all");
  const [viewMode, setViewMode] = useState<"leafer" | "three">("leafer");
  const [search, setSearch] = useState("");
  const [focusComponentId, setFocusComponentId] = useState<string | undefined>();

  const hoveredFeatureId = useViewerStore((s) => s.hoveredFeatureId);
  const hoveredFeatureType = useViewerStore((s) => s.hoveredFeatureType);
  const setHoveredFeature = useViewerStore((s) => s.setHoveredFeature);
  const highlight = useViewerStore((s) => s.highlight);
  const setHighlight = useViewerStore((s) => s.setHighlight);

  const visibleLayers = useMemo(() => {
    if (layerMode === "fcu") return ["F.Cu"];
    if (layerMode === "bcu") return ["B.Cu"];
    return ["F.Cu", "B.Cu"];
  }, [layerMode]);

  useEffect(() => {
    if (initialComponents?.length && initialTraces?.length) {
      setLoading(false);
      return;
    }

    let alive = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [meta, comps, geom] = await Promise.all([
          fetchBoardMeta(boardId),
          fetchBoardComponents(boardId),
          fetchBoardGeometry(boardId),
        ]);
        if (!alive) return;
        setBoardWidthMm(meta.board.widthMm);
        setBoardHeightMm(meta.board.heightMm);
        setComponents(comps.components);
        setTraces(geom.traces);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load board");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [boardId, initialComponents, initialTraces]);

  useEffect(() => {
    const componentNetMap = new Map<string, string[]>();
    const netToComponents = new Map<string, Set<string>>();
    const netToTraces = new Map<string, Set<string>>();

    for (const c of components) {
      const nets = c.netIds || [];
      componentNetMap.set(c.id, nets);
      for (const net of nets) {
        if (!netToComponents.has(net)) netToComponents.set(net, new Set());
        netToComponents.get(net)?.add(c.id);
      }
    }

    for (const t of traces) {
      if (!netToTraces.has(t.netId)) netToTraces.set(t.netId, new Set());
      netToTraces.get(t.netId)?.add(t.id);
    }

    if (!hoveredFeatureId || !hoveredFeatureType) {
      setHighlight({ targetId: undefined, targetType: undefined, directComponentIds: [], traceIds: [], netIds: [] });
      return;
    }

    let netIds: string[] = [];
    if (hoveredFeatureType === "component") netIds = componentNetMap.get(hoveredFeatureId) || [];
    else {
      const trace = traces.find((t) => t.id === hoveredFeatureId);
      netIds = trace ? [trace.netId] : [];
    }

    const directComponentIds = [...new Set(netIds.flatMap((n) => [...(netToComponents.get(n) || new Set())]))].filter((id) => !(hoveredFeatureType === "component" && id === hoveredFeatureId));
    const traceIds = [...new Set(netIds.flatMap((n) => [...(netToTraces.get(n) || new Set())]))];

    setHighlight({
      targetId: hoveredFeatureId,
      targetType: hoveredFeatureType,
      directComponentIds,
      traceIds,
      netIds,
    });
  }, [components, traces, hoveredFeatureId, hoveredFeatureType, setHighlight]);

  const searchMatches = useMemo(() => {
    const kw = search.trim().toUpperCase();
    if (!kw) return [] as ComponentItem[];
    return components.filter((c) => c.refdes.toUpperCase().includes(kw)).slice(0, 8);
  }, [components, search]);

  const hoveredComponent = useMemo(
    () => (hoveredFeatureType === "component" ? components.find((c) => c.id === hoveredFeatureId) : undefined),
    [components, hoveredFeatureId, hoveredFeatureType],
  );

  const hoveredTrace = useMemo(
    () => (hoveredFeatureType === "trace" ? traces.find((t) => t.id === hoveredFeatureId) : undefined),
    [traces, hoveredFeatureId, hoveredFeatureType],
  );

  useEffect(() => {
    if (!focusComponentId) return;
    const timer = window.setTimeout(() => setFocusComponentId(undefined), 120);
    return () => window.clearTimeout(timer);
  }, [focusComponentId]);

  return (
    <div className="workbench-shell">
      <div className="workbench-header">
        <div>
          <div className="eyebrow">PCB Intelligence Workbench</div>
          <h1 className="workbench-title">{boardName || boardId}</h1>
          <div className="workbench-subtitle">
            {boardWidthMm}mm × {boardHeightMm}mm · {components.length} components · {traces.length} traces
          </div>
        </div>
        <div className="header-badges">
          <span className="badge badge-accent">{viewMode === "leafer" ? "Leafer 2D" : "Three 3D"}</span>
          <span className="badge">Electrical Mode</span>
        </div>
      </div>

      <div className="toolbar-panel">
        <div className="toolbar-groups">
          {TOOL_SECTIONS.map((section) => (
            <div key={section.title} className="tool-group">
              <div className="tool-group-title">{section.title}</div>
              <div className="tool-chip-row">
                {section.items.map((item, idx) => (
                  <button key={item} className={`tool-chip ${idx === 0 ? "tool-chip-active" : ""}`}>{item}</button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="toolbar-controls">
          <div className="segmented-control">
            <button className={layerMode === "all" ? "segmented-active" : ""} onClick={() => setLayerMode("all")}>All</button>
            <button className={layerMode === "fcu" ? "segmented-active" : ""} onClick={() => setLayerMode("fcu")}>F.Cu</button>
            <button className={layerMode === "bcu" ? "segmented-active" : ""} onClick={() => setLayerMode("bcu")}>B.Cu</button>
          </div>

          <div className="segmented-control">
            <button className={viewMode === "leafer" ? "segmented-active" : ""} onClick={() => setViewMode("leafer")}>Leafer</button>
            <button className={viewMode === "three" ? "segmented-active" : ""} onClick={() => setViewMode("three")}>Three</button>
          </div>

          <input
            className="workbench-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search refdes, e.g. U1200"
          />
        </div>

        {searchMatches.length > 0 && (
          <div className="search-results">
            {searchMatches.map((c) => (
              <button
                key={c.id}
                className="search-pill"
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

      <div className="workbench-grid">
        <div className="canvas-panel">
          {loading ? (
            <div className="empty-panel">Loading board…</div>
          ) : error ? (
            <div className="empty-panel">{error}</div>
          ) : viewMode === "leafer" ? (
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
        </div>

        <aside className="inspector-panel">
          <div className="inspector-section">
            <div className="inspector-title">Relation Inspector</div>
            <div className="inspector-meta">Unified visual language across 2D / 3D</div>
          </div>

          <div className="inspector-section">
            <div className="inspector-kv"><span>Target</span><strong>{highlight.targetId || "None"}</strong></div>
            <div className="inspector-kv"><span>Type</span><strong>{highlight.targetType || "—"}</strong></div>
            <div className="inspector-kv"><span>Connected nets</span><strong>{highlight.netIds.length}</strong></div>
            <div className="inspector-kv"><span>Related traces</span><strong>{highlight.traceIds.length}</strong></div>
            <div className="inspector-kv"><span>Related components</span><strong>{highlight.directComponentIds.length}</strong></div>
          </div>

          {hoveredComponent && (
            <div className="inspector-section">
              <div className="inspector-title">Component</div>
              <div className="focus-card">
                <div className="focus-refdes">{hoveredComponent.refdes}</div>
                <div className="focus-meta">{hoveredComponent.footprint || "Unknown footprint"}</div>
                <div className="focus-meta">nets: {(hoveredComponent.netIds || []).join(", ") || "—"}</div>
              </div>
            </div>
          )}

          {hoveredTrace && (
            <div className="inspector-section">
              <div className="inspector-title">Trace</div>
              <div className="focus-card">
                <div className="focus-refdes">{hoveredTrace.id}</div>
                <div className="focus-meta">layer: {hoveredTrace.layerId}</div>
                <div className="focus-meta">net: {hoveredTrace.netId}</div>
              </div>
            </div>
          )}

          <div className="inspector-section">
            <div className="inspector-title">Tips</div>
            <ul className="tips-list">
              <li>Mouse wheel to zoom</li>
              <li>Drag to pan / orbit</li>
              <li>Leafer is now the default 2D renderer</li>
              <li>Hover trace or component to inspect graph</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
