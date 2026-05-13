import { getFetchTimeoutMs } from "./pipeline.js";
import type { DailyRunReport } from "./types.js";

interface NotificationPayload {
  service: string;
  status: string;
  runId?: string;
  message: string;
  localDate?: string;
  reportPath?: string;
  selectedCount?: number;
  writtenCount?: number;
  failedCount?: number;
  timestamp: string;
  [key: string]: unknown;
}

function shouldNotifyRun(report: DailyRunReport): boolean {
  if (report.status === "failed" || report.status === "partial") return true;
  if (report.status === "completed") return process.env.SEO_NOTIFY_ON_SUCCESS === "1";
  if (report.status === "skipped") return process.env.SEO_NOTIFY_ON_SKIPPED === "1";
  return false;
}

export async function maybeNotifyRun(
  report: DailyRunReport,
  reportPath: string
): Promise<void> {
  const webhookUrl = process.env.SEO_ALERT_WEBHOOK_URL?.trim();
  if (!webhookUrl || !shouldNotifyRun(report)) return;

  const payload: NotificationPayload = {
    service: "glowlytics-seo-daily",
    status: report.status,
    runId: report.runId,
    message: report.skippedReason || `Run ${report.status}`,
    localDate: report.localDate,
    reportPath,
    selectedCount: report.selectedSlugs.length,
    writtenCount: report.writtenSlugs.length,
    failedCount: report.failedSlugs.length,
    timestamp: new Date().toISOString(),
  };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(getFetchTimeoutMs()),
    });
  } catch (err) {
    console.warn("Failed to send SEO alert webhook:", err);
  }
}

export async function sendHealthAlert(
  healthy: boolean,
  message: string,
  meta: Record<string, unknown>
): Promise<void> {
  const webhookUrl =
    process.env.SEO_HEALTH_ALERT_WEBHOOK_URL?.trim() ||
    process.env.SEO_ALERT_WEBHOOK_URL?.trim();

  if (!webhookUrl) return;
  if (healthy && process.env.SEO_HEALTH_NOTIFY_ON_SUCCESS !== "1") return;
  if (!healthy && process.env.SEO_HEALTH_NOTIFY !== "1") return;

  const payload: NotificationPayload = {
    service: "glowlytics-seo-health",
    status: healthy ? "healthy" : "unhealthy",
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(getFetchTimeoutMs()),
    });
  } catch (err) {
    console.warn("Failed to send SEO health webhook:", err);
  }
}
