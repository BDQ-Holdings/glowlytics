# Glowlytics SEO Engine

This pipeline is set up to generate drafts continuously, but it is intentionally not set up to auto-publish.

## Daily Automation

Run the daily draft producer from `apps/landing`:

```bash
npm run seo:daily
```

Or call the wrapper directly from cron:

```bash
bash scripts/seo-engine/run-daily.sh
```

The wrapper sets a conservative `PATH` for common macOS/Homebrew Node installs and exits early if `npm` is unavailable.

The runner is cron-safe:

- It uses a lock file to prevent overlapping runs.
- It respects a daily quota, so you can schedule it hourly without exceeding the target.
- It writes JSON run reports to `data/runs/`.
- It keeps `data/runs/latest.json` updated for monitoring.
- It prunes old JSON run reports after the retention window.
- It only creates drafts. Approval still happens through `npm run seo:review`.
- It fails fast when required API keys are missing instead of silently burning a cron slot.
- It can emit webhook alerts and expose a simple health status via `npm run seo:health`.

## Useful Environment Variables

```bash
DAILY_BATCH_SIZE=10        # hard-capped at 20 unless ALLOW_HIGH_VOLUME=1
SEO_TIMEZONE=America/Denver
SEO_DISCOVER_MODE=auto     # auto | always | never
SEO_DISCOVER_THRESHOLD=40  # trigger discovery when available new clusters drop below this
SEO_RETRY_FAILED_TODAY=0   # set to 1 if you want same-day retries for failed slugs
SEO_LOCK_STALE_MINUTES=360
SEO_STAGE_TIMEOUT_MINUTES=30
SEO_FETCH_TIMEOUT_MS=15000
SEO_AI_TIMEOUT_MS=90000
SEO_RUN_REPORT_RETENTION_DAYS=45
SEO_ALERT_WEBHOOK_URL=https://your-webhook.example
SEO_NOTIFY_ON_SUCCESS=0
SEO_NOTIFY_ON_SKIPPED=0
SEO_HEALTH_MAX_AGE_HOURS=26
SEO_HEALTH_NOTIFY=0
SEO_HEALTH_ALLOW_PARTIAL=0
```

## Example Cron

This runs every hour but will still only produce up to 12 drafts for the day:

```cron
0 * * * * cd /Users/mustafaboorenie/cornell-hackathon/apps/landing && SEO_TIMEZONE=America/Denver DAILY_BATCH_SIZE=12 bash scripts/seo-engine/run-daily.sh >> /Users/mustafaboorenie/cornell-hackathon/apps/landing/data/runs/cron.log 2>&1
```

Optional health-check cron:

```cron
15 * * * * cd /Users/mustafaboorenie/cornell-hackathon/apps/landing && npm run seo:health >> /Users/mustafaboorenie/cornell-hackathon/apps/landing/data/runs/cron.log 2>&1
```

## Operating Model

1. `seo:daily` discovers new candidates when the backlog gets low.
2. It selects the best eligible slugs for the remaining daily quota.
3. It researches and writes those slugs into draft MDX files.
4. A human reviews and approves the good ones with `seo:review`.

If you want 10-20 SEO-supporting pages per day, schedule `seo:daily` frequently and review the resulting drafts in batches. That keeps throughput high without letting low-quality medical content auto-publish.

## Required Secrets

- `OPENAI_API_KEY` is required for seed generation and writing drafts.
- `SERPAPI_KEY` is required for discovery and research.

The daily runner checks these up front and exits with a clear error if they are missing.
The engine loads `apps/landing/.env` first and then falls back to `apps/glowlytics/backend/.env`, so you can keep a single `OPENAI_API_KEY` source if you want.
