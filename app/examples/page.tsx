import { getExampleById, getExamplesIndex } from "@/lib/examples";
import type { ExampleBoardData } from "@/lib/examples";
import ExamplesClient from "@/components/ExamplesClient";

export const dynamic = "force-dynamic";

export default function ExamplesPage() {
  const index = getExamplesIndex();
  const examples: Record<string, ExampleBoardData> = {};

  for (const item of index) {
    const data = getExampleById(item.id);
    if (data) examples[item.id] = data;
  }

  return <ExamplesClient index={index} examples={examples} />;
}
