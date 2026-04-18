import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHostedBoardGeometryById } from "@/lib/hosted-board";
import { unscopeId } from "@/lib/db-scope";

function normalizeLayerId(layer: string) {
  return String(layer || "").trim().toUpperCase();
}

function isTopLikeLayer(layer: string) {
  const value = normalizeLayerId(layer);
  return value === "TOP" || value === "TOP_LAYER" || value === "F.CU" || value === "F_CU" || value.includes("TOP") || value.includes("FRONT");
}

function isBottomLikeLayer(layer: string) {
  const value = normalizeLayerId(layer);
  return value === "BOTTOM" || value === "BOTTOM_LAYER" || value === "B.CU" || value === "B_CU" || value.includes("BOTTOM") || value.includes("BACK") || value.includes("BOT");
}

function matchesRequestedLayer(layerId: string, layer = "TOP", includeNeutral = false) {
  const request = normalizeLayerId(layer);
  const value = normalizeLayerId(layerId);
  if (!request || request === "ALL" || request === "*") return true;
  if (isTopLikeLayer(request)) return isTopLikeLayer(value) || (includeNeutral && !isBottomLikeLayer(value));
  if (isBottomLikeLayer(request)) return isBottomLikeLayer(value) || (includeNeutral && !isTopLikeLayer(value));
  return value === request;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const layer = searchParams.get("layer") || "TOP";

  const hosted = getHostedBoardGeometryById(id, layer);
  if (hosted) return NextResponse.json(hosted);

  const [traces, overlays] = await Promise.all([
    prisma.trace.findMany({
      where: { boardId: id },
      select: {
        id: true,
        netId: true,
        layerId: true,
        pathJson: true,
        width: true,
      },
    }),
    prisma.overlayGeometry.findMany({
      where: { boardId: id },
      select: {
        id: true,
        netId: true,
        layerId: true,
        kind: true,
        pathJson: true,
        width: true,
      },
    }),
  ]);

  const mappedTraces = traces.map((t) => ({
    id: unscopeId(id, t.id),
    netId: unscopeId(id, t.netId),
    layerId: unscopeId(id, t.layerId),
    width: t.width,
    path: JSON.parse(t.pathJson) as [number, number][],
  }));

  const mappedOverlays = overlays.map((t) => ({
    id: unscopeId(id, t.id),
    netId: t.netId ? unscopeId(id, t.netId) : "",
    layerId: unscopeId(id, t.layerId),
    width: t.width,
    path: JSON.parse(t.pathJson) as [number, number][],
    kind: t.kind,
  }));

  const filteredTraces = mappedTraces.filter((t) => matchesRequestedLayer(t.layerId, layer, false));
  const filteredOverlays = mappedOverlays.filter((t) => matchesRequestedLayer(t.layerId, layer, true));

  return NextResponse.json({
    boardId: id,
    layer,
    traces: filteredTraces,
    zones: filteredOverlays.filter((t) => t.kind === "zone").map(({ kind, ...rest }) => rest),
    vias: filteredOverlays.filter((t) => t.kind === "via").map(({ kind, ...rest }) => rest),
    pads: filteredOverlays.filter((t) => t.kind === "pad").map(({ kind, ...rest }) => rest),
    keepouts: filteredOverlays.filter((t) => t.kind === "keepout").map(({ kind, ...rest }) => rest),
    silkscreen: filteredOverlays.filter((t) => t.kind === "silkscreen").map(({ kind, ...rest }) => rest),
    boardOutlines: filteredOverlays.filter((t) => t.kind === "board_outline").map(({ kind, ...rest }) => rest),
    documentation: filteredOverlays.filter((t) => t.kind === "documentation").map(({ kind, ...rest }) => rest),
    mechanical: filteredOverlays.filter((t) => t.kind === "mechanical").map(({ kind, ...rest }) => rest),
    graphics: filteredOverlays.filter((t) => t.kind === "graphics").map(({ kind, ...rest }) => rest),
    drills: filteredOverlays.filter((t) => t.kind === "drill").map(({ kind, ...rest }) => rest),
  });
}
