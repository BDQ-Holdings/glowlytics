import { filterKeywords, normalizeKeyword } from "./keyword-filter.js";
import { embedTexts } from "./embeddings.js";
import type { ContentType, SearchIntent, KeywordCluster } from "./types.js";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) matrix[i] = [i];
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

function normalizedSimilarity(a: string, b: string): number {
  const aNorm = a.toLowerCase().trim();
  const bNorm = b.toLowerCase().trim();
  const maxLen = Math.max(aNorm.length, bNorm.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(aNorm, bNorm) / maxLen;
}

function wordOverlap(a: string, b: string): number {
  const aWords = new Set(a.toLowerCase().split(/\s+/));
  const bWords = new Set(b.toLowerCase().split(/\s+/));
  let overlap = 0;
  for (const w of aWords) {
    if (bWords.has(w)) overlap++;
  }
  return overlap / Math.max(aWords.size, bWords.size);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aMag += a[i] * a[i];
    bMag += b[i] * b[i];
  }
  const denom = Math.sqrt(aMag) * Math.sqrt(bMag);
  return denom === 0 ? 0 : dot / denom;
}

function classifyIntent(keyword: string): SearchIntent {
  const lower = keyword.toLowerCase();
  if (lower.match(/\b(buy|best|top|review|price|cheap|vs)\b/)) return "transactional";
  if (lower.match(/\b(what|why|how|does|can|is|are|when|should)\b/)) return "informational";
  return "informational";
}

function classifyContentType(keyword: string, paaQuestions: string[]): ContentType {
  const lower = keyword.toLowerCase();
  if (lower.match(/\b(what is|what are|define|meaning|definition)\b/)) return "glossary";
  if (lower.match(/\b(how to|routine|steps|guide|tutorial)\b/)) return "guide";
  if (paaQuestions.length >= 3) return "faq";
  return "blog";
}

function keywordFitness(keyword: string, paaMap: PaaLookup): number {
  const lower = keyword.toLowerCase();
  const wordCount = lower.split(/\s+/).length;
  const paaCount = paaMap.lookupForKeyword(keyword).length;

  let score = 0;
  score += Math.max(0, 12 - Math.abs(wordCount - 4) * 2);
  score += Math.min(paaCount, 4) * 4;

  if (/^(how|what|why|can|does|is|are|when|should)\b/.test(lower)) score += 3;
  if (/\b(causes|treatment|routine|guide|symptoms|benefits|meaning|definition)\b/.test(lower)) score += 2;
  if (/\b(best|top|review|cheap|price)\b/.test(lower)) score -= 3;

  score -= lower.length * 0.02;

  return score;
}

function pickPrimaryKeyword(clusterKeywords: string[], paaMap: PaaLookup): string {
  return [...clusterKeywords].sort((a, b) => keywordFitness(b, paaMap) - keywordFitness(a, paaMap))[0];
}

/**
 * PaaLookup wraps the seed-keyed `paaMap` collected in discovery and exposes
 * a substring-aware lookup. The discover stage only fetches PAA for seeds, so
 * every other keyword in the universe used to get an empty array even though
 * its seed had a rich PAA list. Now we walk every seed whose token appears in
 * the keyword (and vice versa) and union their PAAs.
 */
export class PaaLookup {
  private readonly seeds: { seed: string; paa: string[] }[];

  constructor(paaMap: Map<string, string[]>) {
    this.seeds = [...paaMap.entries()]
      .map(([seed, paa]) => ({ seed: normalizeKeyword(seed), paa }))
      .filter((entry) => entry.seed && entry.paa.length > 0);
  }

  lookupForKeyword(keyword: string): string[] {
    const norm = normalizeKeyword(keyword);
    if (!norm) return [];

    const out = new Set<string>();
    for (const { seed, paa } of this.seeds) {
      if (norm === seed || norm.includes(seed) || seed.includes(norm)) {
        for (const q of paa) out.add(q);
      }
    }
    return [...out];
  }
}

interface ClusteringOptions {
  similarityThreshold?: number;
  /** Cosine similarity threshold for embedding-based merge (0–1, default 0.78). */
  embeddingThreshold?: number;
  /** Set `false` to skip the OpenAI embedding pass entirely. */
  useEmbeddings?: boolean;
}

export async function clusterKeywords(
  keywords: string[],
  paaMap: Map<string, string[]>,
  options: ClusteringOptions = {}
): Promise<KeywordCluster[]> {
  const {
    similarityThreshold = 0.45,
    embeddingThreshold = 0.78,
    useEmbeddings = process.env.SEO_DISABLE_EMBEDDINGS !== "1",
  } = options;

  const paaLookup = new PaaLookup(paaMap);

  // Pass 1: lexical clustering (fast, catches near-duplicates).
  const lexicalClusters = lexicalCluster(keywords, similarityThreshold);

  // Pass 2: optional semantic merge using OpenAI embeddings on cluster heads.
  // Merges synonyms ("vitamin c serum" ↔ "ascorbic acid") that lexical metrics
  // can't see. Skipped when no API key, or when SEO_DISABLE_EMBEDDINGS=1.
  let mergedClusters = lexicalClusters;
  if (useEmbeddings && lexicalClusters.length > 1 && process.env.OPENAI_API_KEY) {
    try {
      const heads = lexicalClusters.map((c) => c[0]);
      const vectors = await embedTexts(heads);
      mergedClusters = semanticMerge(lexicalClusters, vectors, embeddingThreshold);
    } catch (err) {
      console.warn(`[clustering] Embedding pass failed, keeping lexical clusters: ${(err as Error).message}`);
    }
  }

  return mergedClusters.map((clusterKeywords) => {
    const primaryKeyword = pickPrimaryKeyword(clusterKeywords, paaLookup);
    const relatedKeywords = clusterKeywords.filter((item) => item !== primaryKeyword).slice(0, 30);

    const allPaa = paaLookup.lookupForKeyword(primaryKeyword);
    for (const rel of relatedKeywords) {
      for (const q of paaLookup.lookupForKeyword(rel)) {
        allPaa.push(q);
      }
    }
    const uniquePaa = [...new Set(allPaa)];

    const slug = slugify(primaryKeyword);
    const opportunityScore = 1 + Math.min(relatedKeywords.length, 30) + uniquePaa.length * 2;

    return {
      slug,
      primaryKeyword,
      relatedKeywords,
      contentType: classifyContentType(primaryKeyword, uniquePaa),
      intent: classifyIntent(primaryKeyword),
      opportunityScore,
      paaQuestions: uniquePaa,
      status: "new",
    } satisfies KeywordCluster;
  }).sort((a, b) => b.opportunityScore - a.opportunityScore);
}

function lexicalCluster(keywords: string[], similarityThreshold: number): string[][] {
  const clusters: string[][] = [];
  const assigned = new Set<string>();
  const sorted = filterKeywords(keywords).sort((a, b) => b.length - a.length);

  for (const keyword of sorted) {
    if (assigned.has(keyword)) continue;

    const related: string[] = [];
    for (const other of sorted) {
      if (other === keyword || assigned.has(other)) continue;
      const sim = Math.max(normalizedSimilarity(keyword, other), wordOverlap(keyword, other));
      if (sim >= similarityThreshold) {
        related.push(other);
        assigned.add(other);
      }
    }

    assigned.add(keyword);
    clusters.push([keyword, ...related]);
  }

  return clusters;
}

function semanticMerge(
  lexicalClusters: string[][],
  vectors: number[][],
  threshold: number
): string[][] {
  if (vectors.length !== lexicalClusters.length) {
    return lexicalClusters;
  }

  const parent: number[] = lexicalClusters.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      if (cosine(vectors[i], vectors[j]) >= threshold) union(i, j);
    }
  }

  const buckets = new Map<number, string[]>();
  for (let i = 0; i < lexicalClusters.length; i++) {
    const root = find(i);
    const bucket = buckets.get(root) || [];
    bucket.push(...lexicalClusters[i]);
    buckets.set(root, bucket);
  }
  return [...buckets.values()].map((words) => [...new Set(words)]);
}
