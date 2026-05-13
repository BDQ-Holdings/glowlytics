import "./lib/env.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { sendHealthAlert } from "./lib/notify.js";
import type { DailyRunReport } from "./lib/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = path.resolve(__dirname, "../../../data/runs");
const LATEST_REPORT_PATH = path.join(RUNS_DIR, "latest.json");

interface HealthResult {
  healthy: boolean;
  message: string;
  latestRunId?: string;
  latestStatus?: string;
  reportAgeHours?: number;
  reportPath?: string;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function loadLatestReport(): { report: DailyRunReport; reportPath: string } | null {
  if (fs.existsSync(LATEST_REPORT_PATH)) {
    return {
      report: JSON.parse(fs.readFileSync(LATEST_REPORT_PATH, "utf-8")) as DailyRunReport,
      reportPath: LATEST_REPORT_PATH,
    };
  }

  if (!fs.existsSync(RUNS_DIR)) return null;

  const files = fs
    .readdirSync(RUNS_DIR)
    .filter((entry) => entry.endsWith(".json"))
    .sort()
    .reverse();

  for (const file of files) {
    const reportPath = path.join(RUNS_DIR, file);
    try {
      const report = JSON.parse(fs.readFileSync(reportPath, "utf-8")) as DailyRunReport;
      return { report, reportPath };
    } catch {
      // Keep scanning.
    }
  }

  return null;
}

function evaluateHealth(report: DailyRunReport, reportPath: string): HealthResult {
  const maxAgeHours = parsePositiveInt(process.env.SEO_HEALTH_MAX_AGE_HOURS, 26);
  const allowPartial = process.env.SEO_HEALTH_ALLOW_PARTIAL === "1";
  const finishedAt = report.finishedAt || report.startedAt;
  const ageHours = (Date.now() - new Date(finishedAt).getTime()) / (1000 * 60 * 60);
  const ageHoursText = Number.isFinite(ageHours) ? ageHours.toFixed(1) : "unknown";

  if (!Number.isFinite(ageHours) || ageHours > maxAgeHours) {
    return {
      healthy: false,
      message: `Latest SEO run is stale (${ageHoursText}h old, limit ${maxAgeHours}h).`,
      latestRunId: report.runId,
      latestStatus: report.status,
      reportAgeHours: ageHours,
      reportPath,
    };
  }

  if (report.status === "failed") {
    return {
      healthy: false,
      message: report.skippedReason || "Latest SEO run failed.",
      latestRunId: report.runId,
      latestStatus: report.status,
      reportAgeHours: ageHours,
      reportPath,
    };
  }

  if (report.status === "partial" && !allowPartial) {
    return {
      healthy: false,
      message: `Latest SEO run was partial (${report.writtenSlugs.length}/${report.selectedSlugs.length} drafts written).`,
      latestRunId: report.runId,
      latestStatus: report.status,
      reportAgeHours: ageHours,
      reportPath,
    };
  }

  if (report.status === "skipped") {
    const healthySkipReasons = [
      "Daily quota reached",
    ];

    const isHealthySkip = healthySkipReasons.some((reason) =>
      report.skippedReason?.startsWith(reason)
    );

    return {
      healthy: isHealthySkip,
      message: report.skippedReason || "Latest SEO run was skipped.",
      latestRunId: report.runId,
      latestStatus: report.status,
      reportAgeHours: ageHours,
      reportPath,
    };
  }

  return {
    healthy: true,
    message: `Latest SEO run is healthy (${report.writtenSlugs.length}/${report.selectedSlugs.length} drafts written).`,
    latestRunId: report.runId,
    latestStatus: report.status,
    reportAgeHours: ageHours,
    reportPath,
  };
}

async function main() {
  const latest = loadLatestReport();
  let result: HealthResult;

  if (!latest) {
    result = {
      healthy: false,
      message: "No SEO run reports found.",
    };
  } else {
    result = evaluateHealth(latest.report, latest.reportPath);
  }

  console.log(JSON.stringify(result, null, 2));
  await sendHealthAlert(result.healthy, result.message, {
    latestRunId: result.latestRunId,
    latestStatus: result.latestStatus,
    reportAgeHours: result.reportAgeHours,
    reportPath: result.reportPath,
  });

  if (!result.healthy) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
