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

export function clusterKeywords(
  keywords: string[],
  paaMap: Map<string, string[]>,
  similarityThreshold: number = 0.45
): KeywordCluster[] {
  const clusters: KeywordCluster[] = [];
  const assigned = new Set<string>();

  const sorted = [...keywords].sort((a, b) => b.length - a.length);

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

    const paaQuestions = paaMap.get(keyword) || [];
    const allPaa = [
      ...paaQuestions,
      ...related.flatMap((r) => paaMap.get(r) || []),
    ];
    const uniquePaa = [...new Set(allPaa)];

    const slug = slugify(keyword);
    const opportunityScore = 1 + related.length + uniquePaa.length * 0.5;

    clusters.push({
      slug,
      primaryKeyword: keyword,
      relatedKeywords: related,
      contentType: classifyContentType(keyword, uniquePaa),
      intent: classifyIntent(keyword),
      opportunityScore,
      paaQuestions: uniquePaa,
      status: "new",
    });
  }

  return clusters.sort((a, b) => b.opportunityScore - a.opportunityScore);
}
