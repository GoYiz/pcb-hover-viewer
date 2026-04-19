import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHostedBoardRelationsById } from "@/lib/hosted-board";
import { scopeId, unscopeId } from "@/lib/db-scope";

function isStructureRelationNet(netId: unknown) {
  const value = String(netId || '').trim();
  return value === '$BOARD$' || value === '$CUTOUT$';
}


function weakDocumentRelationRadius(featureType: string) {
  if (featureType === 'graphics') return 1.0;
  if (featureType === 'mechanical') return 1.25;
  if (featureType === 'documentation') return 2.0;
  if (featureType === 'silkscreen') return 1.6;
  if (featureType === 'keepouts') return 1.25;
  return 0;
}

function isRelationExpandableNet(netId: unknown) {
  const value = String(netId || '').trim();
  return !!value && value !== '$NONE$';
}


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

  const scopedFeatureId = (featureType === "component" || featureType === "trace")
    ? scopeId(id, featureId)
    : featureId;

  const direct = await prisma.relationEdge.findMany({
    where: {
      boardId: id,
      sourceType: featureType,
      sourceId: scopedFeatureId,
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
      where: { componentId: scopedFeatureId },
      select: { netId: true },
    });
    uniqueNetIds = [...new Set(nets.map((n) => n.netId))];
  } else if (featureType === "trace") {
    const trace = await prisma.trace.findFirst({
      where: { boardId: id, id: scopedFeatureId },
      select: { netId: true },
    });
    if (trace?.netId) uniqueNetIds = [trace.netId];
  } else if (featureType === 'boardOutlines') {
    const overlay = await prisma.overlayGeometry.findFirst({
      where: { boardId: id, id: scopeId(id, featureId), kind: 'board_outline' },
      select: { netId: true },
    });
    if (overlay?.netId && isStructureRelationNet(overlay.netId)) uniqueNetIds = ['$BOARD$', '$CUTOUT$'];
  } else {
    const overlay = await prisma.overlayGeometry.findFirst({
      where: { boardId: id, id: scopeId(id, featureId), kind: featureType === 'boardOutlines' ? 'board_outline' : featureType.slice(0, -1) === 'zone' ? 'zone' : undefined },
      select: { netId: true, kind: true },
    }).catch(() => null);
    if (overlay?.netId && isRelationExpandableNet(overlay.netId)) uniqueNetIds = [overlay.netId];
    if (!uniqueNetIds.length) {
      const fallbackOverlay = await prisma.overlayGeometry.findFirst({
        where: { boardId: id, id: scopeId(id, featureId) },
        select: { netId: true },
      });
      if (fallbackOverlay?.netId && isRelationExpandableNet(fallbackOverlay.netId)) uniqueNetIds = [fallbackOverlay.netId];
    }
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
    (cid) => !(featureType === "component" && cid === scopedFeatureId),
  );

  const mergedDirect = [
    ...direct.map((item) => ({
      ...item,
      targetId: item.targetType === "component" || item.targetType === "trace"
        ? unscopeId(id, item.targetId)
        : item.targetId,
    })),
    ...uniqueComponentIds.map((cid) => ({
      targetType: "component",
      targetId: unscopeId(id, cid),
      relationType: "electrical",
      weight: 1,
    })),
  ];

  let overlays = uniqueNetIds.length
    ? await prisma.overlayGeometry.findMany({
        where: {
          boardId: id,
          netId: { in: uniqueNetIds },
        },
        select: {
          id: true,
          netId: true,
          layerId: true,
          kind: true,
          pathJson: true,
        },
      })
    : [];

  if (!overlays.length && (featureType === 'documentation' || featureType === 'mechanical' || featureType === 'graphics' || featureType === 'silkscreen' || featureType === 'keepouts')) {
    const target = await prisma.overlayGeometry.findFirst({
      where: { boardId: id, id: scopeId(id, featureId) },
      select: { id: true, layerId: true, pathJson: true },
    });
    const radius = weakDocumentRelationRadius(featureType);
    if (target?.pathJson && radius > 0) {
      const targetPath = JSON.parse(target.pathJson || '[]');
      const xs = targetPath.map((pt: number[]) => Number(pt[0] || 0));
      const ys = targetPath.map((pt: number[]) => Number(pt[1] || 0));
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const kindValue = featureType === 'graphics' ? 'graphics' : featureType === 'mechanical' ? 'mechanical' : featureType === 'silkscreen' ? 'silkscreen' : featureType === 'keepouts' ? 'keepout' : 'documentation';
      const candidates = await prisma.overlayGeometry.findMany({
        where: { boardId: id, kind: kindValue, layerId: target.layerId, NOT: { id: target.id } },
        select: { id: true, netId: true, layerId: true, kind: true, pathJson: true },
      });
      overlays = candidates
        .map((item) => {
          const path = JSON.parse(item.pathJson || '[]');
          const ox = path.map((pt: number[]) => Number(pt[0] || 0));
          const oy = path.map((pt: number[]) => Number(pt[1] || 0));
          const ocx = (Math.min(...ox) + Math.max(...ox)) / 2;
          const ocy = (Math.min(...oy) + Math.max(...oy)) / 2;
          return { ...item, dist: Math.hypot(ocx - cx, ocy - cy) };
        })
        .filter((item) => Number.isFinite(item.dist) && item.dist <= radius)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, featureType === 'keepouts' ? 4 : 8);
    }
  }

  return NextResponse.json({
    target: {
      type: featureType,
      id: featureId,
    },
    direct: mergedDirect,
    nets: uniqueNetIds.map((netId) => unscopeId(id, netId)),
    traces: traces.map((trace) => ({
      id: unscopeId(id, trace.id),
      netId: unscopeId(id, trace.netId),
    })),
    overlays: overlays
      .filter((item) => !(featureType !== 'component' && featureType !== 'trace' && unscopeId(id, item.id) === featureId))
      .map((item) => ({
        id: unscopeId(id, item.id),
        kind: item.kind === 'board_outline' ? 'boardOutlines' : `${item.kind}s`,
        netId: item.netId ? unscopeId(id, item.netId) : '',
        layerId: unscopeId(id, item.layerId),
      })),
  });
}
