#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA_VERSION = 'glowlytics-posthog-backfill-v1';
const UUID_NAMESPACE = 'b7b3422d-9972-5b42-8e4f-7a8906603b58';
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
const APPROVED_BASELINE = { d1Waitlist: 4, railwayWaitlist: 36, totalWaitlist: 40, railwayProfiles: 142, uvMatches: 0 };
const FINAL_LINKAGE_BASELINE = { matched: 0, bypassed: 0 };

function deterministicUuidV5(name, namespace = UUID_NAMESPACE) {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = crypto.createHash('sha1').update(ns).update(name).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function requireIso(value, label) {
  const ms = Date.parse(value || '');
  if (!Number.isFinite(ms)) throw new Error(`${label} missing or invalid`);
  return new Date(ms).toISOString();
}

function deriveArtifactRunId(cutoverAt, artifactMode = 'rehearsal') {
  const cutover = requireIso(cutoverAt, 'GLOWLYTICS_CUTOVER_AT');
  const slug = cutover.replace(/\D/g, '').slice(0, 14);
  return artifactMode === 'final' ? `lane-b-${slug}Z-final` : `lane-b-${slug}Z`;
}

function parseSourceTimestampMs(value) {
  if (typeof value !== 'string') {
    const ms = Date.parse(value || '');
    return Number.isFinite(ms) ? ms : NaN;
  }
  const trimmed = value.trim();
  if (!trimmed) return NaN;
  const normalizedSeparator = trimmed.replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedSeparator)) {
    return Date.parse(`${normalizedSeparator}T00:00:00.000Z`);
  }
  const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalizedSeparator);
  return Date.parse(hasExplicitZone ? normalizedSeparator : `${normalizedSeparator}Z`);
}

function normalizeTimestamp(value) {
  const ms = parseSourceTimestampMs(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function eligibility(timestamp, { now, cutoverAt }) {
  const ts = Date.parse(timestamp || '');
  const current = Date.parse(now || '');
  const cutover = Date.parse(cutoverAt || '');
  if (!Number.isFinite(ts)) return { eligible: false, defer_reason: 'invalid_timestamp' };
  if (!Number.isFinite(current)) throw new Error('now missing or invalid');
  if (!Number.isFinite(cutover)) throw new Error('cutoverAt missing or invalid');
  if (ts >= cutover) return { eligible: false, defer_reason: 'at_or_after_cutover' };
  if (current - ts < FORTY_EIGHT_HOURS_MS) return { eligible: false, defer_reason: 'timestamp_within_48_hours' };
  return { eligible: true, defer_reason: null };
}

const FORM_PLACEMENT_ALIASES = new Map([
  ['hero', 'hero'],
  ['footer', 'footer'],
  ['final-cta', 'footer'],
  ['blog-newsletter', 'footer'],
  ['modal', 'modal'],
  ['pricing', 'pricing'],
  ['mobile_onboarding', 'mobile_onboarding'],
  ['uv-scan-web', 'unknown'],
  ['unknown', 'unknown'],
]);
const ACQUISITION_SOURCES = new Set(['instagram', 'tiktok', 'facebook', 'google', 'other_search', 'ai_search', 'direct', 'referral', 'unknown']);
const ATTRIBUTION_QUALITIES = new Set(['utm', 'referrer', 'unknown', 'backfilled']);
const SENSITIVE_VALUE_RE = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|((api[_-]?key|api|secret|password|credential|bearer|access|refresh|id)?[_-]?token=?)|\b(api[_-]?key|secret|password|credential|bearer)\b|((gclid|gbraid|wbraid)=?)/i;
const SENSITIVE_ARTIFACT_RE = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|phc_|POSTHOG_API_KEY|sent_at|Bearer|secret|api[_-]?key=|token=|access_token|refresh_token/i;

function normalizeFormPlacement(value) {
  if (typeof value !== 'string') return 'unknown';
  return FORM_PLACEMENT_ALIASES.get(value.trim()) || 'unknown';
}

function field(value, max = 256) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed && !SENSITIVE_VALUE_RE.test(trimmed) ? trimmed : null;
}

function lowerField(value, max = 128) {
  const clean = field(value, max);
  return clean ? clean.toLowerCase() : null;
}

function acquisitionSource(value) {
  const clean = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return ACQUISITION_SOURCES.has(clean) ? clean : 'unknown';
}

function attributionQuality(value) {
  const clean = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return ATTRIBUTION_QUALITIES.has(clean) ? clean : 'backfilled';
}

function normalizeHost(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, 512);
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    const hostname = parsed.hostname.toLowerCase().slice(0, 256);
    return hostname && !SENSITIVE_VALUE_RE.test(hostname) ? hostname : null;
  } catch {
    const hostOnly = trimmed.split(/[/?#]/, 1)[0].toLowerCase().slice(0, 256);
    return hostOnly && !SENSITIVE_VALUE_RE.test(hostOnly) ? hostOnly : null;
  }
}

function normalizePath(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, 512);
  if (!trimmed) return null;
  try {
    const parsed = trimmed.startsWith('/') ? new URL(`https://glowlytics.invalid${trimmed}`) : new URL(trimmed);
    const pathname = parsed.pathname.slice(0, 256);
    return pathname && !SENSITIVE_VALUE_RE.test(pathname) ? pathname : null;
  } catch {
    if (!trimmed.startsWith('/')) return null;
    const pathname = trimmed.split(/[?#]/, 1)[0].slice(0, 256);
    return pathname && !SENSITIVE_VALUE_RE.test(pathname) ? pathname : null;
  }
}

function cleanSourcePk(value) {
  return value === undefined || value === null || String(value).trim() === '' ? null : String(value);
}


function canonicalBackfilledAttribution(row = {}) {
  return {
    product: 'glowlytics',
    acquisition_source: acquisitionSource(row.acquisition_source),
    acquisition_medium: lowerField(row.acquisition_medium, 64) || 'unknown',
    attribution_model: 'first_touch',
    attribution_quality: attributionQuality(row.attribution_quality),
    historical_backfill: true,
    form_placement: normalizeFormPlacement(row.form_placement || row.source),
    utm_source: lowerField(row.utm_source, 128),
    utm_medium: lowerField(row.utm_medium, 128),
    utm_campaign: field(row.utm_campaign, 256),
    utm_term: field(row.utm_term, 256),
    utm_content: field(row.utm_content, 256),
    google_click_id_present: Boolean(row.google_click_id_present),
    referrer_host: normalizeHost(row.referrer_host),
    landing_path: normalizePath(row.landing_path),
  };
}

function manifestRow({ source, source_table, source_pk, event, distinct_id, timestamp, properties, now, cutoverAt, cutoverSource }) {
  const pk = cleanSourcePk(source_pk);
  const normalizedTimestamp = normalizeTimestamp(timestamp);
  const distinct = distinct_id === undefined || distinct_id === null || String(distinct_id).trim() === '' ? null : String(distinct_id);
  const rejectReason = !pk
    ? 'missing_source_pk'
    : !distinct
      ? 'missing_distinct_id'
      : !normalizedTimestamp
        ? 'invalid_timestamp'
        : null;
  const state = rejectReason ? { eligible: false, defer_reason: rejectReason } : eligibility(normalizedTimestamp, { now, cutoverAt });
  const uuid = rejectReason ? null : deterministicUuidV5(`glowlytics|${source}|${pk}|${event}`);
  return {
    schema_version: SCHEMA_VERSION,
    source,
    source_table,
    source_pk: pk,
    event,
    product: 'glowlytics',
    distinct_id: distinct,
    timestamp: normalizedTimestamp || String(timestamp || ''),
    uuid,
    properties: { ...(distinct ? { distinct_id: distinct } : {}), ...properties },
    eligible: state.eligible,
    defer_reason: state.defer_reason,
    cutover_at: cutoverAt,
    cutover_source: cutoverSource,
  };
}

function manifestRowForD1Lead(row, context) {
  return manifestRow({
    source: 'glowlytics_d1_waitlist',
    source_table: 'waitlist',
    source_pk: row.id,
    event: 'waitlist_submitted',
    distinct_id: row.id === undefined || row.id === null || String(row.id).trim() === '' ? null : `glowlytics:lead:d1:${row.id}`,
    timestamp: row.created_at,
    properties: canonicalBackfilledAttribution(row),
    ...context,
  });
}

function manifestRowForRailwayWaitlistLead(row, context) {
  return manifestRow({
    source: 'glowlytics_railway_waitlist',
    source_table: 'waitlist',
    source_pk: row.id,
    event: 'waitlist_submitted',
    distinct_id: row.id === undefined || row.id === null || String(row.id).trim() === '' ? null : `glowlytics:lead:railway:${row.id}`,
    timestamp: row.created_at,
    properties: canonicalBackfilledAttribution(row),
    ...context,
  });
}

function manifestRowForRailwayProfile(row, context, uvLeadByClerkId = new Map()) {
  const userId = row.user_id === undefined || row.user_id === null ? null : String(row.user_id);
  const matchedLead = userId ? uvLeadByClerkId.get(userId) : null;
  const attribution = matchedLead || {};
  return manifestRow({
    source: 'glowlytics_railway_user_profiles',
    source_table: 'user_profiles',
    source_pk: row.user_id,
    event: 'account_created',
    distinct_id: userId && userId.trim() ? `glowlytics:user:${userId}` : null,
    timestamp: row.created_at,
    properties: {
      ...canonicalBackfilledAttribution(attribution),
      form_placement: matchedLead ? normalizeFormPlacement(matchedLead.form_placement || matchedLead.source) : normalizeFormPlacement(undefined),
      ...(matchedLead ? { waitlist_match: true, waitlist_bypassed: false } : {}),
    },
    ...context,
  });
}

function readJson(file) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(value)) throw new Error(`expected JSON array in ${file}`);
  return value;
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function createArtifactDirs(artifactRoot, artifactRunId) {
  if (!artifactRoot) throw new Error('artifactRoot is required');
  if (!artifactRunId) throw new Error('artifactRunId is required');
  const root = path.resolve(artifactRoot);
  const artifactDir = path.resolve(root, artifactRunId);
  if (fs.existsSync(artifactDir)) throw new Error(`refusing to overwrite existing artifact directory: ${artifactDir}`);
  fs.mkdirSync(root, { recursive: true });
  const stagingDir = path.resolve(root, `.${artifactRunId}.tmp-${process.pid}`);
  if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: false });
  return { artifactDir, stagingDir };
}

function sortUvRowsForReconciliation(rows) {
  return [...rows].sort((a, b) => {
    const aTime = parseSourceTimestampMs(a.created_at);
    const bTime = parseSourceTimestampMs(b.created_at);
    const aSortTime = Number.isFinite(aTime) ? aTime : Number.MAX_SAFE_INTEGER;
    const bSortTime = Number.isFinite(bTime) ? bTime : Number.MAX_SAFE_INTEGER;
    if (aSortTime !== bSortTime) return aSortTime - bSortTime;
    return String(a.id ?? '').localeCompare(String(b.id ?? ''));
  });
}

function buildUvLeadMap(uvRows) {
  const uvLeadByClerkId = new Map();
  for (const row of sortUvRowsForReconciliation(uvRows)) {
    const clerkUserId = cleanSourcePk(row.clerk_user_id);
    if (clerkUserId && !uvLeadByClerkId.has(clerkUserId)) uvLeadByClerkId.set(clerkUserId, row);
  }
  return uvLeadByClerkId;
}

function compareSourcePk(a, b) {
  const aPk = cleanSourcePk(a);
  const bPk = cleanSourcePk(b);
  if (aPk === bPk) return 0;
  if (!aPk) return 1;
  if (!bPk) return -1;
  const aNum = Number(aPk);
  const bNum = Number(bPk);
  if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) return aNum - bNum;
  return aPk.localeCompare(bPk);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function canonicalSourceRows(rows, pkField) {
  return [...rows].sort((a, b) => {
    const pk = compareSourcePk(a[pkField], b[pkField]);
    if (pk !== 0) return pk;
    const aTime = parseSourceTimestampMs(a.created_at);
    const bTime = parseSourceTimestampMs(b.created_at);
    const aSortTime = Number.isFinite(aTime) ? aTime : Number.MAX_SAFE_INTEGER;
    const bSortTime = Number.isFinite(bTime) ? bTime : Number.MAX_SAFE_INTEGER;
    if (aSortTime !== bSortTime) return aSortTime - bSortTime;
    return canonicalJson(a).localeCompare(canonicalJson(b));
  });
}

function applyDuplicateSourcePkRejects(rows) {
  const seen = new Set();
  const errors = [];
  for (const row of rows) {
    if (!row.source_pk || row.defer_reason === 'missing_source_pk') continue;
    const key = `${row.source}\u0000${row.source_pk}`;
    if (!seen.has(key)) {
      seen.add(key);
      continue;
    }
    row.eligible = false;
    row.defer_reason = 'duplicate_source_pk';
    row.uuid = null;
    errors.push(`duplicate source primary key: ${row.source} source_pk=${row.source_pk}`);
  }
  return errors;
}

function approvedSourceCoverageError(d1, railwayWaitlist, profiles) {
  const totalWaitlist = d1 + railwayWaitlist;
  if (
    d1 !== APPROVED_BASELINE.d1Waitlist
    || railwayWaitlist !== APPROVED_BASELINE.railwayWaitlist
    || totalWaitlist !== APPROVED_BASELINE.totalWaitlist
    || profiles !== APPROVED_BASELINE.railwayProfiles
  ) {
    return `source coverage mismatch: expected D1=${APPROVED_BASELINE.d1Waitlist}, Railway waitlist=${APPROVED_BASELINE.railwayWaitlist}, total waitlist=${APPROVED_BASELINE.totalWaitlist}, profiles=${APPROVED_BASELINE.railwayProfiles}; got D1=${d1}, Railway waitlist=${railwayWaitlist}, total waitlist=${totalWaitlist}, profiles=${profiles}; stop for reviewed reconciliation`;
  }
  return null;
}

function structuralPreCutoff(row, cutoverAt) {
  const malformedReasons = new Set(['missing_source_pk', 'missing_distinct_id', 'invalid_timestamp', 'duplicate_source_pk']);
  return row.timestamp && !malformedReasons.has(row.defer_reason) && Date.parse(row.timestamp) < Date.parse(cutoverAt);
}

function sourceStats(rows, rejectedRows, source, total, cutoverAt) {
  const scoped = rows.filter((r) => r.source === source);
  const rejectedScoped = rejectedRows.filter((r) => r.source === source);
  const baselineRows = scoped.filter((r) => structuralPreCutoff(r, cutoverAt));
  const waitlistMatched = baselineRows.filter((r) => r.properties.waitlist_match === true && r.properties.waitlist_bypassed === false).length;
  const waitlistBypassed = baselineRows.filter((r) => r.properties.waitlist_match === false && r.properties.waitlist_bypassed === true).length;
  return {
    baseline_pre_cutoff: baselineRows.length,
    eligible: scoped.filter((r) => r.eligible).length,
    total,
    rejected: rejectedScoped.length,
    deferred_48h: rejectedScoped.filter((r) => r.defer_reason === 'timestamp_within_48_hours').length,
    post_cutoff: rejectedScoped.filter((r) => r.defer_reason === 'at_or_after_cutover').length,
    malformed: rejectedScoped.filter((r) => ['missing_source_pk', 'missing_distinct_id', 'invalid_timestamp', 'duplicate_source_pk'].includes(r.defer_reason)).length,
    waitlist_matched: waitlistMatched,
    waitlist_bypassed: waitlistBypassed,
    waitlist_unlinked: baselineRows.length - waitlistMatched - waitlistBypassed,
  };
}

function batchEventForRow(row) {
  return {
    uuid: row.uuid,
    event: row.event,
    timestamp: row.timestamp,
    properties: row.properties,
  };
}

function safeArtifactText(file, text) {
  const normalized = file === 'batch.json' ? text.replace(/"api_key":\s*"dry-run"/g, '') : text;
  if (SENSITIVE_ARTIFACT_RE.test(normalized)) {
    throw new Error(`PII/token safety scan failed for ${file}`);
  }
}

function writeArtifactFile(stagingDir, file, text) {
  safeArtifactText(file, text);
  fs.writeFileSync(path.join(stagingDir, file), text);
  return { sha256: sha256(text), bytes: Buffer.byteLength(text) };
}

function finalGateSummary({ artifactMode, now, cutoverAt, d1Stats, railwayWaitlistStats, profileStats, coverageError }) {
  const historicalSendReadyAt = new Date(Date.parse(cutoverAt) + FORTY_EIGHT_HOURS_MS).toISOString();
  const actual = {
    matched: profileStats.waitlist_matched,
    bypassed: profileStats.waitlist_bypassed,
    unlinked: profileStats.waitlist_unlinked,
  };
  const gate = {
    artifact_mode: artifactMode,
    expected_linkage: { ...FINAL_LINKAGE_BASELINE },
    actual_linkage: actual,
    ready: artifactMode !== 'final',
    error: null,
  };
  if (artifactMode !== 'final') return { gate, error: null, historicalSendReadyAt };

  const errors = [];
  if (Date.parse(now) < Date.parse(historicalSendReadyAt)) {
    errors.push(`final dry-run gate blocked until historical_send_ready_at ${historicalSendReadyAt}`);
  }
  if (
    d1Stats.eligible !== APPROVED_BASELINE.d1Waitlist
    || railwayWaitlistStats.eligible !== APPROVED_BASELINE.railwayWaitlist
    || d1Stats.eligible + railwayWaitlistStats.eligible !== APPROVED_BASELINE.totalWaitlist
    || profileStats.eligible !== APPROVED_BASELINE.railwayProfiles
  ) {
    errors.push(`final dry-run gate blocked: expected eligible D1=${APPROVED_BASELINE.d1Waitlist}, Railway waitlist=${APPROVED_BASELINE.railwayWaitlist}, total waitlist=${APPROVED_BASELINE.totalWaitlist}, profiles=${APPROVED_BASELINE.railwayProfiles}; got D1=${d1Stats.eligible}, Railway waitlist=${railwayWaitlistStats.eligible}, total waitlist=${d1Stats.eligible + railwayWaitlistStats.eligible}, profiles=${profileStats.eligible}`);
  }
  if (actual.matched !== FINAL_LINKAGE_BASELINE.matched || actual.bypassed !== FINAL_LINKAGE_BASELINE.bypassed) {
    errors.push(`final linkage mismatch: expected matched=${FINAL_LINKAGE_BASELINE.matched} bypassed=${FINAL_LINKAGE_BASELINE.bypassed}, got matched=${actual.matched} bypassed=${actual.bypassed}`);
  }
  if (coverageError) errors.push(coverageError);
  gate.ready = errors.length === 0;
  gate.error = errors.length ? errors.join('; ') : null;
  return { gate, error: gate.error, historicalSendReadyAt };
}

async function buildDryRun({
  d1WaitlistJson,
  railwayWaitlistJson,
  railwayProfilesJson,
  railwayUvLeadsJson,
  artifactRoot,
  artifactRunId,
  artifactMode = 'rehearsal',
  cutoverAt,
  cutoverSource,
  now,
}) {
  const normalizedCutoverAt = requireIso(cutoverAt, 'cutoverAt');
  const normalizedNow = requireIso(now, 'now');
  const mode = artifactMode === 'final' ? 'final' : 'rehearsal';
  const runId = artifactRunId || deriveArtifactRunId(normalizedCutoverAt, mode);
  const d1Rows = readJson(d1WaitlistJson);
  const railwayWaitlistRows = readJson(railwayWaitlistJson);
  const profileRows = readJson(railwayProfilesJson);
  const uvRows = railwayUvLeadsJson ? readJson(railwayUvLeadsJson) : [];
  const { artifactDir, stagingDir } = createArtifactDirs(artifactRoot, runId);
  const context = { now: normalizedNow, cutoverAt: normalizedCutoverAt, cutoverSource, artifactMode: mode };
  const uvLeadByClerkId = buildUvLeadMap(uvRows);
  const rows = [
    ...canonicalSourceRows(d1Rows, 'id').map((row) => manifestRowForD1Lead(row, context)),
    ...canonicalSourceRows(railwayWaitlistRows, 'id').map((row) => manifestRowForRailwayWaitlistLead(row, context)),
    ...canonicalSourceRows(profileRows, 'user_id').map((row) => manifestRowForRailwayProfile(row, context, uvLeadByClerkId)),
  ];
  const sourceIntegrityError = applyDuplicateSourcePkRejects(rows).join('; ') || null;
  const eligibleRows = rows.filter((row) => row.eligible);
  const rejectedRows = rows.filter((row) => !row.eligible);
  const d1Stats = sourceStats(rows, rejectedRows, 'glowlytics_d1_waitlist', d1Rows.length, normalizedCutoverAt);
  const railwayWaitlistStats = sourceStats(rows, rejectedRows, 'glowlytics_railway_waitlist', railwayWaitlistRows.length, normalizedCutoverAt);
  const profileStats = sourceStats(rows, rejectedRows, 'glowlytics_railway_user_profiles', profileRows.length, normalizedCutoverAt);
  const coverageError = approvedSourceCoverageError(d1Stats.baseline_pre_cutoff, railwayWaitlistStats.baseline_pre_cutoff, profileStats.baseline_pre_cutoff);
  const { gate: finalGate, error: finalGateError, historicalSendReadyAt } = finalGateSummary({
    artifactMode: mode,
    now: normalizedNow,
    cutoverAt: normalizedCutoverAt,
    d1Stats,
    railwayWaitlistStats,
    profileStats,
    coverageError: coverageError || sourceIntegrityError,
  });

  const manifestText = rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
  const rejectsText = rejectedRows.map((row) => JSON.stringify(row)).join('\n') + (rejectedRows.length ? '\n' : '');
  const batchText = JSON.stringify({
    api_key: 'dry-run',
    historical_migration: true,
    batch: eligibleRows.map(batchEventForRow),
  }, null, 2);
  const summary = {
    schema_version: SCHEMA_VERSION,
    artifact_mode: mode,
    live_send_enabled: false,
    artifact_root: artifactRoot,
    artifact_dir: artifactDir,
    artifact_run_id: runId,
    cutover_at: normalizedCutoverAt,
    source_cutoff_at: normalizedCutoverAt,
    cutover_source: cutoverSource,
    sources: {
      glowlytics_d1_waitlist: d1Stats,
      glowlytics_railway_waitlist: railwayWaitlistStats,
      glowlytics_railway_user_profiles: profileStats,
      glowlytics_railway_uv_leads: {
        enrichment_rows: uvRows.length,
        deterministic_profile_matches: profileStats.waitlist_matched,
      },
    },
    waitlist_sources: {
      d1_waitlist: d1Stats.eligible,
      railway_waitlist: railwayWaitlistStats.eligible,
      total_waitlist: d1Stats.eligible + railwayWaitlistStats.eligible,
    },
    source_coverage: {
      glowlytics_d1_waitlist: '4 verified pre-cutover Cloudflare D1 waitlist rows expected',
      glowlytics_railway_waitlist: '36 verified pre-cutover Railway waitlist rows expected',
      glowlytics_railway_user_profiles: '142 verified pre-cutover Railway profiles expected',
      glowlytics_railway_uv_leads: 'verified current source has 0 UV enrichment rows; deterministic UV links are required for any historical account match flags',
    },
    unique_lead_semantics: 'one waitlist_submitted per pre-cutover source waitlist.id row; D1 identities use glowlytics:lead:d1:<id>, Railway waitlist identities use glowlytics:lead:railway:<id>; no inferred cross-source joins or dedupe; no synthetic waitlist events for profile accounts',
    account_delivery_contract: 'forward account_created waits for conclusive matched or unmatched reconciliation before freezing UUID/original timestamp/canonical distinct_id/PII-free properties; unavailable lookup never becomes bypass; historical rows remain strictly before the cutover and use deterministic UUIDv5',
    approved_baseline: { d1_waitlist: APPROVED_BASELINE.d1Waitlist, railway_waitlist: APPROVED_BASELINE.railwayWaitlist, total_waitlist: APPROVED_BASELINE.totalWaitlist, railway_profiles: APPROVED_BASELINE.railwayProfiles, uv_matches: APPROVED_BASELINE.uvMatches },
    coverage_check: 'structurally valid source rows with timestamp < cutover must equal approved baseline before rollout; 48-hour deferrals, post-cutoff rows, and malformed rejects are reported separately for reviewed reconciliation',
    historical_send_ready_at: historicalSendReadyAt,
    deferred_48h: rejectedRows.filter((row) => row.defer_reason === 'timestamp_within_48_hours').length,
    final_gate: finalGate,
    coverage_error: coverageError,
    source_integrity_error: sourceIntegrityError,
    batch_events: eligibleRows.length,
    rejects: rejectedRows.length,
  };
  const summaryText = JSON.stringify(summary, null, 2);

  const files = {
    'manifest.jsonl': writeArtifactFile(stagingDir, 'manifest.jsonl', manifestText),
    'rejects.jsonl': writeArtifactFile(stagingDir, 'rejects.jsonl', rejectsText),
    'batch.json': writeArtifactFile(stagingDir, 'batch.json', batchText),
    'summary.json': writeArtifactFile(stagingDir, 'summary.json', summaryText),
  };
  const checksumsText = JSON.stringify({
    schema_version: SCHEMA_VERSION,
    algorithm: 'sha256',
    files,
  }, null, 2);
  writeArtifactFile(stagingDir, 'checksums.json', checksumsText);
  fs.renameSync(stagingDir, artifactDir);

  if (sourceIntegrityError) throw new Error(sourceIntegrityError);
  if (coverageError) throw new Error(coverageError);
  if (finalGateError) throw new Error(finalGateError);
  return summary;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    args[key.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return args;
}

if (require.main === module) {
  Promise.resolve().then(async () => {
    const args = parseArgs(process.argv.slice(2));
    if (!args['dry-run']) throw new Error('Only --dry-run is supported; this CLI never sends historical events.');
    const cutoverAt = args['cutover-at'] || process.env.GLOWLYTICS_CUTOVER_AT;
    if (!cutoverAt) throw new Error('GLOWLYTICS_CUTOVER_AT is required; capture the actual forward-enable timestamp once and pass it through this importer.');
    const normalizedCutoverAt = requireIso(cutoverAt, 'GLOWLYTICS_CUTOVER_AT');
    const artifactMode = args.final ? 'final' : 'rehearsal';
    const cutoverSource = args['cutover-source'] || `glowlytics-forward-enable:${normalizedCutoverAt}`;
    const summary = await buildDryRun({
      d1WaitlistJson: args['d1-waitlist-json'],
      railwayWaitlistJson: args['railway-waitlist-json'],
      railwayProfilesJson: args['railway-profiles-json'],
      railwayUvLeadsJson: args['railway-uv-leads-json'],
      artifactRoot: args['artifact-root'],
      artifactRunId: args['artifact-run-id'] || deriveArtifactRunId(normalizedCutoverAt, artifactMode),
      artifactMode,
      cutoverAt: normalizedCutoverAt,
      cutoverSource,
      now: args.now || new Date().toISOString(),
    });
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  }).catch((err) => {
    process.stderr.write(`${err && err.message ? err.message : err}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  deriveArtifactRunId,
  deterministicUuidV5,
  manifestRowForD1Lead,
  manifestRowForRailwayWaitlistLead,
  manifestRowForRailwayProfile,
  buildDryRun,
};
