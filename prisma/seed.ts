import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.relationEdge.deleteMany();
  await prisma.pin.deleteMany();
  await prisma.overlayGeometry.deleteMany();
  await prisma.trace.deleteMany();
  await prisma.net.deleteMany();
  await prisma.component.deleteMany();
  await prisma.layer.deleteMany();
  await prisma.board.deleteMany();

  const boardId = "iphone-mainboard-demo";

  await prisma.board.create({
    data: {
      id: boardId,
      name: "iPhone Mainboard Demo",
      version: "v1",
      widthMm: 120,
      heightMm: 60,
    },
  });

  await prisma.layer.createMany({
    data: [
      { id: "TOP", boardId, name: "TOP", zIndex: 1 },
      { id: "BOTTOM", boardId, name: "BOTTOM", zIndex: 2 },
    ],
  });

  await prisma.component.createMany({
    data: [
      {
        id: "U1200",
        boardId,
        refdes: "U1200",
        footprint: "QFN-48",
        x: 20,
        y: 20,
        rotation: 0,
        bboxJson: JSON.stringify([18, 18, 4, 4]),
      },
      {
        id: "C1201",
        boardId,
        refdes: "C1201",
        footprint: "0201",
        x: 28,
        y: 20,
        rotation: 0,
        bboxJson: JSON.stringify([27.4, 19.6, 1.2, 0.8]),
      },
      {
        id: "L1200",
        boardId,
        refdes: "L1200",
        footprint: "0402",
        x: 36,
        y: 20,
        rotation: 0,
        bboxJson: JSON.stringify([35.2, 19.3, 1.6, 1.4]),
      },
      {
        id: "R1202",
        boardId,
        refdes: "R1202",
        footprint: "0201",
        x: 28,
        y: 30,
        rotation: 0,
        bboxJson: JSON.stringify([27.4, 29.6, 1.2, 0.8]),
      },
    ],
  });

  await prisma.net.createMany({
    data: [
      { id: "PP_VDD_MAIN", boardId, netName: "PP_VDD_MAIN" },
      { id: "PP_VDD_AON", boardId, netName: "PP_VDD_AON" },
    ],
  });

  await prisma.pin.createMany({
    data: [
      { id: "U1200.1", componentId: "U1200", netId: "PP_VDD_MAIN", x: 22, y: 20, layerId: "TOP" },
      { id: "C1201.1", componentId: "C1201", netId: "PP_VDD_MAIN", x: 28, y: 20, layerId: "TOP" },
      { id: "L1200.1", componentId: "L1200", netId: "PP_VDD_MAIN", x: 36, y: 20, layerId: "TOP" },
      { id: "U1200.2", componentId: "U1200", netId: "PP_VDD_AON", x: 20, y: 22, layerId: "TOP" },
      { id: "R1202.1", componentId: "R1202", netId: "PP_VDD_AON", x: 28, y: 30, layerId: "TOP" },
    ],
  });

  await prisma.trace.createMany({
    data: [
      {
        id: "T991",
        boardId,
        netId: "PP_VDD_MAIN",
        layerId: "TOP",
        pathJson: JSON.stringify([
          [22, 20],
          [28, 20],
          [36, 20],
        ]),
        width: 0.2,
      },
      {
        id: "T992",
        boardId,
        netId: "PP_VDD_AON",
        layerId: "TOP",
        pathJson: JSON.stringify([
          [20, 22],
          [24, 26],
          [28, 30],
        ]),
        width: 0.18,
      },
    ],
  });

  await prisma.overlayGeometry.createMany({
    data: [
      {
        id: "Z001",
        boardId,
        netId: "PP_VDD_MAIN",
        layerId: "TOP",
        kind: "zone",
        pathJson: JSON.stringify([
          [18, 16], [40, 16], [40, 24], [18, 24], [18, 16],
        ]),
        width: 0.1,
      },
      {
        id: "V001",
        boardId,
        netId: "PP_VDD_MAIN",
        layerId: "TOP",
        kind: "via",
        pathJson: JSON.stringify([
          [28.3, 20], [28.2494, 20.2121], [28.1, 20.3674], [27.8879, 20.418], [27.6757, 20.3674], [27.5206, 20.2121], [27.47, 20], [27.5206, 19.7879], [27.6757, 19.6326], [27.8879, 19.582], [28.1, 19.6326], [28.2494, 19.7879], [28.3, 20],
        ]),
        width: 0.6,
      },
      {
        id: "P001",
        boardId,
        netId: "PP_VDD_MAIN",
        layerId: "TOP",
        kind: "pad",
        pathJson: JSON.stringify([
          [27.2, 19.2], [28.8, 19.2], [28.8, 20.8], [27.2, 20.8], [27.2, 19.2],
        ]),
        width: 0.8,
      },
      {
        id: "K001",
        boardId,
        netId: null,
        layerId: "TOP",
        kind: "keepout",
        pathJson: JSON.stringify([
          [44, 12], [52, 12], [52, 22], [44, 22], [44, 12],
        ]),
        width: 0.1,
      },
      {
        id: "S001",
        boardId,
        netId: null,
        layerId: "TOP",
        kind: "silkscreen",
        pathJson: JSON.stringify([
          [16, 14], [42, 14],
        ]),
        width: 0.12,
      },
      {
        id: "D001",
        boardId,
        netId: null,
        layerId: "TOP",
        kind: "drill",
        pathJson: JSON.stringify([
          [36.35, 20], [36.2899, 20.2475], [36.1232, 20.438], [35.888, 20.4987], [35.6527, 20.438], [35.4861, 20.2475], [35.426, 20], [35.4861, 19.7525], [35.6527, 19.562], [35.888, 19.5013], [36.1232, 19.562], [36.2899, 19.7525], [36.35, 20],
        ]),
        width: 0.7,
      },
      {
        id: "O001",
        boardId,
        netId: null,
        layerId: "TOP",
        kind: "board_outline",
        pathJson: JSON.stringify([
          [4, 4], [116, 4], [116, 56], [4, 56], [4, 4],
        ]),
        width: 0.12,
      },
      {
        id: "DOC001",
        boardId,
        netId: null,
        layerId: "TOP",
        kind: "documentation",
        pathJson: JSON.stringify([
          [12, 10], [28, 10],
        ]),
        width: 0.1,
      },
      {
        id: "MECH001",
        boardId,
        netId: null,
        layerId: "TOP",
        kind: "mechanical",
        pathJson: JSON.stringify([
          [46, 30], [58, 30], [58, 40], [46, 40], [46, 30],
        ]),
        width: 0.1,
      },
      {
        id: "GFX001",
        boardId,
        netId: null,
        layerId: "TOP",
        kind: "graphics",
        pathJson: JSON.stringify([
          [14, 48], [22, 52], [30, 48],
        ]),
        width: 0.1,
      },
    ],
  });

  await prisma.relationEdge.createMany({
    data: [
      {
        id: "rel-1",
        boardId,
        sourceType: "component",
        sourceId: "U1200",
        targetType: "component",
        targetId: "C1201",
        relationType: "electrical",
        weight: 1,
      },
      {
        id: "rel-2",
        boardId,
        sourceType: "component",
        sourceId: "U1200",
        targetType: "component",
        targetId: "L1200",
        relationType: "electrical",
        weight: 1,
      },
      {
        id: "rel-3",
        boardId,
        sourceType: "component",
        sourceId: "U1200",
        targetType: "component",
        targetId: "R1202",
        relationType: "adjacent",
        weight: 0.5,
      },
    ],
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
