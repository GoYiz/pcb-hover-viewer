import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const layer = searchParams.get("layer") || "TOP";

  const traces = await prisma.trace.findMany({
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
  });

  return NextResponse.json({
    boardId: id,
    layer,
    traces: traces.map((t) => ({
      id: t.id,
      netId: t.netId,
      layerId: t.layerId,
      width: t.width,
      path: JSON.parse(t.pathJson) as [number, number][],
    })),
    zones: [],
    vias: [],
    pads: [],
    keepouts: [],
    silkscreen: [],
    drills: [],
  });
}
