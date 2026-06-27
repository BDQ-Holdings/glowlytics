import "./lib/env.js";

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import matter from "gray-matter";

import type { ContentType } from "./lib/types.js";
import {
  daysAgoUtc,
  fetchSearchAnalytics,
  loadServiceAccount,
  rowsToSlugMap,
  type GscMetrics,
} from "./lib/gsc.js";

/**
 * SEO outcome report.
 *
 * Pulls per-article traffic and conversion data from the Cloudflare D1
 * waitlist database, joins it against the on-disk content store, and prints
 * a scorecard. This is the feedback loop that tells you whether the engine
 * is producing pages that actually earn impressions and sign-ups, vs pages
 * that should be retired or refreshed.
 *
 * Usage:
 *   npm run seo:report               # production D1, human-readable
 *   npm run seo:report -- --local    # local D1 (wrangler dev)
 *   npm run seo:report -- --json     # machine-readable
 *   npm run seo:report -- --since=2026-01-01 --slug=hyperpigmentation-*
 *
 * Requires `wrangler` on PATH (already a Cloudflare Pages dependency).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LANDING_DIR = path.resolve(__dirname, "../../..");
const CONTENT_DIR = path.join(LANDING_DIR, "content");
const D1_NAME = "glowlytics-waitlist";

const CONTENT_TYPES: ContentType[] = ["blog", "faq", "guide", "glossary"];

interface CliArgs {
  local: boolean;
  json: boolean;
  since?: string;
  slugFilter?: string;
  skipGsc: boolean;
  gscDays: number;
}

interface ContentRecord {
  slug: string;
  type: ContentType;
  title: string;
  status: string;
  dateGenerated?: string;
  dateModified?: string;
}

interface SlugTraffic {
  slug: string;
  pageviews: number;
  unique_visitors: number;
  pageviews_7d: number;
  pageviews_30d: number;
  last_view?: string;
}

interface SlugConversion {
  slug: string;
  conversions: number;
}

interface SlugReportRow {
  slug: string;
  type: ContentType;
  title: string;
  status: string;
  age_days: number | null;
  pageviews_all: number;
  pageviews_30d: number;
  pageviews_7d: number;
  unique_visitors: number;
  conversions: number;
  conversion_rate: number;
  last_view: string | null;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  position: number | null;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { local: false, json: false, skipGsc: false, gscDays: 28 };
  for (const arg of argv.slice(2)) {
    if (arg === "--local") out.local = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--no-gsc") out.skipGsc = true;
    else if (arg.startsWith("--gsc-days=")) {
      const n = parseInt(arg.slice("--gsc-days=".length), 10);
      if (Number.isFinite(n) && n > 0 && n <= 480) out.gscDays = n;
    } else if (arg.startsWith("--since=")) out.since = arg.slice("--since=".length);
    else if (arg.startsWith("--slug=")) out.slugFilter = arg.slice("--slug=".length);
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "usage: seo:report [--local] [--json] [--no-gsc] [--gsc-days=N]\n" +
          "                  [--since=YYYY-MM-DD] [--slug=pattern]",
      );
      process.exit(0);
    }
  }
  return out;
}

function loadContentIndex(): Map<string, ContentRecord> {
  const index = new Map<string, ContentRecord>();
  for (const type of CONTENT_TYPES) {
    const dir = path.join(CONTENT_DIR, type);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".mdx")) continue;
      const filePath = path.join(dir, file);
      const { data } = matter(fs.readFileSync(filePath, "utf-8"));
      const slug = String(data.slug || file.replace(/\.mdx$/, ""));
      index.set(slug, {
        slug,
        type,
        title: String(data.title || slug),
        status: String(data.status || "draft"),
        dateGenerated: data.dateGenerated ? String(data.dateGenerated) : undefined,
        dateModified: data.dateModified ? String(data.dateModified) : undefined,
      });
    }
  }
  return index;
}

function runD1<T>(sql: string, args: CliArgs): T[] {
  // wrangler emits a wrapped envelope; we parse and unwrap the `results` array.
  // We invoke wrangler with --json so the output is machine-readable and free
  // of progress noise.
  const flags = [
    "d1",
    "execute",
    D1_NAME,
    args.local ? "--local" : "--remote",
    "--json",
    "--command",
    sql,
  ];
  let raw: string;
  try {
    raw = execFileSync("wrangler", flags, {
      cwd: LANDING_DIR,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (err) {
    const stderr = (err as { stderr?: Buffer | string }).stderr;
    const msg = stderr ? Buffer.from(stderr as Buffer).toString() : (err as Error).message;
    throw new Error(`wrangler d1 execute failed:\n${msg}`);
  }
  // wrangler's JSON output is sometimes preceded by interactive banners on
  // first runs; grab the first '[' through the matching ']' to be robust.
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1) {
    throw new Error(`wrangler returned no JSON envelope:\n${raw}`);
  }
  const parsed = JSON.parse(raw.slice(start, end + 1)) as Array<{
    results?: T[];
    success?: boolean;
    error?: string;
  }>;
  const env = parsed[0];
  if (env && env.success === false && env.error) {
    throw new Error(`d1 error: ${env.error}`);
  }
  return (env && env.results) || [];
}

function tableExists(name: string, args: CliArgs): boolean {
  const rows = runD1<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`,
    args,
  );
  return rows.length > 0;
}

function columnExists(table: string, column: string, args: CliArgs): boolean {
  const rows = runD1<{ name: string }>(`PRAGMA table_info(${table})`, args);
  return rows.some((row) => row.name === column);
}

const SINCE_ARG_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_ARG_RE = /^[a-z0-9*-]+$/i;

/**
 * Validate operator CLI args before they are interpolated into D1 SQL.
 * These run against remote production D1, so a malformed value must fail loud
 * rather than reach the database.
 */
function validateSqlArgs(args: CliArgs): void {
  if (args.since !== undefined && !SINCE_ARG_RE.test(args.since)) {
    throw new Error(`Invalid --since value "${args.since}": expected YYYY-MM-DD`);
  }
  if (args.slugFilter !== undefined && !SLUG_ARG_RE.test(args.slugFilter)) {
    throw new Error(`Invalid --slug value "${args.slugFilter}": expected [a-z0-9*-]+`);
  }
}

function fetchTraffic(args: CliArgs): Map<string, SlugTraffic> {
  validateSqlArgs(args);
  if (!tableExists("pageviews", args)) return new Map();
  const sinceClause = args.since ? `WHERE day >= '${args.since}'` : "";
  const slugClause = args.slugFilter
    ? `${sinceClause ? "AND" : "WHERE"} slug GLOB '${args.slugFilter.replace(/'/g, "")}'`
    : "";
  const sql = `
    SELECT
      slug,
      COUNT(*) AS pageviews,
      COUNT(DISTINCT visitor_hash) AS unique_visitors,
      SUM(CASE WHEN day >= date('now', '-7 day')  THEN 1 ELSE 0 END) AS pageviews_7d,
      SUM(CASE WHEN day >= date('now', '-30 day') THEN 1 ELSE 0 END) AS pageviews_30d,
      MAX(created_at) AS last_view
    FROM pageviews
    ${sinceClause}
    ${slugClause}
    GROUP BY slug
  `;
  const rows = runD1<SlugTraffic>(sql, args);
  return new Map(rows.map((row) => [row.slug, row]));
}

function fetchConversions(args: CliArgs): Map<string, SlugConversion> {
  if (!tableExists("waitlist", args)) return new Map();
  if (!columnExists("waitlist", "attribution_slug", args)) return new Map();
  const sql = `
    SELECT attribution_slug AS slug, COUNT(*) AS conversions
    FROM waitlist
    WHERE attribution_slug IS NOT NULL AND attribution_slug != ''
    GROUP BY attribution_slug
  `;
  const rows = runD1<SlugConversion>(sql, args);
  return new Map(rows.map((row) => [row.slug, row]));
}

function daysSince(dateString?: string): number | null {
  if (!dateString) return null;
  const t = Date.parse(dateString);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function buildRows(
  content: Map<string, ContentRecord>,
  traffic: Map<string, SlugTraffic>,
  conversions: Map<string, SlugConversion>,
  gsc: Map<string, GscMetrics> | null,
): SlugReportRow[] {
  const slugs = new Set<string>([
    ...content.keys(),
    ...traffic.keys(),
    ...conversions.keys(),
    ...(gsc ? gsc.keys() : []),
  ]);
  const rows: SlugReportRow[] = [];
  for (const slug of slugs) {
    const record = content.get(slug);
    const trafficRow = traffic.get(slug);
    const convRow = conversions.get(slug);
    const gscRow = gsc?.get(slug);
    const pageviews = trafficRow?.pageviews ?? 0;
    const conversionsCount = convRow?.conversions ?? 0;
    rows.push({
      slug,
      type: record?.type ?? ("blog" as ContentType),
      title: record?.title ?? slug,
      status: record?.status ?? "(orphaned)",
      age_days: daysSince(record?.dateModified || record?.dateGenerated),
      pageviews_all: pageviews,
      pageviews_30d: trafficRow?.pageviews_30d ?? 0,
      pageviews_7d: trafficRow?.pageviews_7d ?? 0,
      unique_visitors: trafficRow?.unique_visitors ?? 0,
      conversions: conversionsCount,
      conversion_rate: pageviews > 0 ? conversionsCount / pageviews : 0,
      last_view: trafficRow?.last_view ?? null,
      impressions: gscRow ? gscRow.impressions : null,
      clicks: gscRow ? gscRow.clicks : null,
      ctr: gscRow ? gscRow.ctr : null,
      position: gscRow ? gscRow.position : null,
    });
  }
  rows.sort((a, b) => {
    // Prefer the strongest live signal we have: search impressions if GSC is
    // wired, otherwise on-site pageviews. Falls through to all-time pageviews
    // and finally conversions so genuinely interesting rows never sort last.
    const impr = (b.impressions ?? -1) - (a.impressions ?? -1);
    if (impr !== 0) return impr;
    if (b.pageviews_30d !== a.pageviews_30d) return b.pageviews_30d - a.pageviews_30d;
    if (b.pageviews_all !== a.pageviews_all) return b.pageviews_all - a.pageviews_all;
    return b.conversions - a.conversions;
  });
  return rows;
}

function pad(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  return text + " ".repeat(width - text.length);
}

function padNum(num: number, width: number): string {
  return pad(String(num), width);
}

function printHuman(rows: SlugReportRow[], gscWindowDays: number | null): void {
  const totalPv = rows.reduce((a, r) => a + r.pageviews_all, 0);
  const totalPv30 = rows.reduce((a, r) => a + r.pageviews_30d, 0);
  const hasGsc = rows.some((r) => r.impressions != null);
  const totalImpr = rows.reduce((a, r) => a + (r.impressions ?? 0), 0);
  const totalClicks = rows.reduce((a, r) => a + (r.clicks ?? 0), 0);
  const totalConv = rows.reduce((a, r) => a + r.conversions, 0);
  const approved = rows.filter((r) => r.status === "approved");
  const dead = approved.filter((r) => r.pageviews_30d === 0 && (r.age_days ?? 0) >= 14);

  console.log("");
  console.log("=== Glowlytics SEO Outcome Report ===");
  console.log("");
  console.log(`Articles tracked:        ${rows.length}`);
  console.log(`  approved on site:      ${approved.length}`);
  console.log(`Pageviews (all-time):    ${totalPv}`);
  console.log(`Pageviews (30d):         ${totalPv30}`);
  console.log(`Waitlist conversions:    ${totalConv} attributed`);
  console.log(
    `Overall conv. rate:      ${totalPv > 0 ? ((totalConv / totalPv) * 100).toFixed(2) : "0.00"}%`,
  );
  if (hasGsc && gscWindowDays != null) {
    const overallCtr = totalImpr > 0 ? (totalClicks / totalImpr) * 100 : 0;
    console.log("");
    console.log(`Search impressions (${gscWindowDays}d): ${totalImpr}`);
    console.log(`Search clicks (${gscWindowDays}d):      ${totalClicks}`);
    console.log(`Overall search CTR:      ${overallCtr.toFixed(2)}%`);
  } else {
    console.log(`Search Console:          not configured (set GSC_SITE_URL + creds)`);
  }
  console.log("");

  const visible = rows.filter((r) => r.pageviews_all > 0 || r.status === "approved");
  if (visible.length === 0) {
    console.log("No traffic recorded yet. Once the site has views the table populates here.");
    console.log("");
    return;
  }

  console.log(
    hasGsc
      ? `Top articles by ${gscWindowDays}d search impressions:`
      : "Top approved articles by 30d pageviews:",
  );
  if (hasGsc) {
    console.log(
      pad("slug", 48) +
        pad("type", 9) +
        pad("impr", 8) +
        pad("clicks", 8) +
        pad("CTR%", 7) +
        pad("pos", 7) +
        pad("pv 30d", 8) +
        pad("conv", 6) +
        "age",
    );
    console.log("-".repeat(120));
    for (const row of visible.slice(0, 25)) {
      console.log(
        pad(row.slug, 48) +
          pad(row.type, 9) +
          padNum(row.impressions ?? 0, 8) +
          padNum(row.clicks ?? 0, 8) +
          pad(row.ctr != null ? (row.ctr * 100).toFixed(2) : "—", 7) +
          pad(row.position != null ? row.position.toFixed(1) : "—", 7) +
          padNum(row.pageviews_30d, 8) +
          padNum(row.conversions, 6) +
          (row.age_days != null ? `${row.age_days}d` : "—"),
      );
    }
  } else {
    console.log(
      pad("slug", 56) +
        pad("type", 10) +
        pad("pv 7d", 8) +
        pad("pv 30d", 8) +
        pad("uniq", 8) +
        pad("conv", 6) +
        pad("CR%", 8) +
        "age",
    );
    console.log("-".repeat(110));
    for (const row of visible.slice(0, 25)) {
      const cr = row.conversion_rate * 100;
      console.log(
        pad(row.slug, 56) +
          pad(row.type, 10) +
          padNum(row.pageviews_7d, 8) +
          padNum(row.pageviews_30d, 8) +
          padNum(row.unique_visitors, 8) +
          padNum(row.conversions, 6) +
          pad(cr ? cr.toFixed(2) : "—", 8) +
          (row.age_days != null ? `${row.age_days}d` : "—"),
      );
    }
  }
  console.log("");

  if (dead.length > 0) {
    console.log(`Dead drafts — approved ≥14d ago, 0 pageviews in last 30d (${dead.length}):`);
    for (const row of dead.slice(0, 10)) {
      console.log(`  - ${row.slug}  (${row.age_days}d, type=${row.type})`);
    }
    if (dead.length > 10) console.log(`  …and ${dead.length - 10} more.`);
    console.log("");
    console.log(
      "Consider rewriting these via `npm run seo:refresh -- --slug=<slug>` or rejecting them in seo:review.",
    );
    console.log("");
  }

  const winners = rows
    .filter((r) => r.conversions > 0)
    .sort((a, b) => b.conversion_rate - a.conversion_rate)
    .slice(0, 5);
  if (winners.length > 0) {
    console.log("Top converting articles (waitlist signups attributed):");
    for (const row of winners) {
      console.log(
        `  - ${row.slug}  ${row.conversions} conv / ${row.pageviews_all} pv  (${(row.conversion_rate * 100).toFixed(2)}%)`,
      );
    }
    console.log("");
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  let content: Map<string, ContentRecord>;
  let traffic: Map<string, SlugTraffic>;
  let conversions: Map<string, SlugConversion>;
  try {
    content = loadContentIndex();
    traffic = fetchTraffic(args);
    conversions = fetchConversions(args);
  } catch (err) {
    console.error("Report failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  let gscMap: Map<string, GscMetrics> | null = null;
  let gscWindow: number | null = null;
  if (!args.skipGsc) {
    try {
      const sa = loadServiceAccount();
      const siteUrl = process.env.GSC_SITE_URL?.trim();
      if (sa && siteUrl) {
        const startDate = daysAgoUtc(args.gscDays + 2); // GSC has 2-3d data delay
        const endDate = daysAgoUtc(2);
        const rows = await fetchSearchAnalytics(siteUrl, sa, startDate, endDate);
        gscMap = rowsToSlugMap(rows);
        gscWindow = args.gscDays;
      } else if (!sa && !siteUrl) {
        // both unset → user simply hasn't wired GSC yet, stay quiet
      } else {
        console.error(
          "GSC partial config: need both GSC_SITE_URL and GSC_SERVICE_ACCOUNT_FILE/_JSON. Skipping search metrics.",
        );
      }
    } catch (err) {
      console.error(
        "GSC fetch failed (continuing without search metrics):",
        err instanceof Error ? err.message : err,
      );
    }
  }

  const rows = buildRows(content, traffic, conversions, gscMap);

  if (args.json) {
    console.log(
      JSON.stringify(
        { generatedAt: new Date().toISOString(), gscWindowDays: gscWindow, rows },
        null,
        2,
      ),
    );
    return;
  }
  printHuman(rows, gscWindow);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
