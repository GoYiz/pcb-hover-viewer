import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

const BoardViewerClient = dynamic(() => import("@/components/BoardViewerClient"), {
  ssr: false,
  loading: () => <main style={{ padding: 24, color: "#cbd5e1" }}>Loading workbench…</main>,
});

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const board = await prisma.board.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      widthMm: true,
      heightMm: true,
    },
  });

  if (!board) {
    notFound();
  }

  return (
    <main>
      <BoardViewerClient
        boardId={board.id}
        boardName={board.name}
        boardWidthMm={board.widthMm}
        boardHeightMm={board.heightMm}
      />
    </main>
  );
}
