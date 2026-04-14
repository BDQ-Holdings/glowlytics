import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getAutocompleteSuggestions } from "./lib/autocomplete.js";
import { scrapeSERP } from "./lib/serp.js";
import { closeBrowser } from "./lib/browser.js";
import { clusterKeywords } from "./lib/clustering.js";
import type { KeywordCluster } from "./lib/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../../data");
const SEEDS_PATH = path.join(DATA_DIR, "seeds.json");
const KEYWORDS_PATH = path.join(DATA_DIR, "keywords.json");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("=== SEO Engine: Keyword Discovery ===\n");

  const seeds: string[] = JSON.parse(fs.readFileSync(SEEDS_PATH, "utf-8"));
  console.log(`Loaded ${seeds.length} seed keywords.\n`);

  const existing: KeywordCluster[] = JSON.parse(fs.readFileSync(KEYWORDS_PATH, "utf-8"));
  const existingSlugs = new Set(existing.map((c) => c.slug));
  console.log(`Found ${existing.length} existing clusters.\n`);

  const allSuggestions: string[] = [];
  const paaMap = new Map<string, string[]>();

  for (const seed of seeds) {
    console.log(`\n--- Processing seed: "${seed}" ---`);

    console.log("  Fetching autocomplete suggestions...");
    const suggestions = await getAutocompleteSuggestions(seed);
    console.log(`  Found ${suggestions.length} suggestions.`);
    allSuggestions.push(...suggestions);

    console.log("  Scraping SERP...");
    await sleep(1500);
    const serpData = await scrapeSERP(seed);
    console.log(`  Found ${serpData.paaQuestions.length} PAA questions, ${serpData.relatedSearches.length} related searches.`);

    paaMap.set(seed, serpData.paaQuestions);
    allSuggestions.push(...serpData.relatedSearches);
    allSuggestions.push(...serpData.paaQuestions);

    await sleep(1000);
  }

  const uniqueSuggestions = [...new Set(allSuggestions.map((s) => s.toLowerCase().trim()))];
  console.log(`\n\nTotal unique suggestions: ${uniqueSuggestions.length}`);

  console.log("Clustering keywords...");
  const newClusters = clusterKeywords(uniqueSuggestions, paaMap);
  console.log(`Created ${newClusters.length} clusters.`);

  const merged: KeywordCluster[] = [...existing];
  let addedCount = 0;
  for (const cluster of newClusters) {
    if (!existingSlugs.has(cluster.slug)) {
      merged.push(cluster);
      addedCount++;
    }
  }

  console.log(`\nAdded ${addedCount} new clusters. Total: ${merged.length}`);

  fs.writeFileSync(KEYWORDS_PATH, JSON.stringify(merged, null, 2));
  console.log(`\nSaved to ${KEYWORDS_PATH}`);

  await closeBrowser();
  console.log("Done!");
}

main().catch(console.error);
