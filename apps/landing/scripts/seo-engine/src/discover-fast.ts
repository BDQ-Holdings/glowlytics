import "./lib/env.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { filterKeywords } from "./lib/keyword-filter.js";
import { clusterKeywords } from "./lib/clustering.js";
import type { KeywordCluster } from "./lib/types.js";

/**
 * Fast, SerpAPI-free discovery.
 *
 * Identical cluster output to `discover.ts` (reuses filterKeywords +
 * clusterKeywords), but harvests Google autocomplete with bounded concurrency
 * instead of the serial per-letter crawl, and skips the SERP/PAA step entirely.
 * Used when the SerpAPI quota is exhausted but we still want to expand a niche
 * from autocomplete signal alone. PAA enrichment can be backfilled later via
 * `seo:research` once SERP credits are available.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../../data");
const SEEDS_PATH = path.join(DATA_DIR, "seeds.json");
const KEYWORDS_PATH = path.join(DATA_DIR, "keywords.json");

const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function fetchSuggestions(query: string): Promise<string[]> {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data) && Array.isArray(data[1])) {
      return data[1].filter((s: unknown): s is string => typeof s === "string");
    }
    return [];
  } catch {
    return [];
  }
}

async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function main() {
  console.log("=== SEO Engine: Fast Discovery (autocomplete-only) ===\n");

  const seeds: string[] = JSON.parse(fs.readFileSync(SEEDS_PATH, "utf-8"));
  console.log(`Loaded ${seeds.length} seed keywords.`);

  const existing: KeywordCluster[] = JSON.parse(fs.readFileSync(KEYWORDS_PATH, "utf-8"));
  const existingSlugs = new Set(existing.map((c) => c.slug));
  console.log(`Found ${existing.length} existing clusters.\n`);

  const queries: string[] = [];
  for (const seed of seeds) {
    queries.push(seed);
    for (const letter of ALPHABET) queries.push(`${seed} ${letter}`);
  }
  console.log(`Fetching ${queries.length} autocomplete queries (concurrency 12)...`);

  const results = await pool(queries, 12, fetchSuggestions);
  const allSuggestions: string[] = [...seeds];
  for (const r of results) allSuggestions.push(...r);
  console.log(`Collected ${allSuggestions.length} raw suggestions.`);

  const unique = filterKeywords(allSuggestions);
  console.log(`Usable unique suggestions: ${unique.length}`);

  console.log("Clustering (lexical + semantic embeddings)...");
  const newClusters = await clusterKeywords(unique, new Map<string, string[]>());
  console.log(`Created ${newClusters.length} clusters.`);

  const merged: KeywordCluster[] = [...existing];
  const newlyAdded: KeywordCluster[] = [];
  for (const cluster of newClusters) {
    if (!existingSlugs.has(cluster.slug)) {
      merged.push(cluster);
      newlyAdded.push(cluster);
      existingSlugs.add(cluster.slug);
    }
  }
  console.log(`\nAdded ${newlyAdded.length} NEW clusters. Total: ${merged.length}`);

  fs.writeFileSync(KEYWORDS_PATH, JSON.stringify(merged, null, 2));
  console.log(`Saved to ${KEYWORDS_PATH}`);

  console.log("\nTop 25 new clusters by opportunityScore:");
  for (const c of newlyAdded.slice(0, 25)) {
    console.log(`  ${String(c.opportunityScore).padStart(3)}  [${c.contentType}]  ${c.slug}  (${c.relatedKeywords.length} related)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
