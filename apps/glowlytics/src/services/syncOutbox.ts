// src/services/syncOutbox.ts
//
// Fire-and-forget backend mutations are how the store stays snappy: the UI
// updates locally first, then we replay the change to the API. The old
// `syncToBackend` helper logged-and-forgot — if the backend was offline or
// rate-limiting, writes silently dropped on the floor.
//
// This outbox keeps every queued mutation in memory and retries with backoff
// until either:
//   - It succeeds (drop from queue)
//   - It hits a non-retryable status the caller marks as terminal (drop)
//   - It exhausts MAX_ATTEMPTS (drop + report to telemetry + lastError listener)
//
// We intentionally do NOT persist the queue across cold-starts — the operations
// in flight are tied to in-memory store state that gets rebuilt on launch from
// the locally-persisted Zustand snapshot. Adding crash-safe durability would
// require careful versioning of the payload schema, and the store snapshot
// itself is the source of truth on relaunch.

import { trackEvent } from './analytics';
import { ApiError } from './httpClient';

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;

export interface SyncJob<T = unknown> {
  /** Human label for logs/telemetry — keep stable so dashboards aggregate. */
  label: string;
  /** The mutation to execute. Re-invoked on each attempt. */
  run: () => Promise<T>;
  /**
   * Optional predicate: returns true if this error should NOT trigger another
   * retry. Use for 4xx conflicts that are semantically "already done" (e.g.
   * createUser → 409 means the user already exists, don't keep banging).
   */
  isTerminalError?: (err: unknown) => boolean;
}

interface QueuedJob<T> extends SyncJob<T> {
  id: number;
  attempts: number;
  nextAttemptAt: number;
}

type Listener = (state: OutboxStatus) => void;

export interface OutboxStatus {
  queued: number;
  inFlight: number;
  lastError: { label: string; message: string; status?: number } | null;
}

let nextJobId = 0;
const queue: QueuedJob<unknown>[] = [];
let inFlight = 0;
let lastError: OutboxStatus['lastError'] = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

const status = (): OutboxStatus => ({ queued: queue.length, inFlight, lastError });

const notify = () => {
  const snapshot = status();
  for (const l of listeners) {
    try { l(snapshot); } catch { /* listener crash isolated */ }
  }
};

const computeDelay = (attempts: number): number => {
  const exp = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * Math.pow(2, attempts - 1));
  return Math.round(exp + Math.random() * exp * 0.25);
};

const scheduleNext = () => {
  if (timer) return;
  if (queue.length === 0) return;
  const soonest = queue.reduce((min, j) => Math.min(min, j.nextAttemptAt), Infinity);
  const wait = Math.max(0, soonest - Date.now());
  timer = setTimeout(() => {
    timer = null;
    void drain();
  }, wait);
};

const drain = async () => {
  const now = Date.now();
  // Run every job that's due. Concurrency is implicit — fetch is non-blocking,
  // but we still respect per-job ordering by sliding the in-flight counter.
  const due = queue.filter((j) => j.nextAttemptAt <= now);
  if (due.length === 0) {
    scheduleNext();
    return;
  }

  // Process serially: most mutations have an implicit happens-before order
  // (e.g. createUser must precede updateUser). Parallel drain would race.
  for (const job of due) {
    // Remove from queue eagerly so duplicate attempts don't pile up.
    const idx = queue.indexOf(job);
    if (idx === -1) continue;
    queue.splice(idx, 1);
    inFlight++;
    notify();
    job.attempts++;
    try {
      await job.run();
      lastError = null;
    } catch (err) {
      const terminal = job.isTerminalError?.(err) === true;
      const exhausted = job.attempts >= MAX_ATTEMPTS;
      if (terminal || exhausted) {
        const status = err instanceof ApiError ? err.status : undefined;
        const message = err instanceof Error ? err.message : String(err);
        lastError = { label: job.label, message, status };
        trackEvent('sync_outbox_dropped', {
          label: job.label,
          attempts: job.attempts,
          terminal,
          status: status ?? 0,
        });
        if (__DEV__) console.warn(`[Sync] ${job.label} ${terminal ? 'terminal' : 'exhausted'} after ${job.attempts}: ${message}`);
      } else {
        // Re-enqueue with backoff.
        job.nextAttemptAt = Date.now() + computeDelay(job.attempts);
        queue.push(job);
      }
    } finally {
      inFlight--;
      notify();
    }
  }
  scheduleNext();
};

/** Enqueue a mutation. Returns the job id (mostly for tests). */
export const enqueueSync = <T>(job: SyncJob<T>): number => {
  const queued: QueuedJob<T> = {
    ...job,
    id: ++nextJobId,
    attempts: 0,
    nextAttemptAt: Date.now(),
  };
  queue.push(queued as QueuedJob<unknown>);
  notify();
  // Run immediately on first add — the timer covers the retry path.
  if (!timer) void drain();
  return queued.id;
};

/** Subscribe to outbox status changes (queued/inFlight/lastError). */
export const subscribeSyncOutbox = (listener: Listener): (() => void) => {
  listeners.add(listener);
  // Push current snapshot immediately so consumers can render initial state.
  try { listener(status()); } catch { /* ignore */ }
  return () => { listeners.delete(listener); };
};

export const getSyncOutboxStatus = (): OutboxStatus => status();

/** Manual prod: drain any queued items now (e.g. on app foreground). */
export const flushSyncOutbox = (): void => {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  void drain();
};

/** Drop everything — used in test teardown and on sign-out. */
export const resetSyncOutbox = (): void => {
  if (timer) clearTimeout(timer);
  timer = null;
  queue.length = 0;
  inFlight = 0;
  lastError = null;
  notify();
};
