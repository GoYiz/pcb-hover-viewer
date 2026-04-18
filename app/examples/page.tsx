import { getExampleById, getExamplesIndex } from "@/lib/examples";
import type { ExampleBoardData } from "@/lib/examples";
import ExamplesClient from "@/components/ExamplesClient";

export const dynamic = "force-dynamic";

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
  return <ExamplesClient index={index} examples={examples} initialExampleId={initialExampleId} />;
}
