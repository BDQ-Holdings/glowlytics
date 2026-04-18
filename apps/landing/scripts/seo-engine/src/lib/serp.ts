/**
 * SERP data via SerpAPI.
 *
 * Returns structured JSON (organic results, PAA, related searches)
 * with no scraping or CAPTCHA issues.
 *
 * Set SERPAPI_KEY in your environment.
 * https://serpapi.com
 */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SerpData {
  organicResults: { title: string; url: string; description: string }[];
  paaQuestions: string[];
  relatedSearches: string[];
}

const SERPAPI_KEY = process.env.SERPAPI_KEY;

export async function scrapeSERP(query: string): Promise<SerpData> {
  if (!SERPAPI_KEY) {
    console.error("  SERPAPI_KEY not set. Set it in your environment.");
    return { organicResults: [], paaQuestions: [], relatedSearches: [] };
  }

  try {
    const params = new URLSearchParams({
      q: query,
      engine: "google",
      gl: "us",
      hl: "en",
      num: "10",
      api_key: SERPAPI_KEY,
    });

    const res = await fetch(`https://serpapi.com/search.json?${params}`);

    if (!res.ok) {
      console.warn(`  SerpAPI error for "${query}": ${res.status} ${res.statusText}`);
      return { organicResults: [], paaQuestions: [], relatedSearches: [] };
    }

    const data = await res.json();

    // Organic results
    const organicResults = (data.organic_results || []).slice(0, 10).map((r: any) => ({
      title: r.title || "",
      url: r.link || "",
      description: r.snippet || "",
    }));

    // People Also Ask
    const paaQuestions = (data.related_questions || [])
      .map((p: any) => p.question || "")
      .filter(Boolean);

    // Related searches
    const relatedSearches = (data.related_searches || [])
      .map((r: any) => r.query || "")
      .filter(Boolean);

    return { organicResults, paaQuestions, relatedSearches };
  } catch (err) {
    console.warn(`  SERP fetch error for "${query}":`, err);
    return { organicResults: [], paaQuestions: [], relatedSearches: [] };
  }
}

export async function batchScrapeSERP(
  queries: string[],
  delayMs: number = 500
): Promise<Map<string, SerpData>> {
  const results = new Map<string, SerpData>();
  for (const query of queries) {
    console.log(`  Scraping SERP: "${query}"`);
    const data = await scrapeSERP(query);
    results.set(query, data);
    await sleep(delayMs);
  }
  return results;
}
