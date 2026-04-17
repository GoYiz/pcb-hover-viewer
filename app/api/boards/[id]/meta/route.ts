import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDemoBoardMetaById } from "@/lib/demo-board";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const demo = getDemoBoardMetaById(id);
  if (demo) return NextResponse.json(demo);

  const board = await prisma.board.findUnique({
    where: { id },
    select: { id: true, name: true, version: true, widthMm: true, heightMm: true },
  });
  if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });

  const layers = await prisma.layer.findMany({
    where: { boardId: id },
    orderBy: { zIndex: "asc" },
    select: { id: true, name: true, zIndex: true },
  });
  return NextResponse.json({ board, layers });
}
