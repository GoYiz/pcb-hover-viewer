import dynamic from "next/dynamic";
import { getExampleById, getExamplesIndex } from "@/lib/examples";
import type { ExampleBoardData } from "@/lib/examples";

const ExamplesClientNoSSR = dynamic(() => import("@/components/ExamplesClient"), {
  ssr: false,
  loading: () => <main style={{ padding: 24, color: "#cbd5e1" }}>Loading examples…</main>,
});

export default function ExamplesPage() {
  const index = getExamplesIndex();
  const examples: Record<string, ExampleBoardData> = {};

  for (const item of index) {
    const data = getExampleById(item.id);
    if (data) examples[item.id] = data;
  }

  return <ExamplesClientNoSSR index={index} examples={examples} />;
}
