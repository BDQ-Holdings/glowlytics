import type { ResearchDossier } from "../types.js";

export function guideTemplate(dossier: ResearchDossier): string {
  const facts = dossier.synthesizedFacts
    .map((f) => `- ${f.fact} (${f.confidence})`)
    .join("\n");

  const headings = dossier.recommendedHeadings.map((h) => `- ${h}`).join("\n");
  const refs = dossier.medicalReferences.map((r) => `- ${r.title}: ${r.url}`).join("\n");

  return `Write a step-by-step guide about "${dossier.primaryKeyword}".

## Structure
1. **Introduction** — what this guide covers and who it's for
2. **Steps** — numbered steps (## Step 1: ..., ## Step 2: ..., etc.)
   - Each step has a clear action, why it matters, and specific product/ingredient recommendations where relevant
3. **Pro Tips** — 2-3 advanced tips for better results
4. **Common Mistakes** — 2-3 things to avoid
5. **When to See a Dermatologist** — clear criteria for professional help

## Target
- 1500-2000 words
- 4-7 numbered steps
- Recommended angle: ${dossier.recommendedAngle}

## Recommended Headings
${headings}

## Key Facts
${facts}

## Medical References
${refs}`;
}
