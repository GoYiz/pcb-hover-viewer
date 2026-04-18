import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHostedBoardComponentsById } from "@/lib/hosted-board";
import { unscopeId } from "@/lib/db-scope";

function parseBBox(input: string): [number, number, number, number] {
  try {
    const value = JSON.parse(input);
    if (Array.isArray(value) && value.length === 4) {
      return [Number(value[0]), Number(value[1]), Number(value[2]), Number(value[3])];
    }
  } catch {}
  return [0, 0, 1, 1];
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim() || "";

  const hosted = getHostedBoardComponentsById(id, search);
  if (hosted) return NextResponse.json(hosted);

  const components = await prisma.component.findMany({
    where: {
      boardId: id,
      ...(search
        ? {
            refdes: {
              contains: search,
            },
          }
        : {}),
    },
    select: {
      id: true,
      refdes: true,
      footprint: true,
      x: true,
      y: true,
      rotation: true,
      bboxJson: true,
      pins: {
        select: {
          netId: true,
        },
      },
    },
    orderBy: { refdes: "asc" },
    take: search ? 50 : 1000,
  });

  return NextResponse.json({
    boardId: id,
    components: components.map((c) => ({
      id: unscopeId(id, c.id),
      refdes: c.refdes,
      footprint: c.footprint,
      x: c.x,
      y: c.y,
      rotation: c.rotation,
      bbox: parseBBox(c.bboxJson),
      netIds: [...new Set(c.pins.map((p) => unscopeId(id, p.netId)))],
    })),
  });
}
