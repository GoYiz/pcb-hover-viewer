import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const boards = await prisma.board.findMany({
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

  return NextResponse.json({ boards });
}
