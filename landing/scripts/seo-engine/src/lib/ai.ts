import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function aiResearch(
  keyword: string,
  serpContent: string,
  competitorHeadings: string
): Promise<{
  synthesizedFacts: { fact: string; sources: string[]; confidence: "high" | "medium" | "low" }[];
  contentGaps: string[];
  medicalReferences: { title: string; url: string }[];
  recommendedAngle: string;
  recommendedHeadings: string[];
  recommendedWordCount: number;
}> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are a dermatology content researcher. Analyze the following SERP content for the keyword "${keyword}" and produce a research dossier.

## Top-Ranking Content
${serpContent}

## Competitor Heading Structures
${competitorHeadings}

## Your Task
Analyze the content and produce a JSON object with these fields:
1. "synthesizedFacts": Array of {fact, sources: [urls], confidence: "high"|"medium"|"low"} — key medical/scientific facts across sources
2. "contentGaps": Array of strings — topics the top results miss that a comprehensive article should cover
3. "medicalReferences": Array of {title, url} — any cited studies or medical sources
4. "recommendedAngle": String — what unique angle would make our article stand out (we are Glowlytics, an AI skin health tracking app)
5. "recommendedHeadings": Array of strings — recommended H2 headings for our article
6. "recommendedWordCount": Number — target word count based on competitor analysis

Respond with ONLY the JSON object, no markdown formatting.`,
      },
    ],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  return JSON.parse(text);
}

export async function aiWrite(
  template: string,
  dossier: string,
  keyword: string
): Promise<string> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: `You are an expert health content writer for Glowlytics, an AI-powered skin health tracking app. Write content based on the following template and research.

## Template
${template}

## Research Dossier
${dossier}

## Primary Keyword
${keyword}

## Guidelines
- Authoritative but approachable tone
- Evidence-first: cite sources for medical claims
- Include "consult a dermatologist" disclaimers where appropriate
- Never claim to diagnose or treat conditions
- Naturally reference Glowlytics where relevant (not salesy)
- Primary keyword should appear in the first paragraph
- Use PAA questions as H2 headings where they fit naturally
- Target reading level: grade 8-10
- Use markdown formatting (## for H2, ### for H3, etc.)

Write the full article content in markdown. Do NOT include frontmatter — just the body content starting with the first paragraph.`,
      },
    ],
  });

  return message.content[0].type === "text" ? message.content[0].text : "";
}
