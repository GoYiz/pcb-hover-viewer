import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 8 }}>PCB Hover Viewer</h1>
      <p style={{ opacity: 0.85 }}>
        Next.js + SQLite 的在线主板关系高亮演示项目。
      </p>

      <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
        <Link
          href="/board/iphone-mainboard-demo"
          style={{
            background: "#2563eb",
            padding: "10px 14px",
            borderRadius: 8,
            fontWeight: 600,
          }}
        >
          打开 Demo 板卡
        </Link>

        <Link
          href="/examples"
          style={{
            background: "#0f766e",
            padding: "10px 14px",
            borderRadius: 8,
            fontWeight: 600,
          }}
        >
          打开互联网默认示例
        </Link>
      </div>
    </main>
  );
}
