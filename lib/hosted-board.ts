import { DEMO_BOARD, DEMO_BOARD_LAYERS } from "@/lib/demo-board";
import { getExampleById, getExamplesIndex, type ExampleBoardData } from "@/lib/examples";
import type { BoardMeta, ComponentItem, ImportMetadata, RelationsResponse, TraceItem } from "@/types/pcb";

export type HostedBoardData = {
  board: BoardMeta;
  layers: Array<{ id: string; name: string; zIndex: number }>;
  components: ComponentItem[];
  traces: TraceItem[];
  zones?: TraceItem[];
  vias?: TraceItem[];
  pads?: TraceItem[];
  keepouts?: TraceItem[];
  silkscreen?: TraceItem[];
  boardOutlines?: TraceItem[];
  documentation?: TraceItem[];
  mechanical?: TraceItem[];
  graphics?: TraceItem[];
  drills?: TraceItem[];
  nets?: Array<{ id: string; name: string }>;
  importMetadata?: ImportMetadata;
};

type BoardListEntry = BoardMeta & {
  createdAt: string;
  source: "demo" | "example" | "database";
};

function cloneTraceItems(
  items: Array<{ id: string; netId: string; layerId: string; width: number; path: [number, number][] }> = [],
): TraceItem[] {
  return items.map((item) => ({
    id: String(item.id),
    netId: String(item.netId ?? ""),
    layerId: String(item.layerId ?? ""),
    width: Number(item.width ?? 0),
    path: (item.path || []).map((point) => [Number(point[0]), Number(point[1])] as [number, number]),
  }));
}

function demoBoardToHosted(): HostedBoardData {
  return {
    board: { ...DEMO_BOARD.board },
    layers: [...DEMO_BOARD_LAYERS],
    components: DEMO_BOARD.components.map((component) => ({ ...component, netIds: [...(component.netIds || [])] })),
    traces: cloneTraceItems(DEMO_BOARD.traces),
    zones: cloneTraceItems(DEMO_BOARD.zones || []),
    vias: cloneTraceItems(DEMO_BOARD.vias || []),
    pads: cloneTraceItems(DEMO_BOARD.pads || []),
    keepouts: cloneTraceItems(DEMO_BOARD.keepouts || []),
    silkscreen: cloneTraceItems(DEMO_BOARD.silkscreen || []),
    boardOutlines: cloneTraceItems(DEMO_BOARD.boardOutlines || []),
    documentation: cloneTraceItems(DEMO_BOARD.documentation || []),
    mechanical: cloneTraceItems(DEMO_BOARD.mechanical || []),
    graphics: cloneTraceItems(DEMO_BOARD.graphics || []),
    drills: cloneTraceItems(DEMO_BOARD.drills || []),
    importMetadata: (DEMO_BOARD as { importMetadata?: ImportMetadata }).importMetadata,
  };
}

function exampleBoardToHosted(example: ExampleBoardData): HostedBoardData {
  return {
    board: { ...example.board },
    layers: [...(example.layers || [])],
    components: (example.components || []).map((component) => ({
      id: String(component.id),
      refdes: String(component.refdes),
      footprint: (component as { footprint?: string | null }).footprint ?? null,
      x: Number(component.x),
      y: Number(component.y),
      rotation: Number(component.rotation ?? 0),
      bbox: [
        Number(component.bbox?.[0] ?? 0),
        Number(component.bbox?.[1] ?? 0),
        Number(component.bbox?.[2] ?? 1),
        Number(component.bbox?.[3] ?? 1),
      ],
      netIds: (component.nets || []).map((net) => String(net.id)),
    })),
    traces: cloneTraceItems(example.traces || []),
    zones: cloneTraceItems(example.zones || []),
    vias: cloneTraceItems(example.vias || []),
    pads: cloneTraceItems(example.pads || []),
    keepouts: cloneTraceItems(example.keepouts || []),
    silkscreen: cloneTraceItems(example.silkscreen || []),
    boardOutlines: cloneTraceItems(example.boardOutlines || []),
    documentation: cloneTraceItems(example.documentation || []),
    mechanical: cloneTraceItems(example.mechanical || []),
    graphics: cloneTraceItems(example.graphics || []),
    drills: cloneTraceItems(example.drills || []),
    nets: [...(example.nets || [])],
    importMetadata: example.importMetadata,
  };
}

function isRelationExpandableNet(netId: unknown) {
  const value = String(netId || '').trim();
  return !!value && value !== '$NONE$';
}

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

function filterGeometryByLayer(items: TraceItem[] = [], layer = "TOP", includeNeutral = false) {
  const request = normalizeLayerId(layer);
  if (!request || request === "ALL" || request === "*") return cloneTraceItems(items);
  if (isTopLikeLayer(request)) {
    return cloneTraceItems(items.filter((item) => isTopLikeLayer(item.layerId) || (includeNeutral && !isBottomLikeLayer(item.layerId))));
  }
  if (isBottomLikeLayer(request)) {
    return cloneTraceItems(items.filter((item) => isBottomLikeLayer(item.layerId) || (includeNeutral && !isTopLikeLayer(item.layerId))));
  }
  return cloneTraceItems(items.filter((item) => normalizeLayerId(item.layerId) === request));
}

export function getHostedBoardById(id: string): HostedBoardData | null {
  if (id === DEMO_BOARD.board.id) return demoBoardToHosted();
  const example = getExampleById(id);
  return example ? exampleBoardToHosted(example) : null;
}

export function getHostedBoardsIndex(): BoardListEntry[] {
  const rows: BoardListEntry[] = [
    {
      ...DEMO_BOARD.board,
      createdAt: new Date(0).toISOString(),
      source: "demo",
    },
  ];

  for (const item of getExamplesIndex()) {
    const example = getExampleById(item.id);
    if (!example) continue;
    rows.push({
      ...example.board,
      createdAt: new Date(0).toISOString(),
      source: "example",
    });
  }

  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

export function getHostedBoardMetaById(id: string) {
  const board = getHostedBoardById(id);
  if (!board) return null;
  return {
    board: board.board,
    layers: board.layers,
  };
}

export function getHostedBoardComponentsById(id: string, search = "") {
  const board = getHostedBoardById(id);
  if (!board) return null;
  const needle = search.trim().toUpperCase();
  return {
    boardId: board.board.id,
    components: board.components
      .filter((component) => !needle || component.refdes.toUpperCase().includes(needle))
      .map((component) => ({ ...component, netIds: [...(component.netIds || [])] })),
  };
}

export function getHostedBoardGeometryById(id: string, layer = "TOP") {
  const board = getHostedBoardById(id);
  if (!board) return null;
  return {
    boardId: board.board.id,
    layer,
    traces: filterGeometryByLayer(board.traces, layer, false),
    zones: filterGeometryByLayer(board.zones || [], layer, false),
    vias: filterGeometryByLayer(board.vias || [], layer, false),
    pads: filterGeometryByLayer(board.pads || [], layer, false),
    keepouts: filterGeometryByLayer(board.keepouts || [], layer, true),
    silkscreen: filterGeometryByLayer(board.silkscreen || [], layer, true),
    boardOutlines: filterGeometryByLayer(board.boardOutlines || [], layer, true),
    documentation: filterGeometryByLayer(board.documentation || [], layer, true),
    mechanical: filterGeometryByLayer(board.mechanical || [], layer, true),
    graphics: filterGeometryByLayer(board.graphics || [], layer, true),
    drills: filterGeometryByLayer(board.drills || [], layer, true),
  };
}

export function getHostedBoardRelationsById(id: string, featureType: string, featureId: string): RelationsResponse | null {
  const board = getHostedBoardById(id);
  if (!board) return null;

  const overlayBuckets: Record<string, TraceItem[]> = {
    zones: board.zones || [],
    vias: board.vias || [],
    pads: board.pads || [],
    keepouts: board.keepouts || [],
    silkscreen: board.silkscreen || [],
    boardOutlines: board.boardOutlines || [],
    documentation: board.documentation || [],
    mechanical: board.mechanical || [],
    graphics: board.graphics || [],
    drills: board.drills || [],
  };

  let netIds: string[] = [];
  if (featureType === "component") {
    netIds = [...new Set(board.components.find((component) => component.id === featureId)?.netIds || [])];
  } else if (featureType === "trace") {
    const trace = board.traces.find((item) => item.id === featureId);
    netIds = trace?.netId ? [trace.netId] : [];
  } else {
    const overlay = (overlayBuckets[featureType] || []).find((item) => item.id === featureId);
    netIds = overlay?.netId && isRelationExpandableNet(overlay.netId) ? [String(overlay.netId)] : [];
  }

  const traces = board.traces
    .filter((trace) => netIds.includes(String(trace.netId)))
    .map((trace) => ({ id: trace.id, netId: String(trace.netId) }));

  const overlays = Object.entries(overlayBuckets)
    .flatMap(([kind, items]) => items.map((item) => ({ kind, ...item })))
    .filter((item) => item.netId && netIds.includes(String(item.netId)))
    .filter((item) => !(item.kind === featureType && item.id === featureId))
    .map((item) => ({ id: item.id, kind: item.kind, netId: String(item.netId || ""), layerId: String(item.layerId || "") }));

  const direct = board.components
    .filter((component) => !(featureType === "component" && component.id === featureId))
    .filter((component) => (component.netIds || []).some((netId) => netIds.includes(String(netId))))
    .map((component) => ({
      targetType: "component",
      targetId: component.id,
      relationType: "electrical",
      weight: 1,
    }));

  return {
    target: {
      type: featureType,
      id: featureId,
    },
    direct,
    nets: netIds,
    traces,
    overlays,
  };
}
