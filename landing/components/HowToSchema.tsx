import type { ContentMeta } from "@/lib/types";

interface HowToStep {
  name: string;
  text: string;
}

export default function HowToSchema({ meta, steps }: { meta: ContentMeta; steps: HowToStep[] }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: meta.title,
    description: meta.description,
    step: steps.map((step, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: step.name,
      text: step.text,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
