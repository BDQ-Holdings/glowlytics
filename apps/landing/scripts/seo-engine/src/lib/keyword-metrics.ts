/**
 * Keyword metrics provider — volume / difficulty / CPC for clustered keywords.
 *
 * Why this exists
 * ---------------
 * Before this, every cluster scored on PAA depth + related-keyword count
 * alone, with no idea whether a keyword has 50 or 50 000 monthly searches and
 * no idea whether Mayo Clinic owns the SERP. Picking what to write next was
 * effectively blind.
 *
 * Provider selection
 * ------------------
 * - If `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD` are set, hit DataForSEO Labs.
 * - Otherwise return an empty map and log a hint so the pipeline still runs.
 *
 * Cost
 * ----
 * DataForSEO Labs `keyword_overview/live`: $0.0001 / keyword. A 1 000-keyword
 * discovery run is ~$0.10.
 */
import { getFetchTimeoutMs } from "./pipeline.js";
import type { KeywordMetricsSnapshot } from "./types.js";

const DATAFORSEO_BASE = "https://api.dataforseo.com/v3";
const BATCH_SIZE = 1000; // DataForSEO Labs hard cap.

export interface KeywordMetricsProvider {
  readonly name: string;
  fetchMetrics(keywords: string[]): Promise<Map<string, KeywordMetricsSnapshot>>;
}

class DataForSEOProvider implements KeywordMetricsProvider {
  readonly name = "dataforseo";
  private readonly authHeader: string;
  private readonly languageCode: string;
  private readonly locationCode: number;

  constructor(login: string, password: string) {
    this.authHeader = `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
    this.languageCode = process.env.DATAFORSEO_LANGUAGE_CODE?.trim() || "en";
    this.locationCode = Number.parseInt(process.env.DATAFORSEO_LOCATION_CODE || "2840", 10); // US
  }

  async fetchMetrics(keywords: string[]): Promise<Map<string, KeywordMetricsSnapshot>> {
    const out = new Map<string, KeywordMetricsSnapshot>();
    if (keywords.length === 0) return out;

    const unique = [...new Set(keywords.map((k) => k.trim()).filter(Boolean))];

    for (let i = 0; i < unique.length; i += BATCH_SIZE) {
      const batch = unique.slice(i, i + BATCH_SIZE);
      const fetchedAt = new Date().toISOString();
      const payload = [
        {
          keywords: batch,
          language_code: this.languageCode,
          location_code: this.locationCode,
        },
      ];

      try {
        const res = await fetch(`${DATAFORSEO_BASE}/dataforseo_labs/google/keyword_overview/live`, {
          method: "POST",
          headers: {
            Authorization: this.authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(getFetchTimeoutMs()),
        });

        if (!res.ok) {
          console.warn(`[keyword-metrics] DataForSEO HTTP ${res.status} ${res.statusText}`);
          continue;
        }

        const json = (await res.json()) as DataForSEOLabsResponse;
        const tasks = json.tasks || [];
        for (const task of tasks) {
          for (const result of task.result || []) {
            const items = result.items || [];
            for (const item of items) {
              const kw = (item.keyword || "").toLowerCase();
              if (!kw) continue;
              out.set(kw, {
                provider: this.name,
                fetchedAt,
                searchVolume: numberOr(item.keyword_info?.search_volume),
                competition: numberOr(item.keyword_info?.competition),
                cpc: numberOr(item.keyword_info?.cpc),
                keywordDifficulty: numberOr(item.keyword_properties?.keyword_difficulty),
              });
            }
          }
        }
      } catch (err) {
        console.warn(`[keyword-metrics] DataForSEO request failed: ${(err as Error).message}`);
      }
    }

    return out;
  }
}

class NullProvider implements KeywordMetricsProvider {
  readonly name = "noop";
  async fetchMetrics(): Promise<Map<string, KeywordMetricsSnapshot>> {
    return new Map();
  }
}

let cachedProvider: KeywordMetricsProvider | null = null;

export function getKeywordMetricsProvider(): KeywordMetricsProvider {
  if (cachedProvider) return cachedProvider;

  const login = process.env.DATAFORSEO_LOGIN?.trim();
  const password = process.env.DATAFORSEO_PASSWORD?.trim();
  if (login && password) {
    cachedProvider = new DataForSEOProvider(login, password);
    return cachedProvider;
  }

  console.warn(
    "[keyword-metrics] DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD not set — opportunityScore will fall back to PAA-only weighting."
  );
  cachedProvider = new NullProvider();
  return cachedProvider;
}

/** Recompute opportunityScore using metrics when present, falling back to the
 *  PAA-and-related-count baseline otherwise. The shape is a power-law-ish
 *  blend so we don't trivially crown commercial juggernauts. */
export function computeOpportunityScore(input: {
  relatedKeywordCount: number;
  paaQuestionCount: number;
  metrics?: KeywordMetricsSnapshot;
}): number {
  const baseline = 1 + Math.min(input.relatedKeywordCount, 30) + input.paaQuestionCount * 2;

  if (!input.metrics) return baseline;

  const volume = input.metrics.searchVolume ?? 0;
  // Difficulty is 0-100 (higher = harder). Treat missing as moderate (50).
  const difficulty = input.metrics.keywordDifficulty ?? 50;
  // Competition is 0-1 from Google Ads. Used as a soft modifier.
  const competition = input.metrics.competition ?? 0;

  // log10 keeps the math sane across 5 orders of magnitude of search volume.
  const volumeScore = volume > 0 ? Math.log10(volume + 1) * 12 : 0;
  // Difficulty penalty: 0 difficulty = no penalty, 100 difficulty = -20 points.
  const difficultyPenalty = (difficulty / 100) * 20;
  // Commercial intent is fine, but heavy commercial competition is not. Soft.
  const competitionPenalty = competition * 4;

  return Math.round((baseline + volumeScore - difficultyPenalty - competitionPenalty) * 100) / 100;
}

function numberOr(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

interface DataForSEOLabsResponse {
  tasks?: Array<{
    result?: Array<{
      items?: Array<{
        keyword?: string;
        keyword_info?: {
          search_volume?: number;
          competition?: number;
          cpc?: number;
        };
        keyword_properties?: {
          keyword_difficulty?: number;
        };
      }>;
    }>;
  }>;
}

/** Reset cached provider for tests. */
export function _resetKeywordMetricsCache(): void {
  cachedProvider = null;
}
