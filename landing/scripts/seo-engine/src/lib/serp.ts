import * as cheerio from "cheerio";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SerpData {
  organicResults: { title: string; url: string; description: string }[];
  paaQuestions: string[];
  relatedSearches: string[];
}

export async function scrapeSERP(query: string): Promise<SerpData> {
  const encoded = encodeURIComponent(query);
  const url = `https://www.google.com/search?q=${encoded}&hl=en&gl=us`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) {
      console.warn(`SERP fetch failed for "${query}": ${res.status}`);
      return { organicResults: [], paaQuestions: [], relatedSearches: [] };
    }

    const html = await res.text();
    return parseSERP(html);
  } catch (err) {
    console.warn(`SERP fetch error for "${query}":`, err);
    return { organicResults: [], paaQuestions: [], relatedSearches: [] };
  }
}

function parseSERP(html: string): SerpData {
  const $ = cheerio.load(html);

  const organicResults: SerpData["organicResults"] = [];
  $("div.g").each((_, el) => {
    const title = $(el).find("h3").first().text().trim();
    const url = $(el).find("a").first().attr("href") || "";
    const description = $(el).find(".VwiC3b, .s3v9rd").first().text().trim();
    if (title && url.startsWith("http")) {
      organicResults.push({ title, url, description });
    }
  });

  const paaQuestions: string[] = [];
  $("div.related-question-pair, div[data-q]").each((_, el) => {
    const question = $(el).attr("data-q") || $(el).find("span").first().text().trim();
    if (question) paaQuestions.push(question);
  });

  $("div[jsname] span.CSkcDe").each((_, el) => {
    const question = $(el).text().trim();
    if (question && !paaQuestions.includes(question)) {
      paaQuestions.push(question);
    }
  });

  const relatedSearches: string[] = [];
  $("div.s75CSd a, a.k8XOCe").each((_, el) => {
    const text = $(el).text().trim();
    if (text) relatedSearches.push(text);
  });

  return {
    organicResults: organicResults.slice(0, 10),
    paaQuestions,
    relatedSearches,
  };
}

export async function batchScrapeSERP(
  queries: string[],
  delayMs: number = 1500
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
