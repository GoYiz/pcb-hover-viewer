"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { ExampleBoardData, ExampleIndexItem } from "@/lib/examples";

const PcbCanvas = dynamic(() => import("@/components/PcbCanvas"), { ssr: false });

const CANVAS_W = 980;
const CANVAS_H = 620;
const OVERLAY_DETAIL_NAMES = ["zones", "vias", "pads", "keepouts", "silkscreen", "documentation", "mechanical", "graphics", "drills"];

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
  const [liveVisibleDetail, setLiveVisibleDetail] = useState<string[]>([]);

  const active = examples[activeId];
  const activeIndexItem = index.find((i) => i.id === activeId);
  const metadata = active?.importMetadata;
  const warningCount = metadata?.warnings?.length || 0;
  const layerCategoryEntries = Object.entries(metadata?.layerCategories || {});
  const topLayerStats = Object.entries(metadata?.stats?.traceCountByLayer || {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const semanticStats = Object.entries(metadata?.stats?.traceCountBySemantic || {}).sort((a, b) => b[1] - a[1]);
  const geometryBuckets = useMemo(() => {
    const metaCounts = metadata?.stats?.geometryArrayCounts || {};
    if (Object.keys(metaCounts).length > 0) return Object.entries(metaCounts).sort((a, b) => Number(b[1]) - Number(a[1]));
    if (!active) return [] as Array<[string, number]>;
    const fallbackCounts: Record<string, number> = {
      traces: active.traces.length,
      zones: active.zones?.length || 0,
      vias: active.vias?.length || 0,
      pads: active.pads?.length || 0,
      keepouts: active.keepouts?.length || 0,
      silkscreen: active.silkscreen?.length || 0,
      documentation: active.documentation?.length || 0,
      mechanical: active.mechanical?.length || 0,
      graphics: active.graphics?.length || 0,
      drills: active.drills?.length || 0,
    };
    return Object.entries(fallbackCounts).filter(([, count]) => Number(count) > 0).sort((a, b) => Number(b[1]) - Number(a[1]));
  }, [metadata, active]);

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

  const sourceHref = activeIndexItem?.source;
  const catalogComponents = index.reduce((acc, item) => acc + item.components, 0);
  const totalGeometry = geometryBuckets.reduce((acc, [, count]) => acc + Number(count), 0);
  const importedOverlayNames = geometryBuckets.map(([name]) => name).filter((name) => OVERLAY_DETAIL_NAMES.includes(name));
  const enabledOverlayNames = (liveVisibleDetail.length ? liveVisibleDetail : importedOverlayNames).filter((name) => OVERLAY_DETAIL_NAMES.includes(name));
  const overlayFamilyCounts = useMemo(() => ({
    copper: geometryBuckets.filter(([name]) => ['zones', 'vias', 'pads'].includes(name)).reduce((acc, [, count]) => acc + Number(count), 0),
    fabrication: geometryBuckets.filter(([name]) => ['keepouts', 'silkscreen', 'drills'].includes(name)).reduce((acc, [, count]) => acc + Number(count), 0),
    documentation: geometryBuckets.filter(([name]) => ['documentation', 'mechanical', 'graphics'].includes(name)).reduce((acc, [, count]) => acc + Number(count), 0),
  }), [geometryBuckets]);
  const activeDensity = active ? (active.components.length + totalGeometry) / Math.max(active.board.widthMm * active.board.heightMm, 1) : 0;

  useEffect(() => {
    const readBridge = () => {
      const el = document.querySelector('[data-testid="canvas-state-bridge"]');
      const text = el?.textContent || '';
      const m = text.match(/visible_detail=([^\n]+)/);
      if (!m) return;
      const items = m[1].split(',').map((s) => s.trim()).filter(Boolean);
      setLiveVisibleDetail(items);
    };
    readBridge();
    const id = window.setInterval(readBridge, 400);
    return () => window.clearInterval(id);
  }, [activeId]);

  return (
    <div className="console-shell examples-shell">
      <section className="console-hero examples-hero">
        <div className="hero-copy">
          <div className="eyebrow">REFERENCE EXAMPLE LIBRARY</div>
          <h1 className="hero-title">Default board collection</h1>
          <p className="hero-subtitle">
            Public hardware examples, normalized into a single visual inspection surface for benchmarking performance, graph relations, and workbench ergonomics.
          </p>
          <div className="hero-chip-row">
            <span className="console-chip console-chip-cyan">Benchmark fixtures</span>
            <span className="console-chip console-chip-amber">Catalog specimen browser</span>
            <span className="console-chip">Normalized public geometry</span>
          </div>
        </div>
        <div className="hero-metrics">
          <div className="metric-card metric-card-accent">
            <span className="metric-label">Example boards</span>
            <strong className="metric-value">{index.length}</strong>
            <span className="metric-meta">curated fixtures</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Catalog components</span>
            <strong className="metric-value">{catalogComponents}</strong>
            <span className="metric-meta">across all imported examples</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Current target</span>
            <strong className="metric-value metric-value-sm">{active?.board.name || "—"}</strong>
            <span className="metric-meta">{activeIndexItem?.format ? `${activeIndexItem.format} import` : "active bench specimen"}</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Import warnings</span>
            <strong className="metric-value">{warningCount}</strong>
            <span className="metric-meta">{activeIndexItem?.imported ? "import pipeline quality flags" : "objects per mm² benchmark ratio"}</span>
          </div>
        </div>
      </section>

      <section className="summary-rail examples-summary-rail">
        <div className="summary-cell">
          <span className="summary-label">Specimen</span>
          <strong className="summary-value">{active?.board.name || "—"}</strong>
          <span className="summary-meta">active benchmark board</span>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Envelope</span>
          <strong className="summary-value">{active ? `${active.board.widthMm} × ${active.board.heightMm}` : "—"}</strong>
          <span className="summary-meta">millimetres</span>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Population</span>
          <strong className="summary-value">{active?.components.length || 0}</strong>
          <span className="summary-meta">components in specimen</span>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Routing</span>
          <strong className="summary-value">{totalGeometry || 0}</strong>
          <span className="summary-meta">total imported geometry</span>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Import status</span>
          <strong className="summary-value">{activeIndexItem?.format?.toUpperCase() || "NATIVE"}</strong>
          <span className="summary-meta">{warningCount ? `${warningCount} warnings` : (activeIndexItem?.imported ? "validated import" : "native example")}</span>
        </div>
      </section>

      <section className="console-commandbar examples-picker-bar examples-picker-polished">
        <div className="tool-cluster tool-cluster-wide">
          <div className="tool-cluster-label">Board selection</div>
          <div className="example-pill-grid example-pill-grid-polished">
            {index.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveId(item.id);
                  setHoveredType(undefined);
                  setHoveredId(undefined);
                }}
                className={`example-pill ${item.id === activeId ? "example-pill-active" : ""}`}
              >
                <span>{item.name}</span>
                <strong>{item.components}</strong>
              </button>
            ))}
          </div>
        </div>
      </section>

      {active && (
        <section className="console-main-grid console-main-grid-refined examples-main-grid-refined">
          <div className="canvas-stage">
            <div className="canvas-stage-header">
              <div>
                <div className="canvas-stage-title">Example live stage</div>
                <div className="canvas-stage-meta">Benchmark board for interaction density, relation tracing, and workbench polish</div>
              </div>
              <div className="canvas-stage-badges">
                <span className="stage-badge">{active.components.length} comps</span>
                <span className="stage-badge">{active.traces.length} copper traces</span>
                <span className="stage-badge">{totalGeometry} total geom</span>
                <span className="stage-badge">{relation.netIds.length} active nets</span>
              </div>
            </div>
            <div className="canvas-stage-frame">
              <PcbCanvas
                width={CANVAS_W}
                height={CANVAS_H}
                boardWidthMm={active.board.widthMm}
                boardHeightMm={active.board.heightMm}
                components={active.components}
                traces={active.traces}
                pads={active.pads || []}
                keepouts={active.keepouts || []}
                silkscreen={active.silkscreen || []}
                documentation={active.documentation || []}
                mechanical={active.mechanical || []}
                graphics={active.graphics || []}
                drills={active.drills || []}
                zones={active.zones || []}
                vias={active.vias || []}
                hoveredId={hoveredId}
                hoveredType={hoveredType}
                directIds={relation.directIds}
                traceHighlightIds={relation.traceIds}
                onHoverFeature={(type, id) => {
                  setHoveredType(type);
                  setHoveredId(id);
                }}
              />
            </div>
          </div>

          <aside className="inspector-stack inspector-stack-refined">
            <div className="inspector-card inspector-card-glow">
              <div className="inspector-title-row">
                <div>
                  <div className="inspector-title">Example dossier</div>
                  <div className="inspector-meta">Normalized data imported from open hardware repositories</div>
                </div>
                <span className="signal-pill">{activeIndexItem?.imported ? `Imported · ${activeIndexItem.format || "unknown"}` : "Bench"}</span>
              </div>
              <div className="inspector-grid">
                <div className="inspector-kv"><span>Name</span><strong>{active.board.name}</strong></div>
                <div className="inspector-kv"><span>Board size</span><strong>{active.board.widthMm} × {active.board.heightMm}</strong></div>
                <div className="inspector-kv"><span>Components</span><strong>{active.components.length}</strong></div>
                <div className="inspector-kv"><span>Copper traces</span><strong>{active.traces.length}</strong></div>
                <div className="inspector-kv"><span>Total geometry</span><strong>{totalGeometry}</strong></div>
                <div className="inspector-kv"><span>Warnings</span><strong>{warningCount}</strong></div>
                <div className="inspector-kv"><span>Layer classes</span><strong>{new Set(layerCategoryEntries.map(([, v]) => v)).size}</strong></div>
                <div className="inspector-kv"><span>Enabled overlays</span><strong>{enabledOverlayNames.join(', ') || '—'}</strong></div>
                <div className="inspector-kv"><span>Overlay families</span><strong>{overlayFamilyCounts.copper} / {overlayFamilyCounts.fabrication} / {overlayFamilyCounts.documentation}</strong></div>
              </div>
              {sourceHref && (
                <a className="source-link" href={sourceHref} target="_blank">
                  Open GitHub source ↗
                </a>
              )}
            </div>

            <div className="inspector-card inspector-card-dense">
              <div className="inspector-title">Live relation summary</div>
              {!hoveredId ? (
                <p className="inspector-meta">Hover a component or trace to inspect nets, direct neighbours, and related routed geometry.</p>
              ) : (
                <div className="inspector-grid">
                  <div className="inspector-kv"><span>Target type</span><strong>{hoveredType}</strong></div>
                  <div className="inspector-kv"><span>Target ID</span><strong>{hoveredId}</strong></div>
                  <div className="inspector-kv"><span>Connected nets</span><strong>{relation.netIds.length}</strong></div>
                  <div className="inspector-kv"><span>Related traces</span><strong>{relation.traceIds.length}</strong></div>
                  <div className="inspector-kv"><span>Related components</span><strong>{relation.directIds.length}</strong></div>
                </div>
              )}
            </div>

            <div className="inspector-card inspector-card-dense">
              <div className="inspector-title">Import telemetry</div>
              {!metadata ? (
                <p className="inspector-meta">No import metadata available for this specimen.</p>
              ) : (
                <>
                  <div className="inspector-grid">
                    <div className="inspector-kv"><span>Source format</span><strong>{metadata.sourceFormat}</strong></div>
                    <div className="inspector-kv"><span>Layer count</span><strong>{metadata.stats?.layerCount || active.layers.length}</strong></div>
                    <div className="inspector-kv"><span>Trace count</span><strong>{metadata.stats?.traceCount || active.traces.length}</strong></div>
                    <div className="inspector-kv"><span>Net count</span><strong>{metadata.stats?.netCount || active.nets.length}</strong></div>
                  </div>
                  {metadata.warnings && metadata.warnings.length > 0 && (
                    <div className="focus-card focus-card-trace" style={{ marginTop: 14 }}>
                      <div className="focus-meta">Warnings</div>
                      {metadata.warnings.map((w) => (
                        <div key={w} className="focus-meta">• {w}</div>
                      ))}
                    </div>
                  )}
                  {geometryBuckets.length > 0 && (
                    <div className="inspector-grid" style={{ marginTop: 14 }}>
                      {geometryBuckets.map(([name, count]) => (
                        <div key={name} className="inspector-kv"><span>{name}</span><strong>{count}</strong></div>
                      ))}
                    </div>
                  )}
                  {semanticStats.length > 0 && (
                    <div className="focus-card" style={{ marginTop: 14 }}>
                      <div className="focus-meta">Semantic summary</div>
                      <div className="focus-meta">{semanticStats.map(([name, count]) => `${name}:${count}`).join(' · ')}</div>
                    </div>
                  )}
                  {topLayerStats.length > 0 && (
                    <div className="inspector-grid" style={{ marginTop: 14 }}>
                      {topLayerStats.map(([layer, count]) => (
                        <div key={layer} className="inspector-kv"><span>{layer}</span><strong>{count}</strong></div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="inspector-card inspector-card-dense">
              <div className="inspector-title">Catalog notes</div>
              <p className="inspector-meta">
                Use this library as a benchmark catalog for performance, interaction density, and information architecture regression checks.
              </p>
            </div>
          </aside>
        </section>
      )}
    </div>
  );
}
