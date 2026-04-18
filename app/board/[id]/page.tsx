import { notFound } from "next/navigation";
import BoardViewerClient from "@/components/BoardViewerClient";
import { getHostedBoardById } from "@/lib/hosted-board";
import { prisma } from "@/lib/prisma";
import type { HoverFeatureType } from "@/store/viewerStore";

export const dynamic = "force-dynamic";

const INSPECT_FAMILY_MAP: Record<string, string[]> = {
  zones: ["zones", "vias", "pads"],
  vias: ["zones", "vias", "pads"],
  pads: ["zones", "vias", "pads"],
  keepouts: ["keepouts", "silkscreen", "drills"],
  silkscreen: ["keepouts", "silkscreen", "drills"],
  drills: ["keepouts", "silkscreen", "drills"],
  boardOutlines: ["boardOutlines"],
  documentation: ["documentation", "mechanical", "graphics"],
  mechanical: ["documentation", "mechanical", "graphics"],
  graphics: ["documentation", "mechanical", "graphics"],
};

export default async function BoardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const qs = searchParams ? await searchParams : {};
  const hosted = getHostedBoardById(id);
  const dbBoard = hosted
    ? null
    : await prisma.board.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          widthMm: true,
          heightMm: true,
        },
      });

  if (!hosted && !dbBoard) notFound();

  const view = typeof qs?.view === "string" && (qs.view === "leafer" || qs.view === "three") ? qs.view : undefined;
  const inspectKind = typeof qs?.inspect_kind === "string" ? qs.inspect_kind as HoverFeatureType : undefined;
  const inspectId = typeof qs?.inspect_id === "string" ? qs.inspect_id : undefined;
  const initialVisibleDetail = inspectKind && INSPECT_FAMILY_MAP[inspectKind]
    ? ["grid", "components", "labels", "measures", ...INSPECT_FAMILY_MAP[inspectKind]]
    : undefined;

  const boardName = hosted?.board.name || dbBoard?.name;
  const boardWidthMm = hosted?.board.widthMm || dbBoard?.widthMm;
  const boardHeightMm = hosted?.board.heightMm || dbBoard?.heightMm;

  return (
    <main>
      <BoardViewerClient
        boardId={id}
        boardName={boardName}
        boardWidthMm={boardWidthMm}
        boardHeightMm={boardHeightMm}
        initialComponents={hosted?.components}
        initialTraces={hosted?.traces}
        initialZones={hosted?.zones}
        initialVias={hosted?.vias}
        initialPads={hosted?.pads}
        initialKeepouts={hosted?.keepouts}
        initialSilkscreen={hosted?.silkscreen}
        initialBoardOutlines={hosted?.boardOutlines}
        initialDocumentation={hosted?.documentation}
        initialMechanical={hosted?.mechanical}
        initialGraphics={hosted?.graphics}
        initialDrills={hosted?.drills}
        initialViewMode={view}
        initialVisibleDetail={initialVisibleDetail}
        initialInspectType={inspectKind}
        initialInspectId={inspectId}
        importMetadata={hosted?.importMetadata}
      />
    </main>
  );
}
