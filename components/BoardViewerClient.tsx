"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { fetchBoardComponents, fetchBoardGeometry, fetchBoardMeta } from "@/lib/api";
import { useViewerStore } from "@/store/viewerStore";
import type { HoverFeatureType } from "@/store/viewerStore";
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

const OVERLAY_DETAIL_NAMES = ["zones", "vias", "pads", "keepouts", "silkscreen", "documentation", "mechanical", "graphics", "drills"];
const BASE_VISIBLE_DETAIL_NAMES = ["grid", "components", "labels", "measures"];
const OVERLAY_FAMILY_PRESETS = {
  all: [...OVERLAY_DETAIL_NAMES],
  copper: ["zones", "vias", "pads"],
  fabrication: ["keepouts", "silkscreen", "drills"],
  documentation: ["documentation", "mechanical", "graphics"],
} as const;

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
  initialDocumentation?: TraceItem[];
  initialMechanical?: TraceItem[];
  initialGraphics?: TraceItem[];
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
  initialDocumentation,
  initialMechanical,
  initialGraphics,
  initialDrills,
  importMetadata,
}: Props) {
  const [components, setComponents] = useState<ComponentItem[]>(initialComponents || []);
  const [traces, setTraces] = useState<TraceItem[]>(initialTraces || []);
  const [zones, setZones] = useState<TraceItem[]>(initialZones || []);
  const [vias, setVias] = useState<TraceItem[]>(initialVias || []);
  const [pads, setPads] = useState<TraceItem[]>(initialPads || []);
  const [keepouts, setKeepouts] = useState<TraceItem[]>(initialKeepouts || []);
  const [silkscreen, setSilkscreen] = useState<TraceItem[]>(initialSilkscreen || []);
  const [documentation, setDocumentation] = useState<TraceItem[]>(initialDocumentation || []);
  const [mechanical, setMechanical] = useState<TraceItem[]>(initialMechanical || []);
  const [graphics, setGraphics] = useState<TraceItem[]>(initialGraphics || []);
  const [drills, setDrills] = useState<TraceItem[]>(initialDrills || []);
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
  const importGeometryBuckets = useMemo(() => {
    const metaCounts = importMetadata?.stats?.geometryArrayCounts || {};
    if (Object.keys(metaCounts).length > 0) return Object.entries(metaCounts).sort((a, b) => Number(b[1]) - Number(a[1]));
    const fallbackCounts: Record<string, number> = {
      traces: traces.length,
      zones: zones.length,
      vias: vias.length,
      pads: pads.length,
      keepouts: keepouts.length,
      silkscreen: silkscreen.length,
      documentation: documentation.length,
      mechanical: mechanical.length,
      graphics: graphics.length,
      drills: drills.length,
    };
    return Object.entries(fallbackCounts).filter(([, count]) => Number(count) > 0).sort((a, b) => Number(b[1]) - Number(a[1]));
  }, [importMetadata, traces, zones, vias, pads, keepouts, silkscreen, documentation, mechanical, graphics, drills]);
  const totalImportedGeometry = useMemo(() => importGeometryBuckets.reduce((acc, [, count]) => acc + Number(count), 0), [importGeometryBuckets]);
  const [visibleDetail, setVisibleDetail] = useState<string[]>([...BASE_VISIBLE_DETAIL_NAMES, ...OVERLAY_DETAIL_NAMES]);
  const requestedEnabledOverlays = useMemo(() => visibleDetail.filter((name) => OVERLAY_DETAIL_NAMES.includes(name)), [visibleDetail]);
  const liveEnabledOverlays = useMemo(() => {
    const parsed = (canvasBridge.visibleDetail || '').split(',').map((s) => s.trim()).filter((name) => OVERLAY_DETAIL_NAMES.includes(name));
    return parsed.length ? parsed : requestedEnabledOverlays;
  }, [canvasBridge.visibleDetail, requestedEnabledOverlays]);
  const overlayFamilyCounts = useMemo(() => ({
    copper: zones.length + vias.length + pads.length,
    fabrication: keepouts.length + silkscreen.length + drills.length,
    documentation: documentation.length + mechanical.length + graphics.length,
  }), [zones, vias, pads, keepouts, silkscreen, drills, documentation, mechanical, graphics]);

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
    const vd = (params.get("vd") || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (layer === "fcu" || layer === "bcu" || layer === "all") setLayerMode(layer);
    if (view === "leafer" || view === "three") setViewMode(view);
    if (vd.length) setVisibleDetail(vd);
    setUrlReady(true);
  }, []);

  useEffect(() => {
    if (!urlReady) return;
    const url = new URL(window.location.href);
    if (layerMode === "all") url.searchParams.delete("layer");
    else url.searchParams.set("layer", layerMode);
    if (viewMode === "leafer") url.searchParams.delete("view");
    else url.searchParams.set("view", viewMode);
    const isDefaultVisibleDetail = visibleDetail.length === BASE_VISIBLE_DETAIL_NAMES.length + OVERLAY_DETAIL_NAMES.length
      && [...BASE_VISIBLE_DETAIL_NAMES, ...OVERLAY_DETAIL_NAMES].every((name) => visibleDetail.includes(name));
    if (isDefaultVisibleDetail) url.searchParams.delete("vd");
    else url.searchParams.set("vd", visibleDetail.join(","));
    window.history.replaceState({}, "", url.toString());
  }, [layerMode, viewMode, visibleDetail, urlReady]);

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
        setTraces(geom.traces || []);
        setZones(geom.zones || []);
        setVias(geom.vias || []);
        setPads(geom.pads || []);
        setKeepouts(geom.keepouts || []);
        setSilkscreen(geom.silkscreen || []);
        setDocumentation(geom.documentation || []);
        setMechanical(geom.mechanical || []);
        setGraphics(geom.graphics || []);
        setDrills(geom.drills || []);
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

    let targetType: HoverFeatureType | undefined = hoveredFeatureType;
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

  const overlayBucketMap = useMemo(() => ({
    zones,
    vias,
    pads,
    keepouts,
    silkscreen,
    documentation,
    mechanical,
    graphics,
    drills,
  }), [zones, vias, pads, keepouts, silkscreen, documentation, mechanical, graphics, drills]);

  const hoveredOverlay = useMemo(() => {
    const type = highlight.targetType;
    if (!type || type === "component" || type === "trace") return undefined;
    return (overlayBucketMap[type] || []).find((item) => item.id === highlight.targetId);
  }, [highlight.targetType, highlight.targetId, overlayBucketMap]);

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
        const m = text.match(new RegExp(`${key}=([^
]+)`));
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
      return;
    }
    if (type === "component") {
      url.searchParams.set("sc", id);
      url.searchParams.delete("st");
    } else {
      url.searchParams.set("st", id);
      url.searchParams.delete("sc");
    }
    window.history.replaceState({}, "", url.toString());
  };

  const stageStatus = loading ? "Loading board" : error ? "Data fault" : boardName || "Live workbench";
  const sourceHint = importMetadata?.sourceFormat ? `${importMetadata.sourceFormat} import` : "API-backed board";
  const overlayFamilyButtons = [
    { key: "all", label: "All", names: OVERLAY_FAMILY_PRESETS.all, tone: "var(--cyan)", count: overlayFamilyCounts.copper + overlayFamilyCounts.fabrication + overlayFamilyCounts.documentation },
    { key: "copper", label: "Copper", names: OVERLAY_FAMILY_PRESETS.copper, tone: "#38bdf8", count: overlayFamilyCounts.copper },
    { key: "fabrication", label: "Fab", names: OVERLAY_FAMILY_PRESETS.fabrication, tone: "#f59e0b", count: overlayFamilyCounts.fabrication },
    { key: "documentation", label: "Docs", names: OVERLAY_FAMILY_PRESETS.documentation, tone: "#22c55e", count: overlayFamilyCounts.documentation },
  ] as const;
  const activeOverlayFamily = overlayFamilyButtons.find(({ names }) => names.length === requestedEnabledOverlays.length && names.every((name) => requestedEnabledOverlays.includes(name)))?.key || null;
  const applyOverlayFamily = (names: readonly string[]) => {
    setVisibleDetail([...BASE_VISIBLE_DETAIL_NAMES, ...names]);
  };
  const overlayInspectTargets = useMemo(() => {
    const buckets: Array<{ family: string; kind: Exclude<HoverFeatureType, "component" | "trace">; items: TraceItem[] }> = [
      { family: "copper", kind: "zones", items: zones },
      { family: "copper", kind: "vias", items: vias },
      { family: "copper", kind: "pads", items: pads },
      { family: "fabrication", kind: "keepouts", items: keepouts },
      { family: "fabrication", kind: "silkscreen", items: silkscreen },
      { family: "fabrication", kind: "drills", items: drills },
      { family: "documentation", kind: "documentation", items: documentation },
      { family: "documentation", kind: "mechanical", items: mechanical },
      { family: "documentation", kind: "graphics", items: graphics },
    ];
    return buckets
      .map((bucket) => ({ ...bucket, sample: bucket.items[0] }))
      .filter((bucket): bucket is typeof bucket & { sample: TraceItem } => Boolean(bucket.sample));
  }, [zones, vias, pads, keepouts, silkscreen, drills, documentation, mechanical, graphics]);

  return (
    <div className="console-shell">
      <section className="console-hero workbench-hero workbench-hero-refined">
        <div className="hero-copy">
          <div className="eyebrow">PCB INTELLIGENCE WORKBENCH</div>
          <h1 className="hero-title">{boardName || "Board viewer"}</h1>
          <p className="hero-subtitle">
            Multi-surface board inspection with shared relation highlighting, search-driven navigation, live measurement telemetry, and production-style workbench controls.
          </p>
          <div className="hero-chip-row">
            <span className="console-chip console-chip-cyan">Canvas selection + graph context</span>
            <span className="console-chip console-chip-amber">2D/3D synchronized review</span>
            <span className="console-chip">Session-aware URL state</span>
          </div>
        </div>

        <div className="hero-metrics">
          <div className="metric-card metric-card-accent">
            <span className="metric-label">Board size</span>
            <strong className="metric-value">{boardWidthMm.toFixed(1)} × {boardHeightMm.toFixed(1)}</strong>
            <span className="metric-meta">millimetres · calibrated work envelope</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Components</span>
            <strong className="metric-value">{components.length}</strong>
            <span className="metric-meta">searchable inspection targets</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Copper traces</span>
            <strong className="metric-value">{traces.length}</strong>
            <span className="metric-meta">routed electrical primitives</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Imported geometry</span>
            <strong className="metric-value">{totalImportedGeometry}</strong>
            <span className="metric-meta">all semantic buckets combined</span>
          </div>
        </div>
      </section>

      <section className="summary-rail summary-rail-workbench">
        <div className="summary-cell">
          <span className="summary-label">Focus target</span>
          <strong className="summary-value">{highlight.targetId || "None"}</strong>
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

          <div className="control-stack">
            <span className="control-label">Overlay family</span>
            <div className="segmented-control segmented-control-wrap">
              {overlayFamilyButtons.map((item) => (
                <button key={item.key} data-testid={`overlay-family-${item.key}`} aria-label={`Overlay family ${item.label}`} className={activeOverlayFamily === item.key ? "segmented-active" : ""} onClick={() => applyOverlayFamily(item.names)}>{item.label}</button>
              ))}
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

        <div className="overlay-legend-bar" style={{ marginTop: 16 }}>
          {overlayFamilyButtons.map((item) => (
            <button key={item.key} data-testid={`overlay-legend-${item.key}`} aria-label={`Overlay legend ${item.label}`} className={`overlay-legend-pill ${activeOverlayFamily === item.key ? "overlay-legend-pill-active" : ""}`} onClick={() => applyOverlayFamily(item.names)}>
              <span className="overlay-legend-dot" style={{ background: item.tone }} />
              <span>{item.label}</span>
              <strong>{item.count}</strong>
            </button>
          ))}
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
                documentation={documentation}
                mechanical={mechanical}
                graphics={graphics}
                drills={drills}
                visibleDetail={visibleDetail}
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
                zones={zones}
                vias={vias}
                pads={pads}
                keepouts={keepouts}
                silkscreen={silkscreen}
                documentation={documentation}
                mechanical={mechanical}
                graphics={graphics}
                drills={drills}
                visibleDetail={visibleDetail}
                visibleLayers={visibleLayers}
                focusComponentId={focusComponentId}
                hoveredId={highlight.targetId}
                hoveredType={highlight.targetType}
                directIds={highlight.directComponentIds}
                traceHighlightIds={highlight.traceIds}
                selectedComponentIds={urlSelection.sc}
                selectedTraceIds={urlSelection.st}
                onHoverFeature={(type, id) => setHoveredFeature(type, id)}
                onSelectFeature={(type, id) => { if (type === "component" || type === "trace" || !type) applySharedSelection(type, id); }}
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
              <span className="signal-pill">{viewMode === "leafer" ? "2D surface" : "3D surface"}</span>
            </div>
            <div className="inspector-grid">
              <div className="inspector-kv"><span>Hovered component</span><strong>{hoveredComponent?.refdes || "—"}</strong></div>
              <div className="inspector-kv"><span>Hovered trace</span><strong>{hoveredTrace?.id || "—"}</strong></div>
              <div className="inspector-kv"><span>Hovered overlay</span><strong>{hoveredOverlay ? `${highlight.targetType}:${hoveredOverlay.id}` : "—"}</strong></div>
              <div className="inspector-kv"><span>Direct components</span><strong>{highlight.directComponentIds.length}</strong></div>
              <div className="inspector-kv"><span>Highlighted traces</span><strong>{highlight.traceIds.length}</strong></div>
              <div className="inspector-kv"><span>Context nets</span><strong>{highlight.netIds.length}</strong></div>
              <div className="inspector-kv"><span>Layer visibility</span><strong>{visibleLayers.join(", ")}</strong></div>
            </div>
            {hoveredOverlay && (
              <div className="focus-card" data-testid="overlay-inspect-card" aria-label="Overlay inspect details" style={{ marginTop: 14 }}>
                <div className="focus-meta">Overlay inspect</div>
                <div className="focus-meta">kind: {highlight.targetType}</div>
                <div className="focus-meta">id: {hoveredOverlay.id}</div>
                <div className="focus-meta">layer: {hoveredOverlay.layerId || "—"}</div>
                <div className="focus-meta">net: {hoveredOverlay.netId || "—"}</div>
                <div className="focus-meta">width: {hoveredOverlay.width}</div>
                <div className="focus-meta">points: {hoveredOverlay.path.length}</div>
              </div>
            )}
            <div className="focus-card" data-testid="overlay-inspect-targets" aria-label="Overlay inspect targets" style={{ marginTop: 14 }}>
              <div className="focus-meta">Overlay test targets</div>
              <div className="overlay-target-grid">
                {overlayInspectTargets.map((target) => (
                  <button
                    key={`${target.kind}-${target.sample.id}`}
                    data-testid={`overlay-target-${target.kind}`}
                    aria-label={`Inspect overlay ${target.kind} ${target.sample.id}`}
                    className="overlay-target-pill"
                    onClick={() => {
                      applyOverlayFamily(OVERLAY_FAMILY_PRESETS[target.family as keyof typeof OVERLAY_FAMILY_PRESETS]);
                      setViewMode("three");
                      setHoveredFeature(target.kind, target.sample.id);
                    }}
                  >
                    <span>{target.kind}</span>
                    <strong>{target.sample.id}</strong>
                  </button>
                ))}
                <button
                  data-testid="overlay-target-clear"
                  aria-label="Clear overlay inspect target"
                  className="overlay-target-pill overlay-target-pill-muted"
                  onClick={() => setHoveredFeature(undefined, undefined)}
                >
                  <span>clear</span>
                  <strong>—</strong>
                </button>
              </div>
            </div>
          </div>

          <div className="inspector-card inspector-card-dense">
            <div className="inspector-title">Import telemetry</div>
            <div className="inspector-grid">
              <div className="inspector-kv"><span>Warnings</span><strong>{importWarnings.length}</strong></div>
              <div className="inspector-kv"><span>Imported geometry</span><strong>{totalImportedGeometry}</strong></div>
              <div className="inspector-kv"><span>Enabled overlays</span><strong>{requestedEnabledOverlays.join(", ") || "—"}</strong></div>
              <div className="inspector-kv"><span>Overlay families</span><strong>Copper {overlayFamilyCounts.copper} · Fab {overlayFamilyCounts.fabrication} · Docs {overlayFamilyCounts.documentation}</strong></div>
              <div className="inspector-kv"><span>Active family preset</span><strong>{activeOverlayFamily || "custom"}</strong></div>
              <div className="inspector-kv"><span>Source format</span><strong>{importMetadata?.sourceFormat || "native"}</strong></div>
            </div>
            {importGeometryBuckets.length > 0 && (
              <div className="inspector-grid" style={{ marginTop: 14 }}>
                {importGeometryBuckets.map(([name, count]) => (
                  <div key={name} className="inspector-kv"><span>{name}</span><strong>{count}</strong></div>
                ))}
              </div>
            )}
            <div className="focus-card" style={{ marginTop: 14 }}>
              <div className="focus-meta">Family buckets</div>
              <div className="focus-meta">Copper: zones · vias · pads</div>
              <div className="focus-meta">Fab: keepouts · silkscreen · drills</div>
              <div className="focus-meta">Docs: documentation · mechanical · graphics</div>
            </div>
            {importSemantics.length > 0 && (
              <div className="focus-card" style={{ marginTop: 14 }}>
                <div className="focus-meta">Semantic summary</div>
                <div className="focus-meta">{importSemantics.map(([name, count]) => `${name}:${count}`).join(" · ")}</div>
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
        </aside>
      </section>
    </div>
  );
}
