import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHostedBoardsIndex } from "@/lib/hosted-board";

export async function GET() {
  let boards: Array<{ id: string; name: string; version: string; widthMm: number; heightMm: number; createdAt: Date | string }> = [];

  try {
    boards = await prisma.board.findMany({
      select: {
        id: true,
        name: true,
        version: true,
        widthMm: true,
        heightMm: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  } catch {
    boards = [];
  }

  const merged = [...boards, ...getHostedBoardsIndex()];
  const seen = new Set<string>();
  const unique = merged.filter((board) => {
    if (seen.has(board.id)) return false;
    seen.add(board.id);
    return true;
  });

  return NextResponse.json({ boards: unique });
}
