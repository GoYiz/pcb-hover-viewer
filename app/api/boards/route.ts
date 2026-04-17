import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEMO_BOARD } from "@/lib/demo-board";

export async function GET() {
  let boards: Array<{ id: string; name: string; version: string; widthMm: number; heightMm: number; createdAt: Date | string }> = [];
  try {
    boards = await prisma.board.findMany({
      select: { id: true, name: true, version: true, widthMm: true, heightMm: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
  } catch {
    boards = [];
  }
  if (!boards.some((board) => board.id === DEMO_BOARD.board.id)) {
    boards.unshift({ ...DEMO_BOARD.board, createdAt: new Date(0).toISOString() });
  }
  return NextResponse.json({ boards });
}
