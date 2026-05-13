import OpenAI from "openai";
import { getAiTimeoutMs, parseJsonResponse } from "./pipeline.js";

const openaiKey = (process.env.OPENAI_API_KEY || "").replace(/\s+/g, "");
const client = new OpenAI({ apiKey: openaiKey });

function requireOpenAIKey(): void {
  if (!openaiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
}

function getModel(envName: string, fallback: string): string {
  return process.env[envName]?.trim() || process.env.SEO_OPENAI_MODEL?.trim() || fallback;
}

async function withAiTimeout<T>(promise: Promise<T>, context: string): Promise<T> {
  const timeoutMs = getAiTimeoutMs();

  return await Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`OpenAI ${context} timed out after ${timeoutMs}ms.`)), timeoutMs)
    ),
  ]);
}

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
  requireOpenAIKey();

  const completion = await withAiTimeout(
    client.chat.completions.create({
      model: getModel("SEO_RESEARCH_MODEL", "gpt-4o"),
      response_format: { type: "json_object" },
      max_tokens: 4096,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a dermatology content researcher. Return only valid JSON with grounded, citation-aware analysis.",
        },
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
    }),
    `research request for "${keyword}"`
  );

  const text = completion.choices?.[0]?.message?.content?.trim() || "";
  return parseJsonResponse(text);
}

export async function aiWrite(
  template: string,
  dossier: string,
  keyword: string,
  targetWordCount: number
): Promise<string> {
  requireOpenAIKey();

  const completion = await withAiTimeout(
    client.chat.completions.create({
      model: getModel("SEO_WRITING_MODEL", "gpt-4o"),
      max_tokens: 8192,
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "You are an expert health content writer for Glowlytics. Write evidence-first markdown content that is useful, restrained, and medically careful.",
        },
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
- The exact primary keyword must appear verbatim in the first paragraph
- Meet the template's target length; do not return a short stub
- Target approximately ${targetWordCount} words and do not stop early
- Use PAA questions as H2 headings where they fit naturally
- Target reading level: grade 8-10
- Use markdown formatting (## for H2, ### for H3, etc.)

Write the full article content in markdown. Do NOT include frontmatter — just the body content starting with the first paragraph.`,
        },
      ],
    }),
    `writing request for "${keyword}"`
  );

  const text = completion.choices?.[0]?.message?.content?.trim() || "";
  if (!text) {
    throw new Error(`AI returned empty article draft for keyword "${keyword}".`);
  }
  return text;
}

export async function aiRepairDraft(
  originalDraft: string,
  dossier: string,
  keyword: string,
  issues: string[],
  targetWordCount: number
): Promise<string> {
  requireOpenAIKey();

  const completion = await withAiTimeout(
    client.chat.completions.create({
      model: getModel("SEO_WRITING_MODEL", "gpt-4o"),
      max_tokens: 8192,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "You are revising a dermatology content draft to satisfy strict SEO and quality requirements. Return only markdown body content.",
        },
        {
          role: "user",
          content: `Revise the following draft so it passes the listed quality gates.

## Primary Keyword
${keyword}

## Quality Issues To Fix
${issues.map((issue) => `- ${issue}`).join("\n")}

## Research Dossier
${dossier}

## Draft To Revise
${originalDraft}

## Requirements
- Preserve the topic and evidence-first tone
- The exact primary keyword must appear verbatim in the first paragraph
- Expand the article substantially if it is too short
- Target approximately ${targetWordCount} words and do not stop early
- Keep markdown formatting with clear H2/H3 structure
- Include a "consult a dermatologist" disclaimer where appropriate
- Do not include frontmatter, notes, or explanations

Return only the improved markdown article body.`,
        },
      ],
    }),
    `revision request for "${keyword}"`
  );

  const text = completion.choices?.[0]?.message?.content?.trim() || "";
  if (!text) {
    throw new Error(`AI returned empty revised draft for keyword "${keyword}".`);
  }
  return text;
}

export async function aiExpandDraft(
  currentDraft: string,
  dossier: string,
  keyword: string,
  targetWordCount: number
): Promise<string> {
  requireOpenAIKey();

  const completion = await withAiTimeout(
    client.chat.completions.create({
      model: getModel("SEO_WRITING_MODEL", "gpt-4o"),
      max_tokens: 8192,
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "You are extending a dermatology article draft. Return only new markdown sections to append, not the full article.",
        },
        {
          role: "user",
          content: `Add substantial new markdown sections to the draft below so the overall article reaches approximately ${targetWordCount} words.

## Primary Keyword
${keyword}

## Research Dossier
${dossier}

## Current Draft
${currentDraft}

## Requirements
- Return only new sections to append
- Add non-repetitive H2/H3 sections with useful detail
- Keep the same evidence-first tone
- Add practical guidance, nuance, and pregnancy-safe considerations when relevant
- Include a "consult a dermatologist" disclaimer if the topic warrants it
- Do not include frontmatter, summaries, or editor notes

Return only the additional markdown content.`,
        },
      ],
    }),
    `expansion request for "${keyword}"`
  );

  const text = completion.choices?.[0]?.message?.content?.trim() || "";
  if (!text) {
    throw new Error(`AI returned empty expansion draft for keyword "${keyword}".`);
  }
  return text;
}
