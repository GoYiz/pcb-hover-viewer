import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHostedBoardRelationsById } from "@/lib/hosted-board";

export async function GET(
  _req: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; featureType: string; featureId: string }>;
  },
) {
  const { id, featureType, featureId } = await params;

  const hosted = getHostedBoardRelationsById(id, featureType, featureId);
  if (hosted) return NextResponse.json(hosted);

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

  let uniqueNetIds: string[] = [];

  if (featureType === "component") {
    const nets = await prisma.pin.findMany({
      where: { componentId: featureId },
      select: { netId: true },
    });
    uniqueNetIds = [...new Set(nets.map((n) => n.netId))];
  } else if (featureType === "trace") {
    const trace = await prisma.trace.findFirst({
      where: { boardId: id, id: featureId },
      select: { netId: true },
    });
    if (trace?.netId) uniqueNetIds = [trace.netId];
  }

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

  const relatedComponents = uniqueNetIds.length
    ? await prisma.pin.findMany({
        where: {
          netId: { in: uniqueNetIds },
          component: { boardId: id },
        },
        select: {
          componentId: true,
        },
      })
    : [];

  const uniqueComponentIds = [...new Set(relatedComponents.map((r) => r.componentId))].filter(
    (cid) => !(featureType === "component" && cid === featureId),
  );

  const mergedDirect = [
    ...direct,
    ...uniqueComponentIds.map((cid) => ({
      targetType: "component",
      targetId: cid,
      relationType: "electrical",
      weight: 1,
    })),
  ];

  return NextResponse.json({
    target: {
      type: featureType,
      id: featureId,
    },
    direct: mergedDirect,
    nets: uniqueNetIds,
    traces,
  });
}
