import type { ResearchDossier } from "../types.js";

export function faqTemplate(dossier: ResearchDossier): string {
  const facts = dossier.synthesizedFacts
    .map((f) => `- ${f.fact} (${f.confidence})`)
    .join("\n");

  // PAA is the strongest single signal for FAQ pages — Google literally tells
  // us what people ask alongside the primary keyword. Surface up to 12 so the
  // model can pick the highest-quality 5–8.
  const paaList = (dossier.paaQuestions || [])
    .slice(0, 12)
    .map((q) => `- ${q}`)
    .join("\n");

  return `Write an FAQ article about "${dossier.primaryKeyword}".

## Structure
Write 5-8 question-answer pairs. Each answer should:
1. Start with a concise 1-2 sentence direct answer
2. Follow with a paragraph of expanded detail with evidence
3. Include a source citation where applicable

## Format
Use ## for each question (as an H2), followed by the answer as body text.

## Questions To Cover
${paaList || "(No People-Also-Ask data; infer the most useful questions from the facts below.)"}

Adapt the wording slightly so each H2 reads naturally and matches the article's tone.
If fewer than 5 PAA questions are listed, invent the missing ones from the facts.

## Key Facts
${facts}

## Target
- 800-1200 words total
- 5-8 Q&A pairs
- Each answer: 80-150 words
- Medical disclaimer at the end`;
}
