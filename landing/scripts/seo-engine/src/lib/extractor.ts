import * as cheerio from "cheerio";

export interface ExtractedContent {
  title: string;
  url: string;
  headings: string[];
  bodyText: string;
  wordCount: number;
}

export async function extractContent(url: string): Promise<ExtractedContent | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    $("nav, footer, header, script, style, noscript, iframe, .ad, .ads, .sidebar, .comments").remove();

    const title = $("h1").first().text().trim() || $("title").text().trim();

    const headings: string[] = [];
    $("h1, h2, h3").each((_, el) => {
      const text = $(el).text().trim();
      if (text) headings.push(text);
    });

    const mainSelectors = ["article", "main", "[role='main']", ".post-content", ".article-body", ".entry-content"];
    let bodyText = "";
    for (const sel of mainSelectors) {
      const el = $(sel).first();
      if (el.length) {
        bodyText = el.text().trim();
        break;
      }
    }
    if (!bodyText) {
      bodyText = $("body").text().trim();
    }

    bodyText = bodyText.replace(/\s+/g, " ").trim();

    return {
      title,
      url,
      headings,
      bodyText: bodyText.slice(0, 15000),
      wordCount: bodyText.split(/\s+/).length,
    };
  } catch {
    return null;
  }
}

export async function extractMultiple(
  urls: string[],
  delayMs: number = 1000
): Promise<ExtractedContent[]> {
  const results: ExtractedContent[] = [];
  for (const url of urls.slice(0, 5)) {
    console.log(`  Extracting: ${url}`);
    const content = await extractContent(url);
    if (content) results.push(content);
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return results;
}
