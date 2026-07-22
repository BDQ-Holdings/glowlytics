const crypto = require('crypto');

const UUID_NAMESPACE = '8f3138f3-b4e5-5af1-bd6f-25fb94a89a9f';

function deterministicUuidV5(name, namespace = UUID_NAMESPACE) {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = crypto.createHash('sha1').update(ns).update(name).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function canonicalGlowlyticsUserId(userId) {
  return `glowlytics:user:${userId}`;
}

function accountCreatedUuid(userId) {
  return deterministicUuidV5(`glowlytics|forward|account_created|${userId}`);
}

const ACQUISITION_SOURCES = new Set(['instagram', 'tiktok', 'facebook', 'google', 'other_search', 'ai_search', 'direct', 'referral', 'unknown']);
const ATTRIBUTION_QUALITIES = new Set(['utm', 'referrer', 'unknown', 'backfilled']);
const FORM_PLACEMENTS = new Set(['hero', 'footer', 'modal', 'pricing', 'mobile_onboarding', 'unknown']);
const SENSITIVE_VALUE_RE = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|((api[_-]?key|api|secret|password|credential|bearer|access|refresh|id)?[_-]?token=?)|\b(api[_-]?key|secret|password|credential|bearer)\b|((gclid|gbraid|wbraid)=?)/i;

function marketing(value, max = 256) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed && !SENSITIVE_VALUE_RE.test(trimmed) ? trimmed : null;
}

const enumOr = (set, value, fallback) => (typeof value === 'string' && set.has(value) ? value : fallback);

function normalizeHost(value) {
  const raw = marketing(value, 512);
  if (!raw) return null;
  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).hostname.toLowerCase().slice(0, 256);
  } catch {
    return null;
  }
}

function normalizePath(value) {
  const raw = marketing(value, 512);
  if (!raw) return null;
  try {
    const parsed = raw.startsWith('/') ? new URL(`https://glowlytics.invalid${raw}`) : new URL(raw);
    return parsed.pathname.slice(0, 256);
  } catch {
    return raw.startsWith('/') ? raw.split(/[?#]/, 1)[0].slice(0, 256) : null;
  }
}

function normalizeFormPlacement(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return FORM_PLACEMENTS.has(trimmed) ? trimmed : null;
}

function accountAttributionProperties(attribution, waitlistMatch) {
  const anonymousDistinctId = waitlistMatch ? marketing(attribution?.posthog_distinct_id, 256) : null;
  return {
    product: 'glowlytics',
    acquisition_source: enumOr(ACQUISITION_SOURCES, attribution?.acquisition_source, 'unknown'),
    acquisition_medium: marketing(attribution?.acquisition_medium, 64) || 'unknown',
    attribution_model: 'first_touch',
    attribution_quality: enumOr(ATTRIBUTION_QUALITIES, attribution?.attribution_quality, 'unknown'),
    historical_backfill: false,
    utm_source: marketing(attribution?.utm_source, 128)?.toLowerCase() || null,
    utm_medium: marketing(attribution?.utm_medium, 128)?.toLowerCase() || null,
    utm_campaign: marketing(attribution?.utm_campaign, 256),
    utm_term: marketing(attribution?.utm_term, 256),
    utm_content: marketing(attribution?.utm_content, 256),
    google_click_id_present: Boolean(attribution?.google_click_id_present),
    referrer_host: normalizeHost(attribution?.referrer_host),
    landing_path: normalizePath(attribution?.landing_path),
    form_placement: normalizeFormPlacement(attribution?.form_placement),
    waitlist_match: Boolean(waitlistMatch),
    waitlist_bypassed: !waitlistMatch,
    ...(anonymousDistinctId ? { $anon_distinct_id: anonymousDistinctId } : {}),
  };
}

async function captureAccountCreated({ userId, uuid, timestamp, properties }) {
  const distinctId = canonicalGlowlyticsUserId(userId);
  if (!properties || properties.distinct_id !== distinctId) {
    throw new Error('account_created properties must contain the canonical distinct_id');
  }
  const apiKey = process.env.POSTHOG_API_KEY;
  if (!apiKey) throw new Error('POSTHOG_API_KEY missing; account_created remains pending');
  const host = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';
  const accountProperties = { ...properties };
  const anonymousDistinctId = marketing(accountProperties.$anon_distinct_id, 256);
  delete accountProperties.$anon_distinct_id;
  const identifyEvent =
    anonymousDistinctId && anonymousDistinctId !== distinctId
      ? [{
          uuid: deterministicUuidV5(`glowlytics|forward|identify|${userId}|${anonymousDistinctId}`),
          event: '$identify',
          timestamp,
          properties: {
            distinct_id: distinctId,
            $anon_distinct_id: anonymousDistinctId,
          },
        }]
      : [];
  const body = {
    api_key: apiKey,
    batch: [
      ...identifyEvent,
      {
        uuid,
        event: 'account_created',
        timestamp,
        properties: accountProperties,
      },
    ],
  };
  const res = await fetch(`${host.replace(/\/$/, '')}/batch/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`PostHog batch capture failed: ${res.status}`);
  return { ok: true };
}

module.exports = {
  deterministicUuidV5,
  canonicalGlowlyticsUserId,
  accountCreatedUuid,
  accountAttributionProperties,
  captureAccountCreated,
};
