import puppeteer, { type Browser, type Page } from "puppeteer";

let _browser: Browser | null = null;

/**
 * Get or launch a shared headless Chromium instance.
 * Reused across scraping calls to avoid cold-start overhead.
 */
export async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.connected) return _browser;

  _browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--window-size=1280,800",
    ],
  });

  return _browser;
}

/**
 * Open a new page with realistic browser fingerprint.
 */
export async function newPage(): Promise<Page> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
  );
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-US,en;q=0.9",
  });

  return page;
}

/**
 * Close the shared browser. Call when the pipeline is done.
 */
export async function closeBrowser(): Promise<void> {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}
