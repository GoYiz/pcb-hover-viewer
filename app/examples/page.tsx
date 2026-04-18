import { getExampleById, getExamplesIndex } from "@/lib/examples";
import type { ExampleBoardData } from "@/lib/examples";
import ExamplesClient from "@/components/ExamplesClient";
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

export default async function ExamplesPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = searchParams ? await searchParams : {};
  const requestedExample = typeof params?.example === "string" ? params.example : undefined;
  const index = getExamplesIndex();
  const examples: Record<string, ExampleBoardData> = {};

  for (const item of index) {
    const data = getExampleById(item.id);
    if (data) examples[item.id] = data;
  }

  const initialExampleId = requestedExample && examples[requestedExample] ? requestedExample : undefined;
  const inspectKind = typeof params?.inspect_kind === "string" ? params.inspect_kind as HoverFeatureType : undefined;
  const inspectId = typeof params?.inspect_id === "string" ? params.inspect_id : undefined;
  const initialVisibleDetail = inspectKind && INSPECT_FAMILY_MAP[inspectKind]
    ? ["grid", "components", "labels", "measures", ...INSPECT_FAMILY_MAP[inspectKind]]
    : undefined;
  return <ExamplesClient index={index} examples={examples} initialExampleId={initialExampleId} initialInspectType={inspectKind} initialInspectId={inspectId} initialVisibleDetail={initialVisibleDetail} />;
}
