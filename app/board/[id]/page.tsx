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
      />
    </main>
  );
}
