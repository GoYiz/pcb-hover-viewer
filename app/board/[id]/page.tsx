import { notFound } from "next/navigation";
import BoardViewerClient from "@/components/BoardViewerClient";
import { getHostedBoardById } from "@/lib/hosted-board";

export const dynamic = "force-dynamic";

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const board = getHostedBoardById(id);

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
        initialZones={board.zones}
        initialVias={board.vias}
        initialPads={board.pads}
        initialKeepouts={board.keepouts}
        initialSilkscreen={board.silkscreen}
        initialDocumentation={board.documentation}
        initialMechanical={board.mechanical}
        initialGraphics={board.graphics}
        initialDrills={board.drills}
        importMetadata={board.importMetadata}
      />
    </main>
  );
}
