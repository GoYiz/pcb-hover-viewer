import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const layer = searchParams.get("layer") || "TOP";

  const [traces, overlays] = await Promise.all([
    prisma.trace.findMany({
      where: {
        boardId: id,
        layerId: layer,
      },
      select: {
        id: true,
        netId: true,
        layerId: true,
        pathJson: true,
        width: true,
      },
    }),
    prisma.overlayGeometry.findMany({
      where: {
        boardId: id,
        layerId: layer,
      },
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
    id: t.id,
    netId: t.netId,
    layerId: t.layerId,
    width: t.width,
    path: JSON.parse(t.pathJson) as [number, number][],
  }));

  const mappedOverlays = overlays.map((t) => ({
    id: t.id,
    netId: t.netId || "",
    layerId: t.layerId,
    width: t.width,
    path: JSON.parse(t.pathJson) as [number, number][],
    kind: t.kind,
  }));

  return NextResponse.json({
    boardId: id,
    layer,
    traces: mappedTraces,
    zones: mappedOverlays.filter((t) => t.kind === "zone").map(({ kind, ...rest }) => rest),
    vias: mappedOverlays.filter((t) => t.kind === "via").map(({ kind, ...rest }) => rest),
    pads: mappedOverlays.filter((t) => t.kind === "pad").map(({ kind, ...rest }) => rest),
    keepouts: mappedOverlays.filter((t) => t.kind === "keepout").map(({ kind, ...rest }) => rest),
    silkscreen: mappedOverlays.filter((t) => t.kind === "silkscreen").map(({ kind, ...rest }) => rest),
    drills: mappedOverlays.filter((t) => t.kind === "drill").map(({ kind, ...rest }) => rest),
  });
}
