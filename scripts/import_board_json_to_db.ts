import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { scopeId, scopeMaybeId } from "../lib/db-scope";

const prisma = new PrismaClient();

type BoardJson = any;

const OVERLAY_BUCKETS: Array<[string, string]> = [
  ["zones", "zone"],
  ["vias", "via"],
  ["pads", "pad"],
  ["keepouts", "keepout"],
  ["silkscreen", "silkscreen"],
  ["boardOutlines", "board_outline"],
  ["documentation", "documentation"],
  ["mechanical", "mechanical"],
  ["graphics", "graphics"],
  ["drills", "drill"],
];

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function str(value: unknown, fallback = "") {
  const s = String(value ?? fallback).trim();
  return s || fallback;
}

function collectComponentNetIds(component: any): string[] {
  const fromObjects = asArray(component?.nets).map((net) => str(net?.id)).filter(Boolean);
  const fromStrings = asArray(component?.netIds).map((net) => str(net)).filter(Boolean);
  return [...new Set([...fromObjects, ...fromStrings])];
}

function geometryBuckets(data: BoardJson) {
  return [data.traces || [], ...OVERLAY_BUCKETS.map(([key]) => data[key] || [])];
}

function collectLayerRows(data: BoardJson) {
  const rows = new Map<string, { id: string; name: string; zIndex: number }>();
  for (const layer of asArray(data.layers)) {
    const id = str(layer?.id || layer?.name);
    if (!id) continue;
    rows.set(id, { id, name: str(layer?.name || id), zIndex: num(layer?.zIndex, rows.size + 1) });
  }
  for (const bucket of geometryBuckets(data)) {
    for (const item of asArray(bucket)) {
      const id = str(item?.layerId);
      if (!id || rows.has(id)) continue;
      rows.set(id, { id, name: id, zIndex: rows.size + 1 });
    }
  }
  if (!rows.size) rows.set("TOP", { id: "TOP", name: "TOP", zIndex: 1 });
  return [...rows.values()];
}

function collectNetRows(data: BoardJson) {
  const rows = new Map<string, { id: string; name: string }>();
  for (const net of asArray(data.nets)) {
    const id = str(net?.id);
    if (!id) continue;
    rows.set(id, { id, name: str(net?.name || id) });
  }
  for (const component of asArray(data.components)) {
    for (const netId of collectComponentNetIds(component)) {
      if (!rows.has(netId)) rows.set(netId, { id: netId, name: netId });
    }
  }
  for (const bucket of geometryBuckets(data)) {
    for (const item of asArray(bucket)) {
      const netId = str(item?.netId);
      if (!netId) continue;
      if (!rows.has(netId)) rows.set(netId, { id: netId, name: netId });
    }
  }
  if (!rows.size) rows.set("$NONE$", { id: "$NONE$", name: "$NONE$" });
  return [...rows.values()];
}

async function main() {
  const [, , inputArg, boardIdArg, boardNameArg] = process.argv;
  if (!inputArg || !boardIdArg) {
    console.error("usage: npx tsx scripts/import_board_json_to_db.ts <input.json> <board_id> [board_name]");
    process.exit(1);
  }

  const inputPath = path.resolve(inputArg);
  const data = JSON.parse(fs.readFileSync(inputPath, "utf-8")) as BoardJson;
  const boardId = str(boardIdArg);
  const boardName = str(boardNameArg || data?.board?.name || boardId);
  const boardVersion = str(data?.board?.version || "imported-json");
  const widthMm = num(data?.board?.widthMm, 100);
  const heightMm = num(data?.board?.heightMm, 60);

  const layers = collectLayerRows(data);
  const defaultLayerOriginal = layers.find((layer) => /top|front|f\.cu/i.test(layer.id))?.id || layers[0].id;
  const nets = collectNetRows(data);

  await prisma.board.delete({ where: { id: boardId } }).catch(() => null);

  await prisma.board.create({
    data: {
      id: boardId,
      name: boardName,
      version: boardVersion,
      widthMm,
      heightMm,
    },
  });

  await prisma.layer.createMany({
    data: layers.map((layer) => ({
      id: scopeId(boardId, layer.id),
      boardId,
      name: layer.name,
      zIndex: layer.zIndex,
    })),
  });

  await prisma.net.createMany({
    data: nets.map((net) => ({
      id: scopeId(boardId, net.id),
      boardId,
      netName: net.name,
    })),
  });

  const components = asArray(data.components);
  await prisma.component.createMany({
    data: components.map((component) => {
      const originalId = str(component?.id || component?.refdes);
      const bbox = Array.isArray(component?.bbox) && component.bbox.length === 4
        ? component.bbox
        : [num(component?.x, 0) - 0.7, num(component?.y, 0) - 0.5, 1.4, 1.0];
      return {
        id: scopeId(boardId, originalId),
        boardId,
        refdes: str(component?.refdes || originalId),
        footprint: component?.footprint ? String(component.footprint) : null,
        x: num(component?.x),
        y: num(component?.y),
        rotation: num(component?.rotation),
        bboxJson: JSON.stringify(bbox),
      };
    }),
  });

  const pinRows: Array<{ id: string; componentId: string; netId: string; x: number; y: number; layerId: string }> = [];
  for (const component of components) {
    const originalId = str(component?.id || component?.refdes);
    const componentId = scopeId(boardId, originalId);
    const x = num(component?.x);
    const y = num(component?.y);
    for (const netOriginal of collectComponentNetIds(component)) {
      pinRows.push({
        id: scopeId(boardId, `pin:${originalId}:${netOriginal}`),
        componentId,
        netId: scopeId(boardId, netOriginal),
        x,
        y,
        layerId: scopeId(boardId, defaultLayerOriginal),
      });
    }
  }
  if (pinRows.length) {
    await prisma.pin.createMany({ data: pinRows });
  }

  const traces = asArray(data.traces);
  if (traces.length) {
    await prisma.trace.createMany({
      data: traces.map((trace, index) => ({
        id: scopeId(boardId, str(trace?.id || `trace-${index + 1}`)),
        boardId,
        netId: scopeId(boardId, str(trace?.netId || "$NONE$")),
        layerId: scopeId(boardId, str(trace?.layerId || defaultLayerOriginal)),
        pathJson: JSON.stringify(asArray(trace?.path)),
        width: num(trace?.width, 0.15),
      })),
    });
  }

  const overlays: Array<{ id: string; boardId: string; netId: string | null; layerId: string; kind: string; pathJson: string; width: number }> = [];
  for (const [key, kind] of OVERLAY_BUCKETS) {
    const items = asArray(data[key]);
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      overlays.push({
        id: scopeId(boardId, str(item?.id || `${key}-${index + 1}`)),
        boardId,
        netId: scopeMaybeId(boardId, str(item?.netId || "")),
        layerId: scopeId(boardId, str(item?.layerId || defaultLayerOriginal)),
        kind,
        pathJson: JSON.stringify(asArray(item?.path)),
        width: num(item?.width, 0.1),
      });
    }
  }
  if (overlays.length) {
    await prisma.overlayGeometry.createMany({ data: overlays });
  }

  console.log(JSON.stringify({
    boardId,
    boardName,
    input: inputPath,
    layers: layers.length,
    nets: nets.length,
    components: components.length,
    pins: pinRows.length,
    traces: traces.length,
    overlays: overlays.length,
  }));
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
