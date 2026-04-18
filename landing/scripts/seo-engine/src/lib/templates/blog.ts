import type { ResearchDossier } from "../types.js";

export function blogTemplate(dossier: ResearchDossier): string {
  const facts = dossier.synthesizedFacts
    .slice(0, 10)
    .map((f) => `- ${f.fact} (confidence: ${f.confidence}, sources: ${f.sources.join(", ")})`)
    .join("\n");

  const gaps = dossier.contentGaps.map((g) => `- ${g}`).join("\n");
  const headings = dossier.recommendedHeadings.map((h) => `- ${h}`).join("\n");
  const refs = dossier.medicalReferences.map((r) => `- ${r.title}: ${r.url}`).join("\n");

  return `Write a blog post about "${dossier.primaryKeyword}".

## Structure
1. **Hook** (1-2 sentences) — open with a relatable scenario or surprising fact
2. **The Problem** — what people struggle with regarding ${dossier.primaryKeyword}
3. **The Science** — evidence-based explanation using the research below
4. **Practical Advice** — actionable steps the reader can take today
5. **How Glowlytics Helps** (1-2 sentences) — brief, natural tie-in to our app's skin tracking
6. **Sources** — reference the medical sources naturally in-text

## Target
- 1500-2500 words
- H2 headings for each section, H3 for subsections
- Recommended angle: ${dossier.recommendedAngle}

## Recommended Headings
${headings}

## Key Facts From Research
${facts}

## Content Gaps to Fill (competitors miss these)
${gaps}

## Medical References
${refs}`;
}
