export const DEMO_BOARD = {
  board: {
    id: "iphone-mainboard-demo",
    name: "iPhone Mainboard Demo",
    version: "v1",
    widthMm: 120,
    heightMm: 60,
  },
  components: [
    { id: "U1200", refdes: "U1200", footprint: "QFN-48", x: 20, y: 20, rotation: 0, bbox: [18, 18, 4, 4] as [number, number, number, number], netIds: ["PP_VDD_MAIN", "PP_VDD_AON"] },
    { id: "C1201", refdes: "C1201", footprint: "0201", x: 28, y: 20, rotation: 0, bbox: [27.4, 19.6, 1.2, 0.8] as [number, number, number, number], netIds: ["PP_VDD_MAIN"] },
    { id: "L1200", refdes: "L1200", footprint: "0402", x: 36, y: 20, rotation: 0, bbox: [35.2, 19.3, 1.6, 1.4] as [number, number, number, number], netIds: ["PP_VDD_MAIN"] },
    { id: "R1202", refdes: "R1202", footprint: "0201", x: 28, y: 30, rotation: 0, bbox: [27.4, 29.6, 1.2, 0.8] as [number, number, number, number], netIds: ["PP_VDD_AON"] },
  ],
  traces: [
    { id: "T991", netId: "PP_VDD_MAIN", layerId: "F.Cu", width: 0.2, path: [[22, 20], [28, 20], [36, 20]] as [number, number][] },
    { id: "T992", netId: "PP_VDD_AON", layerId: "F.Cu", width: 0.18, path: [[20, 22], [24, 26], [28, 30]] as [number, number][] },
  ],
  zones: [
    { id: "Z1", netId: "PP_VDD_MAIN", layerId: "F.Cu", width: 0.1, path: [[18, 16], [40, 16], [40, 24], [18, 24], [18, 16]] as [number, number][] },
  ],
  vias: [
    { id: "V1", netId: "PP_VDD_MAIN", layerId: "F.Cu", width: 0.6, path: [[28.3, 20], [28.2494, 20.2121], [28.1, 20.3674], [27.8879, 20.418], [27.6757, 20.3674], [27.5206, 20.2121], [27.47, 20], [27.5206, 19.7879], [27.6757, 19.6326], [27.8879, 19.582], [28.1, 19.6326], [28.2494, 19.7879], [28.3, 20]] as [number, number][] },
  ],
  pads: [
    { id: "P1", netId: "PP_VDD_MAIN", layerId: "F.Cu", width: 0.8, path: [[27.2, 19.2], [28.8, 19.2], [28.8, 20.8], [27.2, 20.8], [27.2, 19.2]] as [number, number][] },
  ],
  keepouts: [
    { id: "K1", netId: "", layerId: "Keep-Out Layer", width: 0.1, path: [[44, 12], [52, 12], [52, 22], [44, 22], [44, 12]] as [number, number][] },
  ],
  silkscreen: [
    { id: "S1", netId: "", layerId: "F.SilkS", width: 0.12, path: [[16, 14], [42, 14]] as [number, number][] },
  ],
  documentation: [
    { id: "DOC1", netId: "", layerId: "Dwgs.User", width: 0.1, path: [[12, 10], [28, 10]] as [number, number][] },
  ],
  mechanical: [
    { id: "M1", netId: "", layerId: "Eco1.User", width: 0.1, path: [[46, 30], [58, 30], [58, 40], [46, 40], [46, 30]] as [number, number][] },
  ],
  graphics: [
    { id: "G1", netId: "", layerId: "Cmts.User", width: 0.1, path: [[14, 48], [22, 52], [30, 48]] as [number, number][] },
  ],
  boardOutlines: [
    { id: "O1", netId: "", layerId: "BOARD_EDGE", width: 0.12, path: [[4, 4], [116, 4], [116, 56], [4, 56], [4, 4]] as [number, number][] },
  ],
  drills: [
    { id: "D1", netId: "", layerId: "DRILL", width: 0.7, path: [[36.35, 20], [36.2899, 20.2475], [36.1232, 20.438], [35.888, 20.4987], [35.6527, 20.438], [35.4861, 20.2475], [35.426, 20], [35.4861, 19.7525], [35.6527, 19.562], [35.888, 19.5013], [36.1232, 19.562], [36.2899, 19.7525], [36.35, 20]] as [number, number][] },
  ],
};

export const DEMO_BOARD_LAYERS = [
  { id: "F.Cu", name: "F.Cu", zIndex: 1 },
  { id: "B.Cu", name: "B.Cu", zIndex: 2 },
];

export function getDemoBoardById(id: string) {
  return id === DEMO_BOARD.board.id ? DEMO_BOARD : null;
}

export function getDemoBoardMetaById(id: string) {
  const board = getDemoBoardById(id);
  if (!board) return null;
  return { board: board.board, layers: DEMO_BOARD_LAYERS };
}

export function getDemoBoardComponentsById(id: string, search = "") {
  const board = getDemoBoardById(id);
  if (!board) return null;
  const needle = search.trim().toUpperCase();
  return {
    boardId: board.board.id,
    components: board.components
      .filter((component) => !needle || component.refdes.toUpperCase().includes(needle))
      .map((component) => ({ ...component, netIds: [...(component.netIds || [])] })),
  };
}

function isBottomLikeLayer(layer: string) {
  const value = layer.trim().toUpperCase();
  return value === "BOTTOM" || value === "B.CU" || value === "B_CU";
}

export function getDemoBoardGeometryById(id: string, layer = "TOP") {
  const board = getDemoBoardById(id);
  if (!board) return null;
  const includeTopGeometry = !isBottomLikeLayer(layer);
  return {
    boardId: board.board.id,
    layer,
    traces: includeTopGeometry ? [...board.traces] : [],
    zones: includeTopGeometry ? [...(board.zones || [])] : [],
    vias: includeTopGeometry ? [...(board.vias || [])] : [],
    pads: includeTopGeometry ? [...(board.pads || [])] : [],
    keepouts: includeTopGeometry ? [...(board.keepouts || [])] : [],
    silkscreen: includeTopGeometry ? [...(board.silkscreen || [])] : [],
    boardOutlines: includeTopGeometry ? [...(board.boardOutlines || [])] : [],
    documentation: includeTopGeometry ? [...(board.documentation || [])] : [],
    mechanical: includeTopGeometry ? [...(board.mechanical || [])] : [],
    graphics: includeTopGeometry ? [...(board.graphics || [])] : [],
    drills: includeTopGeometry ? [...(board.drills || [])] : [],
  };
}

export function getDemoBoardRelationsById(id: string, featureType: string, featureId: string) {
  const board = getDemoBoardById(id);
  if (!board) return null;
  let netIds: string[] = [];
  if (featureType === "component") {
    netIds = [...new Set(board.components.find((component) => component.id === featureId)?.netIds || [])];
  } else if (featureType === "trace") {
    const trace = board.traces.find((item) => item.id === featureId);
    netIds = trace?.netId ? [trace.netId] : [];
  }
  const traces = board.traces.filter((trace) => netIds.includes(trace.netId)).map((trace) => ({ id: trace.id, netId: trace.netId }));
  const direct = board.components
    .filter((component) => !(featureType === "component" && component.id === featureId))
    .filter((component) => (component.netIds || []).some((netId) => netIds.includes(netId)))
    .map((component) => ({ targetType: "component", targetId: component.id, relationType: "electrical", weight: 1 }));
  return { target: { type: featureType, id: featureId }, direct, nets: netIds, traces };
}
