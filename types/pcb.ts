export type BoardMeta = {
  id: string;
  name: string;
  version: string;
  widthMm: number;
  heightMm: number;
};

export type Layer = {
  id: string;
  name: string;
  zIndex: number;
};

export type ComponentItem = {
  id: string;
  refdes: string;
  footprint?: string | null;
  x: number;
  y: number;
  rotation: number;
  bbox: [number, number, number, number];
  netIds?: string[];
};

export type TraceItem = {
  id: string;
  netId: string;
  layerId: string;
  width: number;
  path: [number, number][];
};

export type RelationsResponse = {
  target: { type: string; id: string };
  direct: Array<{
    targetType: string;
    targetId: string;
    relationType: string;
    weight: number;
  }>;
  nets: string[];
  traces: Array<{ id: string; netId: string }>;
};


export type ImportMetadata = {
  sourceFormat: string;
  sourcePath?: string;
  stats?: {
    layerCount?: number;
    componentCount?: number;
    traceCount?: number;
    netCount?: number;
    traceCountByLayer?: Record<string, number>;
  };
  layerCategories?: Record<string, string>;
  warnings?: string[];
};
