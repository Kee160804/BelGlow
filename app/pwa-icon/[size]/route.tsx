import { ImageResponse } from "next/og";

const allowedSizes = new Set([180, 192, 512]);

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const requestedSize = Number((await params).size);
  const size = allowedSizes.has(requestedSize) ? requestedSize : 512;
  const markSize = Math.round(size * 0.48);

  return new ImageResponse(
    <div style={{ alignItems: "center", background: "linear-gradient(145deg, #fff8fa 0%, #f8cbd7 100%)", display: "flex", height: "100%", justifyContent: "center", width: "100%" }}>
      <div style={{ alignItems: "center", background: "#ffffff", border: `${Math.max(4, Math.round(size * 0.018))}px solid rgba(239,75,116,.16)`, borderRadius: "28%", boxShadow: "0 12px 34px rgba(122, 37, 64, .16)", display: "flex", flexDirection: "column", height: "72%", justifyContent: "center", width: "72%" }}>
        <div style={{ color: "#2b2226", display: "flex", fontSize: markSize, fontWeight: 800, letterSpacing: "-0.08em", lineHeight: 1 }}>
          B<span style={{ color: "#ef4b74" }}>G</span>
        </div>
        <div style={{ color: "#a52f53", display: "flex", fontSize: Math.max(12, Math.round(size * 0.052)), fontWeight: 700, letterSpacing: "0.12em", marginTop: Math.round(size * 0.035) }}>
          BELGLOW
        </div>
      </div>
    </div>,
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=31536000, immutable" } },
  );
}
