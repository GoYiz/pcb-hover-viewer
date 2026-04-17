"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { fetchBoardComponents, fetchBoardGeometry, fetchBoardMeta } from "@/lib/api";
import { useViewerStore } from "@/store/viewerStore";
import type { ComponentItem, TraceItem, ImportMetadata } from "@/types/pcb";

const PcbCanvas = dynamic(() => import("@/components/PcbCanvas"), { ssr: false });
const ThreeBoardCanvas = dynamic(() => import("@/components/ThreeBoardCanvas"), { ssr: false });

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
  initialZones?: TraceItem[];
  initialVias?: TraceItem[];
  initialPads?: TraceItem[];
  initialKeepouts?: TraceItem[];
  initialSilkscreen?: TraceItem[];
  initialDrills?: TraceItem[];
  importMetadata?: ImportMetadata;
};

export default function BoardViewerClient({
  boardId,
  boardName,
  boardWidthMm: initialBoardWidthMm,
  boardHeightMm: initialBoardHeightMm,
  initialComponents,
  initialTraces,
  initialZones,
  initialVias,
  initialPads,
  initialKeepouts,
  initialSilkscreen,
  initialDrills,
  importMetadata,
}: Props) {
  const [components, setComponents] = useState<ComponentItem[]>(initialComponents || []);
  const [traces, setTraces] = useState<TraceItem[]>(initialTraces || []);
  const [zones] = useState<TraceItem[]>(initialZones || []);
  const [vias] = useState<TraceItem[]>(initialVias || []);
  const [pads] = useState<TraceItem[]>(initialPads || []);
  const [keepouts] = useState<TraceItem[]>(initialKeepouts || []);
  const [silkscreen] = useState<TraceItem[]>(initialSilkscreen || []);
  const [drills] = useState<TraceItem[]>(initialDrills || []);
  const [boardWidthMm, setBoardWidthMm] = useState(initialBoardWidthMm || 160);
  const [boardHeightMm, setBoardHeightMm] = useState(initialBoardHeightMm || 90);
  const [loading, setLoading] = useState(!(initialComponents?.length && initialTraces?.length));
  const [error, setError] = useState<string | null>(null);
  const [layerMode, setLayerMode] = useState<"all" | "fcu" | "bcu">("all");
  const [urlReady, setUrlReady] = useState(false);
  const [viewMode, setViewMode] = useState<"leafer" | "three">("leafer");
  const [search, setSearch] = useState("");
  const [focusComponentId, setFocusComponentId] = useState<string | undefined>();
  const [canvasBridge, setCanvasBridge] = useState({ tool: "select", selectionFilter: "all", visibleDetail: "-", zoom: "1.000", selectedComponents: 0, selectedTraces: 0 });
  const [urlSelection, setUrlSelection] = useState({ sc: [] as string[], st: [] as string[] });

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

  const importWarnings = importMetadata?.warnings || [];
  const topImportLayers = useMemo(() => Object.entries(importMetadata?.stats?.traceCountByLayer || {}).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 5), [importMetadata]);
  const importSemantics = useMemo(() => Object.entries(importMetadata?.stats?.traceCountBySemantic || {}).sort((a, b) => Number(b[1]) - Number(a[1])), [importMetadata]);
  const importGeometryBuckets = useMemo(() => Object.entries(importMetadata?.stats?.geometryArrayCounts || {}).sort((a, b) => Number(b[1]) - Number(a[1])), [importMetadata]);
  const totalImportedGeometry = useMemo(() => importGeometryBuckets.reduce((acc, [, count]) => acc + Number(count), 0), [importGeometryBuckets]);
  const liveEnabledOverlays = useMemo(() => (canvasBridge.visibleDetail || '').split(',').map((s) => s.trim()).filter((name) => ['zones','vias','pads','keepouts','silkscreen','drills'].includes(name)), [canvasBridge.visibleDetail]);

  const netCount = useMemo(() => {
    const nets = new Set<string>();
    for (const c of components) for (const net of c.netIds || []) nets.add(String(net));
    for (const t of traces) nets.add(String(t.netId));
    return nets.size;
  }, [components, traces]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const layer = params.get("layer");
    const view = params.get("view");
    if (layer === "fcu" || layer === "bcu" || layer === "all") setLayerMode(layer);
    if (view === "leafer" || view === "three") setViewMode(view);
    setUrlReady(true);
  }, []);

  useEffect(() => {
    if (!urlReady) return;
    const url = new URL(window.location.href);
    if (layerMode === "all") url.searchParams.delete("layer");
    else url.searchParams.set("layer", layerMode);
    if (viewMode === "leafer") url.searchParams.delete("view");
    else url.searchParams.set("view", viewMode);
    window.history.replaceState({}, "", url.toString());
  }, [layerMode, viewMode, urlReady]);

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

    let targetType: "component" | "trace" | undefined = hoveredFeatureType;
    let targetId: string | undefined = hoveredFeatureId;

    if (!targetType || !targetId) {
      const totalSelected = urlSelection.sc.length + urlSelection.st.length;
      if (totalSelected === 1) {
        if (urlSelection.sc.length === 1) {
          targetType = "component";
          targetId = urlSelection.sc[0];
        } else if (urlSelection.st.length === 1) {
          targetType = "trace";
          targetId = urlSelection.st[0];
        }
      }
    }

    if (!targetId || !targetType) {
      setHighlight({ targetId: undefined, targetType: undefined, directComponentIds: [], traceIds: [], netIds: [] });
      return;
    }

    let netIds: string[] = [];
    if (targetType === "component") netIds = componentNetMap.get(targetId) || [];
    else {
      const trace = traces.find((t) => t.id === targetId);
      netIds = trace ? [trace.netId] : [];
    }

    const directComponentIds = [...new Set(netIds.flatMap((n) => [...(netToComponents.get(n) || new Set())]))].filter(
      (id) => !(targetType === "component" && id === targetId),
    );
    const traceIds = [...new Set(netIds.flatMap((n) => [...(netToTraces.get(n) || new Set())]))];

    setHighlight({ targetId, targetType, directComponentIds, traceIds, netIds });
  }, [components, traces, hoveredFeatureId, hoveredFeatureType, urlSelection, setHighlight]);

  const searchMatches = useMemo(() => {
    const kw = search.trim().toUpperCase();
    if (!kw) return [] as ComponentItem[];
    return components.filter((c) => c.refdes.toUpperCase().includes(kw)).slice(0, 8);
  }, [components, search]);

  const hoveredComponent = useMemo(
    () => (highlight.targetType === "component" ? components.find((c) => c.id === highlight.targetId) : undefined),
    [components, highlight.targetId, highlight.targetType],
  );

  const hoveredTrace = useMemo(
    () => (highlight.targetType === "trace" ? traces.find((t) => t.id === highlight.targetId) : undefined),
    [traces, highlight.targetId, highlight.targetType],
  );

  useEffect(() => {
    if (!focusComponentId) return;
    const timer = window.setTimeout(() => setFocusComponentId(undefined), 240);
    return () => window.clearTimeout(timer);
  }, [focusComponentId]);

  useEffect(() => {
    const readUrlSelection = () => {
      const url = new URL(window.location.href);
      const sc = (url.searchParams.get("sc") || "").split(",").filter(Boolean);
      const st = (url.searchParams.get("st") || "").split(",").filter(Boolean);
      setUrlSelection((prev) => (prev.sc.join(",") === sc.join(",") && prev.st.join(",") === st.join(",")) ? prev : { sc, st });
    };
    readUrlSelection();
    const timer = window.setInterval(readUrlSelection, 300);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const parseBridge = () => {
      const node = document.querySelector('[data-testid="canvas-state-bridge"]');
      const text = node?.textContent || "";
      if (!text) return;
      const pick = (key: string) => {
        const m = text.match(new RegExp(`${key}=([^\n]+)`));
        return m ? m[1].trim() : "";
      };
      const tool = pick("tool") || "select";
      const zoom = pick("zoom") || "1.000";
      const sc = pick("selected_components");
      const st = pick("selected_traces");
      const sf = pick("selection_filter") || "all";
      const vd = pick("visible_detail") || "-";
      setCanvasBridge({
        tool,
        selectionFilter: sf,
        visibleDetail: vd,
        zoom,
        selectedComponents: !sc || sc === "-" ? 0 : sc.split(",").filter(Boolean).length,
        selectedTraces: !st || st === "-" ? 0 : st.split(",").filter(Boolean).length,
      });
    };
    parseBridge();
    const timer = window.setInterval(parseBridge, 400);
    return () => window.clearInterval(timer);
  }, [viewMode, boardId]);

  const applyFocusedSelectionToUrl = (id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("sc", id);
    url.searchParams.delete("st");
    window.history.replaceState({}, "", url.toString());
  };

  const applySharedSelection = (type?: "component" | "trace", id?: string) => {
    const url = new URL(window.location.href);
    if (!type || !id) {
      url.searchParams.delete("sc");
      url.searchParams.delete("st");
      window.history.replaceState({}, "", url.toString());
      setHoveredFeature(undefined, undefined);
      return;
    }
    if (type === "component") {
      url.searchParams.set("sc", id);
      url.searchParams.delete("st");
      setFocusComponentId(id);
    } else {
      url.searchParams.set("st", id);
      url.searchParams.delete("sc");
    }
    window.history.replaceState({}, "", url.toString());
    setHoveredFeature(type, id);
  };

  const stageStatus = viewMode === "leafer" ? "Realtime 2D workbench" : "Spatial inspection";
  const targetLabel = hoveredFeatureType === "component" ? hoveredComponent?.refdes || highlight.targetId || "None" : highlight.targetId || "None";
  const sourceHint = loading ? "Streaming geometry" : error ? "Load fault" : "Live board state";

  return (
    <div className="console-shell">
      <section className="console-hero console-hero-board">
        <div className="hero-copy">
          <div className="eyebrow">PCB INTELLIGENCE WORKBENCH</div>
          <h1 className="hero-title">{boardName || boardId}</h1>
          <p className="hero-subtitle">
            Industrial-grade inspection console for layer isolation, relation tracing, precision measurement, and workbench state export.
          </p>
          <div className="hero-chip-row">
            <span className="console-chip console-chip-cyan">{viewMode === "leafer" ? "Leafer 2D" : "Three 3D"}</span>
            <span className="console-chip console-chip-amber">Electrical graph</span>
            <span className="console-chip">{layerMode === "all" ? "All copper" : layerMode === "fcu" ? "Front copper" : "Back copper"}</span>
          </div>
        </div>

        <div className="hero-metrics">
          <div className="metric-card metric-card-accent">
            <span className="metric-label">Board envelope</span>
            <strong className="metric-value">{boardWidthMm} × {boardHeightMm}</strong>
            <span className="metric-meta">millimetres</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Components</span>
            <strong className="metric-value">{components.length}</strong>
            <span className="metric-meta">placement objects</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Trace segments</span>
            <strong className="metric-value">{traces.length}</strong>
            <span className="metric-meta">routed geometry</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Distinct nets</span>
            <strong className="metric-value">{netCount}</strong>
            <span className="metric-meta">electrical relationships</span>
          </div>
        </div>
      </section>

      <section className="summary-rail">
        <div className="summary-cell">
          <span className="summary-label">Renderer</span>
          <strong className="summary-value">{viewMode === "leafer" ? "Leafer" : "Three"}</strong>
          <span className="summary-meta">{stageStatus}</span>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Layer scope</span>
          <strong className="summary-value">{layerMode.toUpperCase()}</strong>
          <span className="summary-meta">{visibleLayers.join(" + ")}</span>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Current target</span>
          <strong className="summary-value">{targetLabel}</strong>
          <span className="summary-meta">{highlight.targetType || "Awaiting hover"}</span>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Workbench tool</span>
          <strong className="summary-value">{canvasBridge.tool}</strong>
          <span className="summary-meta">filter {canvasBridge.selectionFilter}</span>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Relation graph</span>
          <strong className="summary-value">{highlight.netIds.length}</strong>
          <span className="summary-meta">nets in active context</span>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Source state</span>
          <strong className="summary-value">{error ? "Fault" : loading ? "Loading" : "Ready"}</strong>
          <span className="summary-meta">{error || sourceHint}</span>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Live canvas state</span>
          <strong className="summary-value">{canvasBridge.zoom}×</strong>
          <span className="summary-meta">{canvasBridge.selectedComponents} comps · {canvasBridge.selectedTraces} traces · {canvasBridge.visibleDetail}</span>
        </div>
      </section>

      <section className="console-commandbar">
        <div className="tool-rack">
          {TOOL_SECTIONS.map((section) => (
            <div key={section.title} className="tool-cluster">
              <div className="tool-cluster-label">{section.title}</div>
              <div className="tool-chip-row">
                {section.items.map((item, idx) => (
                  <span key={item} className={`tool-chip ${idx === 0 ? "tool-chip-active" : ""}`}>{item}</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="control-rack">
          <div className="control-stack">
            <span className="control-label">Copper layer</span>
            <div className="segmented-control">
              <button className={layerMode === "all" ? "segmented-active" : ""} onClick={() => setLayerMode("all")}>All</button>
              <button className={layerMode === "fcu" ? "segmented-active" : ""} onClick={() => setLayerMode("fcu")}>F.Cu</button>
              <button className={layerMode === "bcu" ? "segmented-active" : ""} onClick={() => setLayerMode("bcu")}>B.Cu</button>
            </div>
          </div>

          <div className="control-stack">
            <span className="control-label">Renderer</span>
            <div className="segmented-control">
              <button className={viewMode === "leafer" ? "segmented-active" : ""} onClick={() => setViewMode("leafer")}>Leafer</button>
              <button className={viewMode === "three" ? "segmented-active" : ""} onClick={() => setViewMode("three")}>Three</button>
            </div>
          </div>

          <div className="control-stack control-stack-search">
            <span className="control-label">Command locate</span>
            <input
              className="workbench-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && searchMatches[0]) {
                  const c = searchMatches[0];
                  setFocusComponentId(c.id);
                  setHoveredFeature("component", c.id);
                  applyFocusedSelectionToUrl(c.id);
                  setSearch("");
                }
              }}
              placeholder="Search refdes, e.g. U1200"
            />
          </div>
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
                  applyFocusedSelectionToUrl(c.id);
                  setSearch("");
                }}
              >
                {c.refdes}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="console-main-grid console-main-grid-refined">
        <div className="canvas-stage">
          <div className="canvas-stage-header">
            <div>
              <div className="canvas-stage-title">Live board stage</div>
              <div className="canvas-stage-meta">{stageStatus} · hover graph tracing · export-ready state</div>
            </div>
            <div className="canvas-stage-badges">
              <span className="stage-badge">{components.length} comps</span>
              <span className="stage-badge">{traces.length} traces</span>
              <span className="stage-badge">{netCount} nets</span>
            </div>
          </div>
          <div className="canvas-stage-frame">
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
                zones={zones}
                vias={vias}
                pads={pads}
                keepouts={keepouts}
                silkscreen={silkscreen}
                drills={drills}
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
                selectedComponentIds={urlSelection.sc}
                selectedTraceIds={urlSelection.st}
                onHoverFeature={(type, id) => setHoveredFeature(type, id)}
                onSelectFeature={(type, id) => applySharedSelection(type, id)}
              />
            )}
          </div>
        </div>

        <aside className="inspector-stack inspector-stack-refined">
          <div className="inspector-card inspector-card-glow">
            <div className="inspector-title-row">
              <div>
                <div className="inspector-title">Relation monitor</div>
                <div className="inspector-meta">Shared visual grammar across 2D and 3D review</div>
              </div>
              <span className="signal-pill">{highlight.targetId ? "Tracking" : "Idle"}</span>
            </div>
            <div className="inspector-grid">
              <div className="inspector-kv"><span>Target</span><strong>{highlight.targetId || "None"}</strong></div>
              <div className="inspector-kv"><span>Type</span><strong>{highlight.targetType || "—"}</strong></div>
              <div className="inspector-kv"><span>Connected nets</span><strong>{highlight.netIds.length}</strong></div>
              <div className="inspector-kv"><span>Related traces</span><strong>{highlight.traceIds.length}</strong></div>
              <div className="inspector-kv"><span>Related components</span><strong>{highlight.directComponentIds.length}</strong></div>
              <div className="inspector-kv"><span>Layer mode</span><strong>{layerMode.toUpperCase()}</strong></div>
            </div>
          </div>

          <div className="inspector-card inspector-card-dense">
            <div className="inspector-title">Object dossier</div>
            {hoveredComponent ? (
              <div className="focus-card">
                <div className="focus-refdes">{hoveredComponent.refdes}</div>
                <div className="focus-meta">{hoveredComponent.footprint || "Unknown footprint"}</div>
                <div className="focus-meta">nets: {(hoveredComponent.netIds || []).join(", ") || "—"}</div>
              </div>
            ) : hoveredTrace ? (
              <div className="focus-card focus-card-trace">
                <div className="focus-refdes">{hoveredTrace.id}</div>
                <div className="focus-meta">layer: {hoveredTrace.layerId}</div>
                <div className="focus-meta">net: {hoveredTrace.netId}</div>
              </div>
            ) : (
              <p className="inspector-meta">No active object. Hover a trace or component to populate this dossier.</p>
            )}
          </div>

          <div className="inspector-card inspector-card-dense">
            <div className="inspector-title">Bench context</div>
            <div className="inspector-grid">
              <div className="inspector-kv"><span>Board</span><strong>{boardName || boardId}</strong></div>
              <div className="inspector-kv"><span>Envelope</span><strong>{boardWidthMm} × {boardHeightMm}</strong></div>
              <div className="inspector-kv"><span>Renderer</span><strong>{viewMode === "leafer" ? "Leafer" : "Three"}</strong></div>
              <div className="inspector-kv"><span>Console state</span><strong>{error ? "Fault" : loading ? "Loading" : "Ready"}</strong></div>
            </div>
          </div>

          {importMetadata && (
            <div className="inspector-card inspector-card-dense">
              <div className="inspector-title">Import telemetry</div>
              <div className="inspector-grid">
                <div className="inspector-kv"><span>Format</span><strong>{importMetadata.sourceFormat}</strong></div>
                <div className="inspector-kv"><span>Warnings</span><strong>{importWarnings.length}</strong></div>
                <div className="inspector-kv"><span>Layer classes</span><strong>{new Set(Object.values(importMetadata.layerCategories || {})).size}</strong></div>
                <div className="inspector-kv"><span>Imported copper traces</span><strong>{importMetadata.stats?.traceCount || traces.length}</strong></div>
                <div className="inspector-kv"><span>Total imported geometry</span><strong>{totalImportedGeometry}</strong></div>
                <div className="inspector-kv"><span>Enabled overlays</span><strong>{liveEnabledOverlays.join(', ') || '—'}</strong></div>
              </div>
              {importWarnings.length > 0 && (
                <div className="focus-card focus-card-trace" style={{ marginTop: 14 }}>
                  {importWarnings.map((warning) => (
                    <div key={warning} className="focus-meta">• {warning}</div>
                  ))}
                </div>
              )}
              {importGeometryBuckets.length > 0 && (
                <div className="inspector-grid" style={{ marginTop: 14 }}>
                  {importGeometryBuckets.map(([name, count]) => (
                    <div key={name} className="inspector-kv"><span>{name}</span><strong>{count}</strong></div>
                  ))}
                </div>
              )}
              {importSemantics.length > 0 && (
                <div className="focus-card" style={{ marginTop: 14 }}>
                  {importSemantics.map(([name, count]) => (
                    <div key={name} className="focus-meta">• {name}: {count}</div>
                  ))}
                </div>
              )}
              {topImportLayers.length > 0 && (
                <div className="inspector-grid" style={{ marginTop: 14 }}>
                  {topImportLayers.map(([layer, count]) => (
                    <div key={layer} className="inspector-kv"><span>{layer}</span><strong>{count}</strong></div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="inspector-card inspector-card-dense">
            <div className="inspector-title">Console notes</div>
            <ul className="tips-list">
              <li>Wheel to zoom, drag to pan / orbit.</li>
              <li>Shift + drag box-selects in 2D workbench.</li>
              <li>Search drives focus, URL selection, and export state.</li>
              <li>Leafer is tuned for dense board inspection and annotation.</li>
            </ul>
          </div>
        </aside>
      </section>
    </div>
  );
}
