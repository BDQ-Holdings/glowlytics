import { newPage } from "./browser.js";

export interface ExtractedContent {
  title: string;
  url: string;
  headings: string[];
  bodyText: string;
  wordCount: number;
}

export async function extractContent(url: string): Promise<ExtractedContent | null> {
  const page = await newPage();

  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 15000 });

    const data = await page.evaluate(() => {
      // Remove non-content elements
      const remove = "nav, footer, header, script, style, noscript, iframe, .ad, .ads, .sidebar, .comments, [role='navigation'], [role='banner'], [role='contentinfo']";
      document.querySelectorAll(remove).forEach((el) => el.remove());

      const title =
        document.querySelector("h1")?.textContent?.trim() ||
        document.title?.trim() ||
        "";

      const headings: string[] = [];
      document.querySelectorAll("h1, h2, h3").forEach((el) => {
        const text = el.textContent?.trim();
        if (text) headings.push(text);
      });

      // Find main content area
      const mainSelectors = [
        "article",
        "main",
        "[role='main']",
        ".post-content",
        ".article-body",
        ".entry-content",
        ".content",
        "#content",
      ];
      let bodyText = "";
      for (const sel of mainSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          bodyText = el.textContent?.trim() || "";
          break;
        }
      }
      if (!bodyText) {
        bodyText = document.body?.textContent?.trim() || "";
      }

      // Normalize whitespace
      bodyText = bodyText.replace(/\s+/g, " ").trim();

      return { title, headings, bodyText };
    });

    return {
      title: data.title,
      url,
      headings: data.headings,
      bodyText: data.bodyText.slice(0, 15000),
      wordCount: data.bodyText.split(/\s+/).length,
    };
  } catch {
    return null;
  } finally {
    await page.close();
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
