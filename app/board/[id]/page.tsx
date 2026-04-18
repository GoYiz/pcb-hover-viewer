import { notFound } from "next/navigation";
import BoardViewerClient from "@/components/BoardViewerClient";
import { getHostedBoardById } from "@/lib/hosted-board";
import type { HoverFeatureType } from "@/store/viewerStore";

export const dynamic = "force-dynamic";

const INSPECT_FAMILY_MAP: Record<string, string[]> = {
  zones: ["zones", "vias", "pads"],
  vias: ["zones", "vias", "pads"],
  pads: ["zones", "vias", "pads"],
  keepouts: ["keepouts", "silkscreen", "drills"],
  silkscreen: ["keepouts", "silkscreen", "drills"],
  drills: ["keepouts", "silkscreen", "drills"],
  documentation: ["documentation", "mechanical", "graphics"],
  mechanical: ["documentation", "mechanical", "graphics"],
  graphics: ["documentation", "mechanical", "graphics"],
};

export default async function BoardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const qs = searchParams ? await searchParams : {};
  const board = getHostedBoardById(id);

  if (!board) notFound();

  const view = typeof qs?.view === "string" && (qs.view === "leafer" || qs.view === "three") ? qs.view : undefined;
  const inspectKind = typeof qs?.inspect_kind === "string" ? qs.inspect_kind as HoverFeatureType : undefined;
  const inspectId = typeof qs?.inspect_id === "string" ? qs.inspect_id : undefined;
  const initialVisibleDetail = inspectKind && INSPECT_FAMILY_MAP[inspectKind]
    ? ["grid", "components", "labels", "measures", ...INSPECT_FAMILY_MAP[inspectKind]]
    : undefined;

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
        initialViewMode={view}
        initialVisibleDetail={initialVisibleDetail}
        initialInspectType={inspectKind}
        initialInspectId={inspectId}
        importMetadata={board.importMetadata}
      />
    </main>
  );
}
