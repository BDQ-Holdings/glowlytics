import "./lib/env.js";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import matter from "gray-matter";
import {
  getCurrentDateString,
  getCurrentDateTimeParts,
} from "./lib/pipeline.js";
import { isAllowedKeyword } from "./lib/keyword-filter.js";
import { maybeNotifyRun } from "./lib/notify.js";
import type { ContentType, DailyRunReport, KeywordCluster, StageResult } from "./lib/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_DIR = path.resolve(__dirname, "..");
const LANDING_DIR = path.resolve(__dirname, "../../..");
const DATA_DIR = path.resolve(__dirname, "../../../data");
const CONTENT_DIR = path.resolve(__dirname, "../../../content");
const KEYWORDS_PATH = path.join(DATA_DIR, "keywords.json");
const RESEARCH_DIR = path.join(DATA_DIR, "research");
const RUNS_DIR = path.join(DATA_DIR, "runs");
const LOCK_PATH = path.join(DATA_DIR, ".seo-daily.lock");
const TSX_LOADER = path.join(ENGINE_DIR, "node_modules", "tsx", "dist", "loader.mjs");
const LATEST_REPORT_PATH = path.join(RUNS_DIR, "latest.json");

interface ContentSnapshot {
  slug: string;
  type: ContentType;
  status: string;
  dateGenerated?: string;
  filePath: string;
}

interface LockPayload {
  runId: string;
  pid: number;
  startedAt: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getStageTimeoutMs(): number {
  return parsePositiveInt(process.env.SEO_STAGE_TIMEOUT_MINUTES, 30) * 60 * 1000;
}

function readKeywords(): KeywordCluster[] {
  return JSON.parse(fs.readFileSync(KEYWORDS_PATH, "utf-8"));
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function loadJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function normalizeFrontmatterDate(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  return undefined;
}

function listContentSnapshots(): ContentSnapshot[] {
  const dirs: Record<ContentType, string> = {
    blog: "blog",
    faq: "faq",
    guide: "guides",
    glossary: "glossary",
  };

  const snapshots: ContentSnapshot[] = [];

  for (const [type, dir] of Object.entries(dirs) as [ContentType, string][]) {
    const fullDir = path.join(CONTENT_DIR, dir);
    if (!fs.existsSync(fullDir)) continue;

    for (const file of fs.readdirSync(fullDir).filter((entry) => entry.endsWith(".mdx"))) {
      const filePath = path.join(fullDir, file);
      const raw = fs.readFileSync(filePath, "utf-8");
      const { data } = matter(raw);

      snapshots.push({
        slug: typeof data.slug === "string" ? data.slug : file.replace(/\.mdx$/, ""),
        type,
        status: typeof data.status === "string" ? data.status : "draft",
        dateGenerated: normalizeFrontmatterDate(data.dateGenerated),
        filePath,
      });
    }
  }

  return snapshots;
}

function getContentPath(cluster: KeywordCluster): string {
  const dir = cluster.contentType === "guide" ? "guides" : cluster.contentType;
  return path.join(CONTENT_DIR, dir, `${cluster.slug}.mdx`);
}

function contentExists(cluster: KeywordCluster): boolean {
  return fs.existsSync(getContentPath(cluster));
}

function researchExists(slug: string): boolean {
  return fs.existsSync(path.join(RESEARCH_DIR, `${slug}.json`));
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock(runId: string, startedAt: string): void {
  ensureDir(DATA_DIR);

  if (fs.existsSync(LOCK_PATH)) {
    try {
      const lock = loadJsonFile<LockPayload>(LOCK_PATH);
      const staleMinutes = parseInt(process.env.SEO_LOCK_STALE_MINUTES || "360", 10);
      const ageMs = Date.now() - new Date(lock.startedAt).getTime();
      const isStale = ageMs > staleMinutes * 60 * 1000;

      if (!processExists(lock.pid) || isStale) {
        fs.unlinkSync(LOCK_PATH);
      } else {
        throw new Error(`Another SEO daily run is active (${lock.runId}, pid ${lock.pid}).`);
      }
    } catch (err) {
      if (fs.existsSync(LOCK_PATH)) {
        throw err;
      }
    }
  }

  const payload: LockPayload = { runId, pid: process.pid, startedAt };
  fs.writeFileSync(LOCK_PATH, JSON.stringify(payload, null, 2));
}

function releaseLock(): void {
  if (fs.existsSync(LOCK_PATH)) {
    fs.unlinkSync(LOCK_PATH);
  }
}

function getTodayRunFiles(localDate: string): string[] {
  if (!fs.existsSync(RUNS_DIR)) return [];

  return fs
    .readdirSync(RUNS_DIR)
    .filter((file) => file.endsWith(".json") && file !== "latest.json")
    .map((file) => path.join(RUNS_DIR, file))
    .filter((filePath) => {
      try {
        const report = loadJsonFile<DailyRunReport>(filePath);
        return report.localDate === localDate;
      } catch {
        return false;
      }
    });
}

function getTodayAttemptState(localDate: string): {
  attemptedSlugs: Set<string>;
  writtenSlugs: Set<string>;
} {
  const attemptedSlugs = new Set<string>();
  const writtenSlugs = new Set<string>();

  for (const filePath of getTodayRunFiles(localDate)) {
    const report = loadJsonFile<DailyRunReport>(filePath);
    if (report.skippedReason?.startsWith("Dry run")) continue;
    report.selectedSlugs.forEach((slug) => attemptedSlugs.add(slug));
    report.writtenSlugs.forEach((slug) => writtenSlugs.add(slug));
  }

  return { attemptedSlugs, writtenSlugs };
}

function countTodayGeneratedDrafts(localDate: string): number {
  return listContentSnapshots().filter((item) => item.dateGenerated === localDate).length;
}

function pruneOldRunReports(): void {
  if (!fs.existsSync(RUNS_DIR)) return;

  const retentionDays = parsePositiveInt(process.env.SEO_RUN_REPORT_RETENTION_DAYS, 45);
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  for (const file of fs.readdirSync(RUNS_DIR).filter((entry) => entry.endsWith(".json"))) {
    if (file === "latest.json") continue;
    const filePath = path.join(RUNS_DIR, file);

    try {
      const report = loadJsonFile<DailyRunReport>(filePath);
      const startedAtMs = new Date(report.startedAt).getTime();
      if (Number.isFinite(startedAtMs) && startedAtMs < cutoff) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // Keep unreadable files so a human can inspect them.
    }
  }
}

function buildTypeCaps(limit: number): Record<ContentType, number> {
  const weighted: Record<ContentType, number> = {
    blog: Math.max(1, Math.floor(limit * 0.5)),
    guide: Math.max(1, Math.floor(limit * 0.2)),
    faq: Math.max(1, Math.floor(limit * 0.2)),
    glossary: Math.max(1, Math.floor(limit * 0.1)),
  };

  return weighted;
}

function sortCandidates(candidates: KeywordCluster[]): KeywordCluster[] {
  return [...candidates].sort((a, b) => {
    if (b.opportunityScore !== a.opportunityScore) {
      return b.opportunityScore - a.opportunityScore;
    }

    if (b.paaQuestions.length !== a.paaQuestions.length) {
      return b.paaQuestions.length - a.paaQuestions.length;
    }

    return a.primaryKeyword.localeCompare(b.primaryKeyword);
  });
}

function pickBalanced(candidates: KeywordCluster[], limit: number): KeywordCluster[] {
  const caps = buildTypeCaps(limit);
  const counts: Record<ContentType, number> = {
    blog: 0,
    guide: 0,
    faq: 0,
    glossary: 0,
  };

  const chosen: KeywordCluster[] = [];
  const remaining = sortCandidates(candidates);

  for (const cluster of remaining) {
    if (chosen.length >= limit) break;
    if (counts[cluster.contentType] >= caps[cluster.contentType]) continue;

    chosen.push(cluster);
    counts[cluster.contentType] += 1;
  }

  if (chosen.length < limit) {
    for (const cluster of remaining) {
      if (chosen.length >= limit) break;
      if (chosen.some((item) => item.slug === cluster.slug)) continue;
      chosen.push(cluster);
    }
  }

  return chosen;
}

function selectCandidates(
  clusters: KeywordCluster[],
  limit: number,
  localDate: string
): KeywordCluster[] {
  const { attemptedSlugs, writtenSlugs } = getTodayAttemptState(localDate);
  const allowRetryToday = process.env.SEO_RETRY_FAILED_TODAY === "1";

  const eligible = clusters.filter((cluster) => {
    if (!isAllowedKeyword(cluster.primaryKeyword)) return false;
    if (contentExists(cluster)) return false;
    if (writtenSlugs.has(cluster.slug)) return false;
    if (!allowRetryToday && attemptedSlugs.has(cluster.slug)) return false;
    return cluster.status === "researched" || cluster.status === "new";
  });

  const readyToWrite = eligible.filter(
    (cluster) => cluster.status === "researched" || researchExists(cluster.slug)
  );
  const readyToResearch = eligible.filter(
    (cluster) => cluster.status === "new" && !researchExists(cluster.slug)
  );

  const chosen: KeywordCluster[] = [];
  const readyFirst = pickBalanced(readyToWrite, limit);
  chosen.push(...readyFirst);

  if (chosen.length < limit) {
    const remaining = pickBalanced(
      readyToResearch.filter((cluster) => !chosen.some((item) => item.slug === cluster.slug)),
      limit - chosen.length
    );
    chosen.push(...remaining);
  }

  return chosen;
}

function shouldRunDiscover(clusters: KeywordCluster[]): boolean {
  const mode = (process.env.SEO_DISCOVER_MODE || "auto").toLowerCase();
  if (mode === "always") return true;
  if (mode === "never") return false;

  const threshold = parseInt(process.env.SEO_DISCOVER_THRESHOLD || "40", 10);
  const availableNew = clusters.filter(
    (cluster) =>
      cluster.status === "new" &&
      !contentExists(cluster) &&
      isAllowedKeyword(cluster.primaryKeyword)
  ).length;

  return availableNew < threshold;
}

function assertRequiredEnvVars(names: string[], reason: string): void {
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length === 0) return;

  throw new Error(
    `Missing required environment variables for ${reason}: ${missing.join(", ")}.`
  );
}

function runStage(
  name: string,
  scriptFile: string,
  envOverrides: Record<string, string>
): StageResult {
  const timeoutMs = getStageTimeoutMs();
  const result = spawnSync(process.execPath, ["--import", TSX_LOADER, scriptFile], {
    cwd: LANDING_DIR,
    env: { ...process.env, ...envOverrides },
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
    timeout: timeoutMs,
  });

  const stdout = result.stdout || "";
  let stderr = result.stderr || "";
  const errorMessage = result.error instanceof Error ? result.error.message : undefined;
  const timedOut = (result.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT";

  if (errorMessage && !stderr.includes(errorMessage)) {
    stderr = stderr ? `${stderr}\n${errorMessage}` : errorMessage;
  }

  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

  return {
    name,
    exitCode: result.status ?? (timedOut ? 124 : 1),
    stdout,
    stderr,
    timeoutMs,
    timedOut,
    signal: result.signal ?? undefined,
    error: errorMessage,
  };
}

function saveRunReport(report: DailyRunReport): string {
  ensureDir(RUNS_DIR);
  const filePath = path.join(RUNS_DIR, `${report.runId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  fs.writeFileSync(LATEST_REPORT_PATH, JSON.stringify(report, null, 2));
  return filePath;
}

async function main() {
  ensureDir(RUNS_DIR);
  pruneOldRunReports();
  let commandFailed = false;

  const now = new Date();
  const { date: localDate, time } = getCurrentDateTimeParts(now);
  const runId = `${localDate}-${time}`;
  const startedAt = now.toISOString();
  const configuredLimit = parseInt(process.env.DAILY_BATCH_SIZE || "10", 10);
  const dailyLimit = clamp(configuredLimit, 1, 20);
  const dryRun = process.env.SEO_DRY_RUN === "1";

  if (configuredLimit > 20 && process.env.ALLOW_HIGH_VOLUME !== "1") {
    throw new Error(
      `Refusing DAILY_BATCH_SIZE=${configuredLimit}. Set ALLOW_HIGH_VOLUME=1 if you intentionally want more than 20 drafts/day.`
    );
  }

  acquireLock(runId, startedAt);

  const report: DailyRunReport = {
    runId,
    startedAt,
    localDate,
    dailyLimit,
    alreadyWrittenToday: 0,
    selectedSlugs: [],
    researchedSlugs: [],
    writtenSlugs: [],
    failedSlugs: [],
    stages: [],
    discoverTriggered: false,
    status: "skipped",
  };

  try {
    const alreadyWrittenToday = countTodayGeneratedDrafts(localDate);
    report.alreadyWrittenToday = alreadyWrittenToday;

    const remainingCapacity = dailyLimit - alreadyWrittenToday;
    if (remainingCapacity <= 0) {
      report.skippedReason = `Daily quota reached (${alreadyWrittenToday}/${dailyLimit}).`;
      report.status = "skipped";
      return;
    }

    let clusters = readKeywords();
    const discoverTriggered = shouldRunDiscover(clusters);

    if (!dryRun) {
      assertRequiredEnvVars(["OPENAI_API_KEY"], "writing daily drafts");
      if (discoverTriggered) {
        assertRequiredEnvVars(["SERPAPI_KEY"], "discovering new keyword clusters");
      }
    }

    if (discoverTriggered) {
      const discoverStage = runStage("discover", path.join(__dirname, "discover.ts"), {});
      report.stages.push(discoverStage);
      report.discoverTriggered = true;

      if (discoverStage.exitCode !== 0) {
        throw new Error("Discover stage failed.");
      }

      clusters = readKeywords();
    }

    const selected = selectCandidates(clusters, remainingCapacity, localDate);
    report.selectedSlugs = selected.map((cluster) => cluster.slug);

    if (selected.length === 0) {
      report.skippedReason = "No eligible keyword clusters available for today.";
      report.status = "skipped";
      return;
    }

    if (dryRun) {
      report.skippedReason = "Dry run only. No research or writing stages were executed.";
      report.status = "skipped";
      return;
    }

    const targetSlugs = selected.map((cluster) => cluster.slug).join(",");
    const stageEnv = {
      TARGET_SLUGS: targetSlugs,
      BATCH_SIZE: String(selected.length),
    };

    const needsResearch = selected.some(
      (cluster) => cluster.status === "new" && !researchExists(cluster.slug)
    );

    if (!dryRun && needsResearch) {
      assertRequiredEnvVars(["SERPAPI_KEY"], "researching selected keyword clusters");
    }

    if (needsResearch) {
      const researchStage = runStage("research", path.join(__dirname, "research.ts"), stageEnv);
      report.stages.push(researchStage);

      if (researchStage.exitCode !== 0) {
        throw new Error("Research stage failed.");
      }
    }

    const writeStage = runStage("write", path.join(__dirname, "write.ts"), stageEnv);
    report.stages.push(writeStage);

    if (writeStage.exitCode !== 0) {
      throw new Error("Write stage failed.");
    }

    report.researchedSlugs = selected
      .filter((cluster) => researchExists(cluster.slug))
      .map((cluster) => cluster.slug);

    report.writtenSlugs = selected
      .filter((cluster) => contentExists(cluster))
      .map((cluster) => cluster.slug);

    report.failedSlugs = selected
      .map((cluster) => cluster.slug)
      .filter((slug) => !report.writtenSlugs.includes(slug));

    if (report.writtenSlugs.length === selected.length) {
      report.status = "completed";
    } else if (report.writtenSlugs.length > 0) {
      report.status = "partial";
      report.skippedReason = `Only ${report.writtenSlugs.length}/${selected.length} drafts were written.`;
      commandFailed = true;
    } else {
      report.status = "failed";
      report.skippedReason = `No drafts were written for ${selected.length} selected slug(s).`;
      commandFailed = true;
    }
  } catch (err) {
    report.status = "failed";
    report.skippedReason = err instanceof Error ? err.message : String(err);
    commandFailed = true;
    throw err;
  } finally {
    report.finishedAt = new Date().toISOString();
    const savedPath = saveRunReport(report);
    await maybeNotifyRun(report, savedPath);
    console.log(`\nSaved daily run report to ${savedPath}`);
    releaseLock();
    if (commandFailed) {
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
