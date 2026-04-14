import type { ResearchDossier } from "../types.js";

export function glossaryTemplate(dossier: ResearchDossier): string {
  const facts = dossier.synthesizedFacts
    .filter((f) => f.confidence !== "low")
    .slice(0, 5)
    .map((f) => `- ${f.fact}`)
    .join("\n");

  return `Write a glossary entry for "${dossier.primaryKeyword}".

## Structure
1. **Definition** (1-2 sentences) — clear, accessible definition
2. **Why It Matters for Skin Health** — explain the relevance in plain language
3. **How It Works** — the science behind it, simplified
4. **How Glowlytics Measures This** (if applicable) — brief mention if it maps to one of our 5 skin signals: structure, hydration, inflammation, sun damage, elasticity
5. **Related Terms** — 3-5 related glossary terms (just list them, they'll be auto-linked)

## Target
- 400-800 words
- Grade 8 reading level
- No jargon without explanation

## Key Facts
${facts}`;
}
