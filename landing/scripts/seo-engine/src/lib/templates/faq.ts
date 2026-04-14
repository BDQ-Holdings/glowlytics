import type { ResearchDossier } from "../types.js";

export function faqTemplate(dossier: ResearchDossier): string {
  const facts = dossier.synthesizedFacts
    .map((f) => `- ${f.fact} (${f.confidence})`)
    .join("\n");

  return `Write an FAQ article about "${dossier.primaryKeyword}".

## Structure
Write 5-8 question-answer pairs. Each answer should:
1. Start with a concise 1-2 sentence direct answer
2. Follow with a paragraph of expanded detail with evidence
3. Include a source citation where applicable

## Format
Use ## for each question (as an H2), followed by the answer as body text.

## Questions to Cover
Use People Also Ask questions as your primary source:
${dossier.synthesizedFacts.length > 0 ? "Adapt and expand based on the research below." : ""}

## Key Facts
${facts}

## Target
- 800-1200 words total
- 5-8 Q&A pairs
- Each answer: 80-150 words
- Medical disclaimer at the end`;
}
