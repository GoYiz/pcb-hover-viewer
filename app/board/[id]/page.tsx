import { notFound } from "next/navigation";
import BoardViewerClient from "@/components/BoardViewerClient";
import { getDemoBoardById } from "@/lib/demo-board";

export const dynamic = "force-dynamic";

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const board = getDemoBoardById(id);

  if (!board) notFound();

  return (
    <main>
      <BoardViewerClient
        boardId={board.board.id}
        boardName={board.board.name}
        boardWidthMm={board.board.widthMm}
        boardHeightMm={board.board.heightMm}
        initialComponents={board.components}
        initialTraces={board.traces}
        initialZones={(board as { zones?: import("@/types/pcb").TraceItem[] }).zones}
        initialVias={(board as { vias?: import("@/types/pcb").TraceItem[] }).vias}
        initialPads={(board as { pads?: import("@/types/pcb").TraceItem[] }).pads}
        initialKeepouts={(board as { keepouts?: import("@/types/pcb").TraceItem[] }).keepouts}
        initialSilkscreen={(board as { silkscreen?: import("@/types/pcb").TraceItem[] }).silkscreen}
        initialDrills={(board as { drills?: import("@/types/pcb").TraceItem[] }).drills}
        importMetadata={(board as { importMetadata?: import("@/types/pcb").ImportMetadata }).importMetadata}
      />
    </main>
  );
}
