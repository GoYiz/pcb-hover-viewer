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
};

export function getDemoBoardById(id: string) {
  return id === DEMO_BOARD.board.id ? DEMO_BOARD : null;
}
