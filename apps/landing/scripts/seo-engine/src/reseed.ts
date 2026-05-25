/**
 * seo:reseed — ingest a Google Search Console CSV export and append
 * promising queries to `data/seeds.json`.
 *
 * Why
 * ---
 * The engine has been running off a static seed list (~30 keywords) curated
 * by hand. Without feedback, discovery plateaus once those seeds are
 * exhausted. Search Console knows which queries we're *already* ranking for
 * but not winning yet — that's the highest-signal seed list available.
 *
 * Usage
 * -----
 *   1. Sign in to Search Console for the `glowlytics.ai` property.
 *   2. Performance → Queries → Export → "Download CSV". Unzip the `.csv`.
 *   3. Run:
 *
 *        SEO_RESEED_CSV=~/Downloads/Queries.csv \
 *        npm --prefix apps/landing run seo:reseed
 *
 *   4. Inspect the diff to `apps/landing/data/seeds.json` and commit.
 *
 * Filtering criteria (all configurable via env):
 *   SEO_RESEED_MIN_IMPRESSIONS   default 100   — meaningful demand
 *   SEO_RESEED_MIN_POSITION      default 8     — ranking but not winning
 *   SEO_RESEED_MAX_POSITION      default 50    — within striking distance
 *   SEO_RESEED_MIN_CTR_DROP      default 0.5   — CTR < 0.5% on first-page hits
 *   SEO_RESEED_DRY_RUN           default unset — print, don't write
 */
import "./lib/env.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { isAllowedKeyword, normalizeKeyword } from "./lib/keyword-filter.js";
import type { KeywordCluster } from "./lib/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../../data");
const SEEDS_PATH = path.join(DATA_DIR, "seeds.json");
const KEYWORDS_PATH = path.join(DATA_DIR, "keywords.json");

interface GscRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/** Minimal CSV parser tuned for Search Console exports (RFC-4180 quoted). */
export function parseCsv(raw: string): string[][] {
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inQuotes) {
      if (ch === '"' && raw[i + 1] === '"') {
        cell += '"';
        i++;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        continue;
      }
      cell += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && raw[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      cell = "";
      row = [];
      continue;
    }
    cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim().length > 0));
}

export function parseGscCsv(filePath: string): GscRow[] {
  const raw = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
  const cells = parseCsv(raw);
  if (cells.length === 0) return [];

  const header = cells[0].map((c) => c.trim().toLowerCase());
  const queryIdx = header.findIndex((h) => h.includes("quer"));
  const clicksIdx = header.findIndex((h) => h.includes("click"));
  const imprIdx = header.findIndex((h) => h.includes("impress"));
  const ctrIdx = header.findIndex((h) => h.includes("ctr"));
  const posIdx = header.findIndex((h) => h.includes("position"));

  if (queryIdx < 0) {
    throw new Error(`Could not find "Top queries" column in CSV. Headers: ${header.join(", ")}`);
  }

  const out: GscRow[] = [];
  for (let i = 1; i < cells.length; i++) {
    const r = cells[i];
    const query = (r[queryIdx] || "").trim();
    if (!query) continue;
    out.push({
      query,
      clicks: parseNumeric(r[clicksIdx]) ?? 0,
      impressions: parseNumeric(r[imprIdx]) ?? 0,
      ctr: parsePercent(r[ctrIdx]) ?? 0,
      position: parseNumeric(r[posIdx]) ?? 100,
    });
  }
  return out;
}

function parseNumeric(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const cleaned = value.replace(/[,%\s]/g, "");
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function parsePercent(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const cleaned = trimmed.replace(/[,\s]/g, "");
  const hasPercent = cleaned.endsWith("%");
  const n = Number(cleaned.replace(/%/g, ""));
  if (!Number.isFinite(n)) return undefined;
  return hasPercent ? n : n * 100; // GSC CSVs sometimes export 0.012 vs 1.2%.
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function envInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function envFloat(name: string, fallback: number): number {
  const parsed = Number.parseFloat(process.env[name] || "");
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function main(): void {
  console.log("=== SEO Engine: Search Console Reseed ===\n");

  const csvPath = process.env.SEO_RESEED_CSV?.trim() || process.argv[2]?.trim();
  if (!csvPath) {
    console.error("Set SEO_RESEED_CSV=<path-to-gsc-export.csv> or pass the path as arg 1.");
    console.error("Export from https://search.google.com/search-console → Performance → Queries → Download CSV.");
    process.exitCode = 1;
    return;
  }

  const absPath = path.isAbsolute(csvPath) ? csvPath : path.resolve(process.cwd(), csvPath);
  if (!fs.existsSync(absPath)) {
    console.error(`CSV not found at ${absPath}`);
    process.exitCode = 1;
    return;
  }

  const minImpressions = envInt("SEO_RESEED_MIN_IMPRESSIONS", 100);
  const minPosition = envFloat("SEO_RESEED_MIN_POSITION", 8);
  const maxPosition = envFloat("SEO_RESEED_MAX_POSITION", 50);
  const minCtrDrop = envFloat("SEO_RESEED_MIN_CTR_DROP", 0.5);
  const dryRun = process.env.SEO_RESEED_DRY_RUN === "1";

  console.log(`Reading ${absPath}`);
  const rows = parseGscCsv(absPath);
  console.log(`Loaded ${rows.length} GSC query rows.\n`);

  const seeds = readJson<string[]>(SEEDS_PATH);
  const seedSet = new Set(seeds.map((s) => normalizeKeyword(s)));
  const clusters = fs.existsSync(KEYWORDS_PATH) ? readJson<KeywordCluster[]>(KEYWORDS_PATH) : [];
  const knownKeywordSet = new Set<string>();
  for (const cluster of clusters) {
    knownKeywordSet.add(normalizeKeyword(cluster.primaryKeyword));
    for (const rel of cluster.relatedKeywords) {
      knownKeywordSet.add(normalizeKeyword(rel));
    }
  }

  type Candidate = { query: string; row: GscRow; reason: string };
  const candidates: Candidate[] = [];

  for (const row of rows) {
    const normalized = normalizeKeyword(row.query);
    if (!normalized) continue;
    if (!isAllowedKeyword(normalized)) continue;
    if (seedSet.has(normalized) || knownKeywordSet.has(normalized)) continue;

    // High-value reasons to reseed (any one is enough):
    // - We're ranking close to page 1 but not winning (room to grow).
    // - We're already on page 1 but CTR is poor (title/dek can improve).
    // - Lots of impressions with no clicks (we're showing but not chosen).
    const reasons: string[] = [];
    if (row.position >= minPosition && row.position <= maxPosition && row.impressions >= minImpressions) {
      reasons.push(`pos ${row.position.toFixed(1)} · ${row.impressions} impr`);
    }
    if (row.position < minPosition && row.impressions >= minImpressions * 2 && row.ctr < minCtrDrop) {
      reasons.push(`page-1 underclick (ctr ${row.ctr.toFixed(2)}%)`);
    }
    if (row.impressions >= minImpressions * 5 && row.clicks === 0) {
      reasons.push(`${row.impressions} impr · 0 clicks`);
    }

    if (reasons.length > 0) {
      candidates.push({ query: normalized, row, reason: reasons.join("; ") });
    }
  }

  // Order: highest impressions first, ties broken by best (lowest) position.
  candidates.sort((a, b) => {
    if (b.row.impressions !== a.row.impressions) return b.row.impressions - a.row.impressions;
    return a.row.position - b.row.position;
  });

  // Dedupe within the new candidate list.
  const seen = new Set<string>();
  const fresh = candidates.filter((c) => {
    if (seen.has(c.query)) return false;
    seen.add(c.query);
    return true;
  });

  console.log(`Eligible new seed candidates: ${fresh.length}\n`);
  for (const c of fresh.slice(0, 30)) {
    console.log(`  ${c.query.padEnd(55)} ${c.reason}`);
  }
  if (fresh.length > 30) {
    console.log(`  …and ${fresh.length - 30} more`);
  }

  if (dryRun) {
    console.log("\nSEO_RESEED_DRY_RUN=1 — not modifying seeds.json.");
    return;
  }
  if (fresh.length === 0) {
    console.log("\nNothing to add.");
    return;
  }

  const updatedSeeds = [...seeds, ...fresh.map((c) => c.query)];
  fs.writeFileSync(SEEDS_PATH, `${JSON.stringify(updatedSeeds, null, 2)}\n`);
  console.log(`\nAdded ${fresh.length} new seeds to ${SEEDS_PATH}.`);
  console.log("Run `npm run seo:discover` next to cluster them.");
}

const isEntryPoint =
  !!process.argv[1] && import.meta.url === new URL(process.argv[1], "file://").href;

if (isEntryPoint) {
  try {
    main();
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  }
}
