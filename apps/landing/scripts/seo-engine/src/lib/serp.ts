import { newPage, closeBrowser } from "./browser.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SerpData {
  organicResults: { title: string; url: string; description: string }[];
  paaQuestions: string[];
  relatedSearches: string[];
}

export async function scrapeSERP(query: string): Promise<SerpData> {
  const page = await newPage();

  try {
    const encoded = encodeURIComponent(query);
    const url = `https://www.google.com/search?q=${encoded}&hl=en&gl=us`;

    await page.goto(url, { waitUntil: "networkidle2", timeout: 15000 });

    // Wait for organic results to render
    await page.waitForSelector("div.g, div#search", { timeout: 5000 }).catch(() => {});

    // Expand People Also Ask by clicking the first few if they exist
    const paaButtons = await page.$$("div.related-question-pair, div[data-q], div[jsname] div[role='button']");
    for (const btn of paaButtons.slice(0, 4)) {
      try {
        await btn.click();
        await sleep(300);
      } catch {
        // Some may not be clickable
      }
    }

    const data = await page.evaluate(() => {
      // Organic results
      const organicResults: { title: string; url: string; description: string }[] = [];
      document.querySelectorAll("div.g").forEach((el) => {
        const titleEl = el.querySelector("h3");
        const linkEl = el.querySelector("a");
        const descEl = el.querySelector("[data-sncf], .VwiC3b, .s3v9rd, span.st");
        const title = titleEl?.textContent?.trim() || "";
        const url = linkEl?.getAttribute("href") || "";
        const description = descEl?.textContent?.trim() || "";
        if (title && url.startsWith("http")) {
          organicResults.push({ title, url, description });
        }
      });

      // People Also Ask
      const paaQuestions: string[] = [];
      document.querySelectorAll("div[data-q]").forEach((el) => {
        const q = el.getAttribute("data-q");
        if (q) paaQuestions.push(q);
      });
      // Fallback: grab visible question text from PAA section
      document.querySelectorAll("div.related-question-pair span, span.CSkcDe").forEach((el) => {
        const text = el.textContent?.trim();
        if (text && text.endsWith("?") && !paaQuestions.includes(text)) {
          paaQuestions.push(text);
        }
      });

      // Related searches
      const relatedSearches: string[] = [];
      document.querySelectorAll("div.s75CSd a, a.k8XOCe, div.AJLUJb a").forEach((el) => {
        const text = el.textContent?.trim();
        if (text) relatedSearches.push(text);
      });

      return {
        organicResults: organicResults.slice(0, 10),
        paaQuestions,
        relatedSearches,
      };
    });

    return data;
  } catch (err) {
    console.warn(`SERP scrape error for "${query}":`, err);
    return { organicResults: [], paaQuestions: [], relatedSearches: [] };
  } finally {
    await page.close();
  }
}

export async function batchScrapeSERP(
  queries: string[],
  delayMs: number = 2000
): Promise<Map<string, SerpData>> {
  const results = new Map<string, SerpData>();
  for (const query of queries) {
    console.log(`  Scraping SERP: "${query}"`);
    const data = await scrapeSERP(query);
    results.set(query, data);
    await sleep(delayMs);
  }
  await closeBrowser();
  return results;
}
