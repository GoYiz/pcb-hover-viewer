import Link from "next/link";

export default function HomePage() {
  return (
    <main className="console-shell">
      <section className="console-hero">
        <div className="hero-copy">
          <div className="eyebrow">PCB INTELLIGENCE WORKBENCH</div>
          <h1 className="hero-title">Readable boards. Dense relations. Precise review.</h1>
          <p className="hero-subtitle">
            A production-oriented PCB inspection environment built around layer isolation, relation tracing, precision measurement, and workbench-grade session export.
          </p>
          <div className="hero-chip-row">
            <span className="console-chip console-chip-cyan">Leafer 2D workbench</span>
            <span className="console-chip console-chip-amber">Three.js spatial view</span>
            <span className="console-chip">Session-first exports</span>
          </div>
        </div>

        <div className="hero-metrics">
          <div className="metric-card metric-card-accent">
            <span className="metric-label">Mode</span>
            <strong className="metric-value metric-value-sm">Interactive inspection</strong>
            <span className="metric-meta">Selection, measurement, relation analysis, and URL state persistence.</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Scale</span>
            <strong className="metric-value">832 / 5376</strong>
            <span className="metric-meta">validated on stress board components / traces.</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Exports</span>
            <strong className="metric-value metric-value-sm">PNG · TXT · CSV · JSON</strong>
            <span className="metric-meta">From snapshots to full workbench session bundles.</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">State</span>
            <strong className="metric-value metric-value-sm">URL-aware bench</strong>
            <span className="metric-meta">Camera, selection, tool, filter, and detail visibility restoration.</span>
          </div>
        </div>
      </section>

      <section className="console-commandbar" style={{ marginTop: 18 }}>
        <div className="tool-rack">
          <div className="tool-cluster tool-cluster-wide">
            <div className="tool-cluster-label">Launch surfaces</div>
            <div className="tool-chip-row">
              <Link className="search-pill" href="/board/iphone-mainboard-demo">Open demo board</Link>
              <Link className="search-pill" href="/examples">Open example library</Link>
            </div>
          </div>
          <div className="tool-cluster tool-cluster-wide">
            <div className="tool-cluster-label">Why this interface</div>
            <div className="tool-chip-row">
              <span className="tool-chip tool-chip-active">Industrial information hierarchy</span>
              <span className="tool-chip">Benchmark-ready boards</span>
              <span className="tool-chip">Exportable workbench sessions</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
