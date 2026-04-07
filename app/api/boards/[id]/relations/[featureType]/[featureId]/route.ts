import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; featureType: string; featureId: string }>;
  },
) {
  const { id, featureType, featureId } = await params;

  const direct = await prisma.relationEdge.findMany({
    where: {
      boardId: id,
      sourceType: featureType,
      sourceId: featureId,
    },
    select: {
      targetType: true,
      targetId: true,
      relationType: true,
      weight: true,
    },
  });

  const nets =
    featureType === "component"
      ? await prisma.pin.findMany({
          where: {
            componentId: featureId,
          },
          select: {
            netId: true,
          },
        })
      : [];

  const uniqueNetIds = [...new Set(nets.map((n) => n.netId))];

  const traces = uniqueNetIds.length
    ? await prisma.trace.findMany({
        where: {
          boardId: id,
          netId: { in: uniqueNetIds },
        },
        select: {
          id: true,
          netId: true,
        },
      })
    : [];

  return NextResponse.json({
    target: {
      type: featureType,
      id: featureId,
    },
    direct,
    nets: uniqueNetIds,
    traces,
  });
}
