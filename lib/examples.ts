import fs from "node:fs";
import path from "node:path";

export type ExampleIndexItem = {
  id: string;
  name: string;
  source: string;
  file: string;
  components: number;
  traces: number;
  format?: string;
  imported?: boolean;
};

export type ExampleBoardData = {
  board: {
    id: string;
    name: string;
    version: string;
    widthMm: number;
    heightMm: number;
  };
  layers: Array<{ id: string; name: string; zIndex: number }>;
  components: Array<{
    id: string;
    refdes: string;
    x: number;
    y: number;
    rotation: number;
    bbox: [number, number, number, number];
    nets?: Array<{ id: string; name: string }>;
  }>;
  traces: Array<{
    id: string;
    netId: string;
    layerId: string;
    width: number;
    path: [number, number][];
  }>;
  vias?: Array<{
    id: string;
    netId: string;
    layerId: string;
    width: number;
    path: [number, number][];
  }>;
  pads?: Array<{
    id: string;
    netId: string;
    layerId: string;
    width: number;
    path: [number, number][];
  }>;
  zones?: Array<{
    id: string;
    netId: string;
    layerId: string;
    width: number;
    path: [number, number][];
  }>;
  keepouts?: Array<{
    id: string;
    netId: string;
    layerId: string;
    width: number;
    path: [number, number][];
  }>;
  graphics?: Array<{
    id: string;
    netId: string;
    layerId: string;
    width: number;
    path: [number, number][];
  }>;
  silkscreen?: Array<{
    id: string;
    netId: string;
    layerId: string;
    width: number;
    path: [number, number][];
  }>;
  documentation?: Array<{
    id: string;
    netId: string;
    layerId: string;
    width: number;
    path: [number, number][];
  }>;
  mechanical?: Array<{
    id: string;
    netId: string;
    layerId: string;
    width: number;
    path: [number, number][];
  }>;
  drills?: Array<{
    id: string;
    netId: string;
    layerId: string;
    width: number;
    path: [number, number][];
  }>;
  nets: Array<{ id: string; name: string }>;
  importMetadata?: {
    sourceFormat: string;
    sourcePath?: string;
    stats?: {
      layerCount?: number;
      componentCount?: number;
      traceCount?: number;
      netCount?: number;
      traceCountByLayer?: Record<string, number>;
      traceCountBySemantic?: Record<string, number>;
      objectCountBySemantic?: Record<string, number>;
      geometryArrayCounts?: Record<string, number>;
    };
    layerCategories?: Record<string, string>;
    warnings?: string[];
  };
};

const EXAMPLES_DIR = path.join(process.cwd(), "public", "examples");

export function getExamplesIndex(): ExampleIndexItem[] {
  const file = path.join(EXAMPLES_DIR, "index.json");
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, "utf-8");
  const parsed = JSON.parse(raw) as { examples: ExampleIndexItem[] };
  return parsed.examples || [];
}

export function getExampleById(id: string): ExampleBoardData | null {
  const file = path.join(EXAMPLES_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf-8");
  return JSON.parse(raw) as ExampleBoardData;
}
