import type { BoardMeta, ComponentItem, RelationsResponse, TraceItem } from "@/types/pcb";

export async function fetchBoardMeta(boardId: string) {
  const res = await fetch(`/api/boards/${boardId}/meta`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch board meta");
  return (await res.json()) as { board: BoardMeta; layers: Array<{ id: string; name: string; zIndex: number }> };
}

export async function fetchBoardComponents(boardId: string) {
  const res = await fetch(`/api/boards/${boardId}/components`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch components");
  return (await res.json()) as { boardId: string; components: ComponentItem[] };
}

export async function fetchBoardGeometry(boardId: string, layer = "TOP") {
  const res = await fetch(`/api/boards/${boardId}/geometry?layer=${layer}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch geometry");
  return (await res.json()) as { boardId: string; layer: string; traces: TraceItem[] };
}

export async function fetchRelations(
  boardId: string,
  featureType: "component" | "trace",
  featureId: string,
) {
  const res = await fetch(`/api/boards/${boardId}/relations/${featureType}/${featureId}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch relations");
  return (await res.json()) as RelationsResponse;
}

export const fetchComponents = fetchBoardComponents;
export const fetchGeometry = fetchBoardGeometry;
