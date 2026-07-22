const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  buildDryRun,
  deriveArtifactRunId,
  deterministicUuidV5,
  manifestRowForD1Lead,
  manifestRowForRailwayWaitlistLead,
  manifestRowForRailwayProfile,
} = require('../scripts/posthog-backfill-glowlytics');

const SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'posthog-backfill-glowlytics.js');
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'posthog-backfill-glowlytics');
const CUTOVER_AT = '2026-07-20T12:00:00.000Z';
const SEND_READY_NOW = '2026-07-23T12:00:00.000Z';
const REHEARSAL_NOW = '2026-07-21T00:00:00.000Z';
const ORIGINAL_TZ = process.env.TZ;

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'glowlytics-posthog-backfill-'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readJsonl(file) {
  const text = fs.readFileSync(file, 'utf8').trim();
  return text ? text.split('\n').map((line) => JSON.parse(line)) : [];
}

function artifactText(artifactDir) {
  const files = ['manifest.jsonl', 'batch.json', 'summary.json', 'rejects.jsonl', 'checksums.json'];
  return Object.fromEntries(files.map((file) => [file, fs.readFileSync(path.join(artifactDir, file), 'utf8')]));
}

function expectNoSensitiveMaterial(text) {
  expect(text).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  expect(text).not.toMatch(/phc_|POSTHOG_API_KEY|sent_at|Bearer|secret|api_key=|token=|access_token|refresh_token/i);
}

function d1Rows(count = 4) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    email: `d1lead${i + 1}@example.invalid`,
    created_at: `2026-06-${String((i % 4) + 1).padStart(2, '0')}T10:00:00.000Z`,
    source: i % 2 === 0 ? 'hero' : 'footer',
    posthog_distinct_id: `d1-browser-${i + 1}`,
    acquisition_source: i % 2 === 0 ? 'google' : 'unknown',
    acquisition_medium: i % 2 === 0 ? 'paid_search' : 'unknown',
    attribution_quality: 'backfilled',
    landing_path: i % 2 === 0 ? '/' : '/uv-scan',
  }));
}

function railwayWaitlistRows(count = 36) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    email: `railwaylead${i + 1}@example.invalid`,
    created_at: `2026-06-${String((i % 18) + 1).padStart(2, '0')}T10:30:00.000Z`,
    source: i % 2 === 0 ? 'landing' : 'uv-scan-web',
    posthog_distinct_id: `railway-browser-${i + 1}`,
    acquisition_source: i % 3 === 0 ? 'instagram' : 'unknown',
    acquisition_medium: i % 3 === 0 ? 'paid_social' : 'unknown',
    attribution_quality: 'backfilled',
    landing_path: i % 2 === 0 ? '/' : '/uv-scan',
  }));
}

function profileRows(count = 142) {
  return Array.from({ length: count }, (_, i) => ({
    user_id: `user_${String(i + 1).padStart(4, '0')}`,
    created_at: `2026-06-${String((i % 20) + 1).padStart(2, '0')}T12:00:00.000Z`,
  }));
}

function uvLeadRowsForMatchedProfiles(count = 1) {
  return Array.from({ length: count }, (_, i) => ({
    id: `uv_${String(i + 1).padStart(4, '0')}`,
    email: `uv${i + 1}@example.invalid`,
    clerk_user_id: `user_${String(i + 1).padStart(4, '0')}`,
    created_at: `2026-06-${String(i + 1).padStart(2, '0')}T11:00:00.000Z`,
    source: i % 2 === 0 ? 'hero' : 'footer',
    acquisition_source: i % 2 === 0 ? 'google' : 'instagram',
    acquisition_medium: i % 2 === 0 ? 'paid_search' : 'paid_social',
    attribution_quality: 'utm',
    landing_path: '/uv-scan',
  }));
}

function shuffledRows(rows) {
  const odds = rows.filter((_, i) => i % 2 === 1).reverse();
  const evens = rows.filter((_, i) => i % 2 === 0).reverse();
  return [...odds, ...evens];
}

function writeInputs(dir, { d1 = d1Rows(4), railwayWaitlist = railwayWaitlistRows(36), profiles = profileRows(142), uv = [] } = {}) {
  const d1File = path.join(dir, 'd1.json');
  const railwayWaitlistFile = path.join(dir, 'railway-waitlist.json');
  const profilesFile = path.join(dir, 'profiles.json');
  const uvFile = path.join(dir, 'uv.json');
  writeJson(d1File, d1);
  writeJson(railwayWaitlistFile, railwayWaitlist);
  writeJson(profilesFile, profiles);
  writeJson(uvFile, uv);
  return { d1File, railwayWaitlistFile, profilesFile, uvFile };
}

async function buildFixtureRun(dir, overrides = {}) {
  const { d1File, railwayWaitlistFile, profilesFile, uvFile } = writeInputs(dir, overrides.inputs || {});
  return buildDryRun({
    d1WaitlistJson: d1File,
    railwayWaitlistJson: railwayWaitlistFile,
    railwayProfilesJson: profilesFile,
    railwayUvLeadsJson: uvFile,
    artifactRoot: dir,
    artifactRunId: overrides.artifactRunId || 'test-run',
    artifactMode: overrides.artifactMode || 'rehearsal',
    cutoverAt: overrides.cutoverAt || CUTOVER_AT,
    cutoverSource: overrides.cutoverSource || 'unit-test-cutover',
    now: overrides.now || REHEARSAL_NOW,
  });
}

afterEach(() => {
  delete process.env.POSTHOG_API_KEY;
  delete global.fetch;
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

test('fixture files are compact and PII-free', () => {
  for (const file of ['d1-waitlist.json', 'railway-waitlist.json', 'railway-user-profiles.json', 'railway-uv-leads.json']) {
    const text = fs.readFileSync(path.join(FIXTURE_DIR, file), 'utf8');
    expect(JSON.parse(text)).toHaveLength(1);
    expectNoSensitiveMaterial(text);
  }
});

test('dry run writes 4 D1 waitlist, 36 Railway waitlist, and 142 Railway profile events without sending live imports', async () => {
  const dir = tempDir();
  process.env.POSTHOG_API_KEY = 'phc_live_key_must_not_leak';
  global.fetch = jest.fn();

  const summary = await buildFixtureRun(dir);

  const artifactDir = path.join(dir, 'test-run');
  const batch = readJson(path.join(artifactDir, 'batch.json'));
  const manifest = readJsonl(path.join(artifactDir, 'manifest.jsonl'));
  const checksums = readJson(path.join(artifactDir, 'checksums.json'));
  const waitlistEvents = batch.batch.filter((event) => event.event === 'waitlist_submitted');
  const accountEvents = batch.batch.filter((event) => event.event === 'account_created');

  expect(summary.sources.glowlytics_d1_waitlist.eligible).toBe(4);
  expect(summary.sources.glowlytics_railway_waitlist.eligible).toBe(36);
  expect(summary.sources.glowlytics_railway_user_profiles.eligible).toBe(142);
  expect(summary.waitlist_sources).toEqual({ d1_waitlist: 4, railway_waitlist: 36, total_waitlist: 40 });
  expect(summary.live_send_enabled).toBe(false);
  expect(summary.artifact_mode).toBe('rehearsal');
  expect(batch.historical_migration).toBe(true);
  expect(batch.sent_at).toBeUndefined();
  expect(batch.api_key).toBe('dry-run');
  expect(batch.batch).toHaveLength(182);
  expect(waitlistEvents).toHaveLength(40);
  expect(accountEvents).toHaveLength(142);
  expect(waitlistEvents.filter((event) => event.properties.distinct_id.startsWith('glowlytics:lead:d1:'))).toHaveLength(4);
  expect(waitlistEvents.filter((event) => event.properties.distinct_id.startsWith('glowlytics:lead:railway:'))).toHaveLength(36);
  expect(manifest).toHaveLength(182);
  expect(Object.keys(manifest[0])).toEqual([
    'schema_version', 'source', 'source_table', 'source_pk', 'event', 'product',
    'distinct_id', 'timestamp', 'uuid', 'properties', 'eligible', 'defer_reason',
    'cutover_at', 'cutover_source',
  ]);
  expect(Object.keys(checksums.files).sort()).toEqual(['batch.json', 'manifest.jsonl', 'rejects.jsonl', 'summary.json']);
  for (const file of Object.values(checksums.files)) {
    expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(file.bytes).toBeGreaterThanOrEqual(0);
  }
  for (const text of Object.values(artifactText(artifactDir))) expectNoSensitiveMaterial(text);
  expect(global.fetch).not.toHaveBeenCalled();
  expect(summary.artifact_dir).toBe(artifactDir);
  expect(summary.cutover_at).toBe(CUTOVER_AT);
  expect(summary.source_cutoff_at).toBe(CUTOVER_AT);
  expect(summary.cutover_source).toBe('unit-test-cutover');
  expect(summary.approved_baseline).toEqual({ d1_waitlist: 4, railway_waitlist: 36, total_waitlist: 40, railway_profiles: 142, uv_matches: 0 });
  expect(summary.coverage_check).toMatch(/reviewed reconciliation/);
  expect(deriveArtifactRunId(CUTOVER_AT)).toBe('lane-b-20260720120000Z');
});

test('repeated identical inputs produce byte-identical artifacts', async () => {
  const dir = tempDir();
  await buildFixtureRun(dir, { artifactRunId: 'stable-run', now: SEND_READY_NOW });
  const artifactDir = path.join(dir, 'stable-run');
  const first = artifactText(artifactDir);
  fs.rmSync(artifactDir, { recursive: true, force: true });

  await buildFixtureRun(dir, { artifactRunId: 'stable-run', now: SEND_READY_NOW });
  const second = artifactText(artifactDir);

  expect(second).toEqual(first);
});

test('naive Railway timestamps are interpreted as UTC under a non-UTC timezone', () => {
  process.env.TZ = 'America/Denver';
  const row = manifestRowForRailwayProfile(
    { user_id: 'user_naive', created_at: '2026-03-17T11:50:54.314369' },
    { now: SEND_READY_NOW, cutoverAt: CUTOVER_AT, cutoverSource: 'unit-test-cutover' },
    new Map()
  );
  const offsetRow = manifestRowForRailwayProfile(
    { user_id: 'user_offset', created_at: '2026-03-17T11:50:54.314369+02:30' },
    { now: SEND_READY_NOW, cutoverAt: CUTOVER_AT, cutoverSource: 'unit-test-cutover' },
    new Map()
  );

  expect(row.timestamp).toBe('2026-03-17T11:50:54.314Z');
  expect(offsetRow.timestamp).toBe('2026-03-17T09:20:54.314Z');
});

test('backfill preserves facebook attribution and explicit paid-social medium', () => {
  const context = { now: SEND_READY_NOW, cutoverAt: CUTOVER_AT, cutoverSource: 'unit-test-cutover' };
  const leadRow = manifestRowForRailwayWaitlistLead({
    id: 101,
    created_at: '2026-06-01T10:30:00.000Z',
    acquisition_source: 'facebook',
    acquisition_medium: 'paid_social',
    attribution_quality: 'utm',
    utm_source: 'facebook',
    referrer_host: 'https://www.facebook.com/',
  }, context);
  const accountRow = manifestRowForRailwayProfile(
    { user_id: 'user_facebook', created_at: '2026-06-01T12:00:00.000Z' },
    context,
    new Map([['user_facebook', {
      id: 'uv_facebook',
      created_at: '2026-06-01T11:00:00.000Z',
      acquisition_source: 'facebook',
      acquisition_medium: 'paid_social',
      attribution_quality: 'utm',
      utm_source: 'facebook',
      referrer_host: 'm.facebook.com',
      source: 'hero',
    }]])
  );

  expect(leadRow.properties).toEqual(expect.objectContaining({
    acquisition_source: 'facebook',
    acquisition_medium: 'paid_social',
    attribution_quality: 'utm',
    utm_source: 'facebook',
    referrer_host: 'www.facebook.com',
  }));
  expect(accountRow.properties).toEqual(expect.objectContaining({
    acquisition_source: 'facebook',
    acquisition_medium: 'paid_social',
    attribution_quality: 'utm',
    utm_source: 'facebook',
    referrer_host: 'm.facebook.com',
    waitlist_match: true,
    waitlist_bypassed: false,
  }));
});

test('naive source timestamps produce byte-identical artifacts under UTC and non-UTC timezones', async () => {
  const dir = tempDir();
  const d1 = d1Rows(4);
  const railwayWaitlist = railwayWaitlistRows(36);
  const profiles = profileRows(142);
  d1[0] = { ...d1[0], created_at: '2026-03-17T11:45:54.314369' };
  railwayWaitlist[0] = { ...railwayWaitlist[0], created_at: '2026-03-17T11:47:54.314369' };
  profiles[0] = { ...profiles[0], created_at: '2026-03-17T11:50:54.314369' };

  process.env.TZ = 'UTC';
  await buildFixtureRun(dir, {
    artifactRunId: 'timezone-stable-run',
    now: SEND_READY_NOW,
    inputs: { d1, railwayWaitlist, profiles, uv: [] },
  });
  const artifactDir = path.join(dir, 'timezone-stable-run');
  const utc = artifactText(artifactDir);
  fs.rmSync(artifactDir, { recursive: true, force: true });

  process.env.TZ = 'America/Denver';
  await buildFixtureRun(dir, {
    artifactRunId: 'timezone-stable-run',
    now: SEND_READY_NOW,
    inputs: { d1, railwayWaitlist, profiles, uv: [] },
  });
  const nonUtc = artifactText(artifactDir);

  expect(nonUtc).toEqual(utc);
});

test('shuffled source inputs produce byte-identical artifacts after canonical ordering', async () => {
  const dir = tempDir();
  await buildFixtureRun(dir, { artifactRunId: 'canonical-order-run', now: SEND_READY_NOW });
  const artifactDir = path.join(dir, 'canonical-order-run');
  const ordered = artifactText(artifactDir);
  fs.rmSync(artifactDir, { recursive: true, force: true });

  await buildFixtureRun(dir, {
    artifactRunId: 'canonical-order-run',
    now: SEND_READY_NOW,
    inputs: {
      d1: shuffledRows(d1Rows(4)),
      railwayWaitlist: shuffledRows(railwayWaitlistRows(36)),
      profiles: shuffledRows(profileRows(142)),
      uv: shuffledRows([]),
    },
  });
  const shuffled = artifactText(artifactDir);

  expect(shuffled).toEqual(ordered);
});

test('dry run fails source coverage when reviewed D1 pre-cutover total changes after writing diagnostics', async () => {
  const dir = tempDir();

  await expect(buildFixtureRun(dir, {
    artifactRunId: 'd1-mismatch-run',
    inputs: { d1: d1Rows(3), railwayWaitlist: railwayWaitlistRows(36), profiles: profileRows(142), uv: [] },
  })).rejects.toThrow(/source coverage mismatch.*D1=4.*Railway waitlist=36.*profiles=142/);

  const mismatchSummary = readJson(path.join(dir, 'd1-mismatch-run', 'summary.json'));
  expect(mismatchSummary.coverage_error).toMatch(/source coverage mismatch/);
});

test('dry run fails source coverage when reviewed Railway waitlist pre-cutover total changes after writing diagnostics', async () => {
  const dir = tempDir();

  await expect(buildFixtureRun(dir, {
    artifactRunId: 'railway-waitlist-mismatch-run',
    inputs: { d1: d1Rows(4), railwayWaitlist: railwayWaitlistRows(35), profiles: profileRows(142), uv: [] },
  })).rejects.toThrow(/source coverage mismatch.*D1=4.*Railway waitlist=36.*profiles=142/);

  const mismatchSummary = readJson(path.join(dir, 'railway-waitlist-mismatch-run', 'summary.json'));
  expect(mismatchSummary.coverage_error).toMatch(/source coverage mismatch/);
});

test('duplicate D1 waitlist ids become deterministic rejects and cannot satisfy the 4-row subsource gate', async () => {
  const dir = tempDir();
  const duplicatedD1 = d1Rows(4);
  duplicatedD1[3] = { ...duplicatedD1[3], id: 1 };

  await expect(buildFixtureRun(dir, {
    artifactRunId: 'duplicate-d1-run',
    inputs: { d1: duplicatedD1, railwayWaitlist: railwayWaitlistRows(36), profiles: profileRows(142), uv: [] },
  })).rejects.toThrow(/duplicate source primary key.*glowlytics_d1_waitlist.*1/);

  const summary = readJson(path.join(dir, 'duplicate-d1-run', 'summary.json'));
  const rejects = readJsonl(path.join(dir, 'duplicate-d1-run', 'rejects.jsonl'));
  expect(summary.source_integrity_error).toMatch(/duplicate source primary key.*glowlytics_d1_waitlist.*1/);
  expect(summary.sources.glowlytics_d1_waitlist.baseline_pre_cutoff).toBe(3);
  expect(summary.sources.glowlytics_d1_waitlist.eligible).toBe(3);
  expect(rejects).toEqual(expect.arrayContaining([
    expect.objectContaining({ source: 'glowlytics_d1_waitlist', source_pk: '1', eligible: false, defer_reason: 'duplicate_source_pk', uuid: null }),
  ]));
});

test('duplicate Railway waitlist ids become deterministic rejects and cannot satisfy the 36-row subsource gate', async () => {
  const dir = tempDir();
  const duplicatedRailwayWaitlist = railwayWaitlistRows(36);
  duplicatedRailwayWaitlist[35] = { ...duplicatedRailwayWaitlist[35], id: 1 };

  await expect(buildFixtureRun(dir, {
    artifactRunId: 'duplicate-railway-waitlist-run',
    inputs: { d1: d1Rows(4), railwayWaitlist: duplicatedRailwayWaitlist, profiles: profileRows(142), uv: [] },
  })).rejects.toThrow(/duplicate source primary key.*glowlytics_railway_waitlist.*1/);

  const summary = readJson(path.join(dir, 'duplicate-railway-waitlist-run', 'summary.json'));
  const rejects = readJsonl(path.join(dir, 'duplicate-railway-waitlist-run', 'rejects.jsonl'));
  expect(summary.source_integrity_error).toMatch(/duplicate source primary key.*glowlytics_railway_waitlist.*1/);
  expect(summary.sources.glowlytics_railway_waitlist.baseline_pre_cutoff).toBe(35);
  expect(summary.sources.glowlytics_railway_waitlist.eligible).toBe(35);
  expect(rejects).toEqual(expect.arrayContaining([
    expect.objectContaining({ source: 'glowlytics_railway_waitlist', source_pk: '1', eligible: false, defer_reason: 'duplicate_source_pk', uuid: null }),
  ]));
});

test('duplicate Railway profile user_ids become deterministic rejects and cannot satisfy the 142-row gate', async () => {
  const dir = tempDir();
  const duplicatedProfiles = profileRows(142);
  duplicatedProfiles[141] = { ...duplicatedProfiles[141], user_id: 'user_0001' };

  await expect(buildFixtureRun(dir, {
    artifactRunId: 'duplicate-profile-run',
    inputs: { d1: d1Rows(4), railwayWaitlist: railwayWaitlistRows(36), profiles: duplicatedProfiles, uv: [] },
  })).rejects.toThrow(/duplicate source primary key.*glowlytics_railway_user_profiles.*user_0001/);

  const summary = readJson(path.join(dir, 'duplicate-profile-run', 'summary.json'));
  const rejects = readJsonl(path.join(dir, 'duplicate-profile-run', 'rejects.jsonl'));
  expect(summary.source_integrity_error).toMatch(/duplicate source primary key.*glowlytics_railway_user_profiles.*user_0001/);
  expect(summary.sources.glowlytics_railway_user_profiles.baseline_pre_cutoff).toBe(141);
  expect(summary.sources.glowlytics_railway_user_profiles.eligible).toBe(141);
  expect(rejects).toEqual(expect.arrayContaining([
    expect.objectContaining({ source: 'glowlytics_railway_user_profiles', source_pk: 'user_0001', eligible: false, defer_reason: 'duplicate_source_pk', uuid: null }),
  ]));
});

test('manifest rows use opaque D1 lead identities, UUIDv5 is stable, and properties omit email', () => {
  const row = manifestRowForD1Lead(d1Rows(1)[0], { now: REHEARSAL_NOW, cutoverAt: CUTOVER_AT, cutoverSource: 'unit-test-cutover' });
  expect(row.source).toBe('glowlytics_d1_waitlist');
  expect(row.distinct_id).toBe('glowlytics:lead:d1:1');
  expect(row.uuid).toBe(deterministicUuidV5('glowlytics|glowlytics_d1_waitlist|1|waitlist_submitted'));
  expect(JSON.stringify(row.properties)).not.toMatch(/d1lead1@example\.invalid/);
  expect(row.properties.product).toBe('glowlytics');
  expect(row.properties.historical_backfill).toBe(true);
});

test('manifest rows use opaque Railway waitlist lead identities and do not dedupe against D1 ids', () => {
  const d1 = manifestRowForD1Lead(d1Rows(1)[0], { now: REHEARSAL_NOW, cutoverAt: CUTOVER_AT, cutoverSource: 'unit-test-cutover' });
  const railway = manifestRowForRailwayWaitlistLead(railwayWaitlistRows(1)[0], { now: REHEARSAL_NOW, cutoverAt: CUTOVER_AT, cutoverSource: 'unit-test-cutover' });
  expect(railway.source).toBe('glowlytics_railway_waitlist');
  expect(railway.distinct_id).toBe('glowlytics:lead:railway:1');
  expect(railway.uuid).toBe(deterministicUuidV5('glowlytics|glowlytics_railway_waitlist|1|waitlist_submitted'));
  expect(railway.uuid).not.toBe(d1.uuid);
  expect(JSON.stringify(railway.properties)).not.toMatch(/railwaylead1@example\.invalid/);
});

test('historical Railway profiles omit waitlist booleans when no deterministic UV lead exists', () => {
  const row = manifestRowForRailwayProfile(profileRows(1)[0], { now: REHEARSAL_NOW, cutoverAt: CUTOVER_AT, cutoverSource: 'unit-test-cutover' }, new Map());
  expect(row.event).toBe('account_created');
  expect(row.distinct_id).toBe('glowlytics:user:user_0001');
  expect(row.properties.waitlist_match).toBeUndefined();
  expect(row.properties.waitlist_bypassed).toBeUndefined();
  expect(row.properties.acquisition_source).toBe('unknown');
  expect(row.properties.acquisition_medium).toBe('unknown');
});

test('historical Railway profiles set match flags only for deterministic UV lead matches and sanitize enrichment', () => {
  const uvLeadByClerkId = new Map([
    ['other_user', { clerk_user_id: 'other_user', source: 'footer', acquisition_source: 'instagram', acquisition_medium: 'paid_social' }],
    ['user_0001', {
      clerk_user_id: 'user_0001',
      email: 'lead@example.invalid',
      source: 'hero',
      acquisition_source: 'google',
      acquisition_medium: 'paid_search',
      utm_campaign: 'api_key=secret',
      utm_term: 'UV Interest',
      utm_content: 'lead@example.invalid',
      referrer_host: 'https://www.google.com/search?q=secret',
      landing_path: '/uv-scan?email=lead@example.invalid',
    }],
  ]);
  const row = manifestRowForRailwayProfile(profileRows(1)[0], { now: REHEARSAL_NOW, cutoverAt: CUTOVER_AT, cutoverSource: 'unit-test-cutover' }, uvLeadByClerkId);
  expect(row.properties.waitlist_match).toBe(true);
  expect(row.properties.waitlist_bypassed).toBe(false);
  expect(row.properties.form_placement).toBe('hero');
  expect(row.properties.acquisition_source).toBe('google');
  expect(row.properties.acquisition_medium).toBe('paid_search');
  expect(row.properties.utm_campaign).toBeNull();
  expect(row.properties.utm_term).toBe('UV Interest');
  expect(row.properties.utm_content).toBeNull();
  expect(row.properties.referrer_host).toBe('www.google.com');
  expect(row.properties.landing_path).toBe('/uv-scan');
  expect(JSON.stringify(row.properties)).not.toMatch(/lead@example\.invalid|api_key|secret|other_user/);
});

test('final artifact mode enforces 4/36/142/0-match gates with all profiles unlinked', async () => {
  const dir = tempDir();
  const summary = await buildFixtureRun(dir, {
    artifactRunId: 'final-run',
    artifactMode: 'final',
    now: SEND_READY_NOW,
  });

  const batch = readJson(path.join(dir, 'final-run', 'batch.json'));
  const waitlistEvents = batch.batch.filter((event) => event.event === 'waitlist_submitted');
  const accountEvents = batch.batch.filter((event) => event.event === 'account_created');
  const unlinkedAccounts = accountEvents.filter((event) => !Object.prototype.hasOwnProperty.call(event.properties, 'waitlist_match') && !Object.prototype.hasOwnProperty.call(event.properties, 'waitlist_bypassed'));

  expect(summary.final_gate.ready).toBe(true);
  expect(summary.final_gate.expected_linkage).toEqual({ matched: 0, bypassed: 0 });
  expect(summary.sources.glowlytics_d1_waitlist.eligible).toBe(4);
  expect(summary.sources.glowlytics_railway_waitlist.eligible).toBe(36);
  expect(summary.sources.glowlytics_railway_user_profiles.eligible).toBe(142);
  expect(summary.sources.glowlytics_railway_user_profiles.waitlist_matched).toBe(0);
  expect(summary.sources.glowlytics_railway_user_profiles.waitlist_bypassed).toBe(0);
  expect(summary.sources.glowlytics_railway_user_profiles.waitlist_unlinked).toBe(142);
  expect(batch.batch).toHaveLength(182);
  expect(waitlistEvents).toHaveLength(40);
  expect(accountEvents).toHaveLength(142);
  expect(unlinkedAccounts).toHaveLength(142);
});

test('final artifact mode fails if any UV link creates a deterministic historical profile match', async () => {
  const dir = tempDir();
  await expect(buildFixtureRun(dir, {
    artifactRunId: 'unexpected-uv-match-final',
    artifactMode: 'final',
    now: SEND_READY_NOW,
    inputs: { d1: d1Rows(4), railwayWaitlist: railwayWaitlistRows(36), profiles: profileRows(142), uv: uvLeadRowsForMatchedProfiles(1) },
  })).rejects.toThrow(/final linkage mismatch.*matched=0.*bypassed=0/);

  const summary = readJson(path.join(dir, 'unexpected-uv-match-final', 'summary.json'));
  expect(summary.final_gate.actual_linkage).toEqual({ matched: 1, bypassed: 0, unlinked: 141 });
  expect(summary.sources.glowlytics_railway_uv_leads.enrichment_rows).toBe(1);
});

test('final artifact mode writes diagnostics but blocks before cutover plus 48 hours', async () => {
  const dir = tempDir();
  await expect(buildFixtureRun(dir, {
    artifactRunId: 'too-early-final',
    artifactMode: 'final',
    now: '2026-07-22T11:59:59.000Z',
  })).rejects.toThrow(/final dry-run gate blocked.*historical_send_ready_at/);

  const summary = readJson(path.join(dir, 'too-early-final', 'summary.json'));
  expect(summary.final_gate.ready).toBe(false);
  expect(summary.final_gate.error).toMatch(/historical_send_ready_at/);
});

test('manifest sanitizes attribution fields and rejects unsafe raw values', () => {
  const row = manifestRowForRailwayWaitlistLead({
    ...railwayWaitlistRows(1)[0],
    acquisition_source: 'newsletter',
    acquisition_medium: 'CPC',
    utm_source: 'Google',
    utm_campaign: 'api_key=secret',
    utm_term: 'SkinCare',
    utm_content: 'lead@example.invalid',
    referrer_host: 'https://www.google.com/search?q=secret',
    landing_path: '/uv-scan?email=lead@example.invalid',
  }, { now: REHEARSAL_NOW, cutoverAt: CUTOVER_AT, cutoverSource: 'unit-test-cutover' });
  expect(row.properties.acquisition_source).toBe('unknown');
  expect(row.properties.acquisition_medium).toBe('cpc');
  expect(row.properties.utm_source).toBe('google');
  expect(row.properties.utm_campaign).toBeNull();
  expect(row.properties.utm_term).toBe('SkinCare');
  expect(row.properties.utm_content).toBeNull();
  expect(row.properties.referrer_host).toBe('www.google.com');
  expect(row.properties.landing_path).toBe('/uv-scan');
  expect(JSON.stringify(row.properties)).not.toMatch(/lead@example\.invalid|api_key|secret/);
});

test('manifest reports missing source primary keys and invalid timestamps as rejects instead of aborting valid rows', () => {
  const d1Reject = manifestRowForD1Lead({ ...d1Rows(1)[0], id: undefined }, { now: REHEARSAL_NOW, cutoverAt: CUTOVER_AT, cutoverSource: 'unit-test-cutover' });
  const railwayReject = manifestRowForRailwayWaitlistLead({ ...railwayWaitlistRows(1)[0], id: undefined }, { now: REHEARSAL_NOW, cutoverAt: CUTOVER_AT, cutoverSource: 'unit-test-cutover' });
  const profileReject = manifestRowForRailwayProfile({ created_at: '2026-06-01T12:00:00.000Z' }, { now: REHEARSAL_NOW, cutoverAt: CUTOVER_AT, cutoverSource: 'unit-test-cutover' });
  const timestampReject = manifestRowForD1Lead({ ...d1Rows(1)[0], created_at: 'not-a-date' }, { now: REHEARSAL_NOW, cutoverAt: CUTOVER_AT, cutoverSource: 'unit-test-cutover' });
  expect(d1Reject).toEqual(expect.objectContaining({ eligible: false, defer_reason: 'missing_source_pk', uuid: null }));
  expect(railwayReject).toEqual(expect.objectContaining({ eligible: false, defer_reason: 'missing_source_pk', uuid: null }));
  expect(profileReject).toEqual(expect.objectContaining({ eligible: false, defer_reason: 'missing_source_pk', uuid: null }));
  expect(timestampReject).toEqual(expect.objectContaining({ eligible: false, defer_reason: 'invalid_timestamp', timestamp: 'not-a-date', uuid: null }));
});

test('profiles newer than the 48-hour boundary defer, and cutover overlap rows reject', () => {
  const recent = manifestRowForRailwayProfile({ user_id: 'user_recent', created_at: '2026-07-20T11:00:00.000Z' }, { now: REHEARSAL_NOW, cutoverAt: CUTOVER_AT, cutoverSource: 'unit-test-cutover' });
  const overlap = manifestRowForRailwayWaitlistLead({ ...railwayWaitlistRows(1)[0], created_at: CUTOVER_AT }, { now: REHEARSAL_NOW, cutoverAt: CUTOVER_AT, cutoverSource: 'unit-test-cutover' });
  expect(recent.eligible).toBe(false);
  expect(recent.defer_reason).toBe('timestamp_within_48_hours');
  expect(recent.timestamp).toBe('2026-07-20T11:00:00.000Z');
  expect(overlap.eligible).toBe(false);
  expect(overlap.defer_reason).toBe('at_or_after_cutover');
});

test('post-cutoff, recent, and malformed rows are reported separately while valid rows still emit artifacts', async () => {
  const dir = tempDir();
  const summary = await buildFixtureRun(dir, {
    artifactRunId: 'deferred-rejected-run',
    inputs: {
      d1: [
        ...d1Rows(3),
        { ...d1Rows(1)[0], id: 4, created_at: '2026-07-20T11:00:00.000Z' },
        { ...d1Rows(1)[0], id: 5, created_at: 'bad-timestamp' },
        { ...d1Rows(1)[0], id: 6, created_at: CUTOVER_AT },
      ],
      railwayWaitlist: railwayWaitlistRows(36),
      profiles: profileRows(142),
      uv: [],
    },
  });
  const artifactDir = path.join(dir, 'deferred-rejected-run');
  const batch = readJson(path.join(artifactDir, 'batch.json'));
  const rejects = fs.readFileSync(path.join(artifactDir, 'rejects.jsonl'), 'utf8');

  expect(summary.sources.glowlytics_d1_waitlist.baseline_pre_cutoff).toBe(4);
  expect(summary.sources.glowlytics_d1_waitlist.eligible).toBe(3);
  expect(summary.sources.glowlytics_d1_waitlist.deferred_48h).toBe(1);
  expect(summary.sources.glowlytics_d1_waitlist.malformed).toBe(1);
  expect(summary.sources.glowlytics_d1_waitlist.post_cutoff).toBe(1);
  expect(summary.deferred_48h).toBe(1);
  expect(batch.batch).toHaveLength(181);
  expect(rejects).toMatch(/timestamp_within_48_hours/);
  expect(rejects).toMatch(/invalid_timestamp/);
  expect(rejects).toMatch(/at_or_after_cutover/);
});

test('dry run refuses to overwrite an existing artifact run directory', async () => {
  const dir = tempDir();
  fs.mkdirSync(path.join(dir, 'existing-run'));
  await expect(buildFixtureRun(dir, { artifactRunId: 'existing-run' })).rejects.toThrow(/refusing to overwrite/);
});

test('CLI refuses non-dry-run mode before reading source files or live keys', () => {
  const result = spawnSync(process.execPath, [SCRIPT_PATH, '--d1-waitlist-json', 'unused'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, POSTHOG_API_KEY: 'phc_live_key_must_not_leak', GLOWLYTICS_CUTOVER_AT: CUTOVER_AT },
    encoding: 'utf8',
  });

  expect(result.status).not.toBe(0);
  expect(`${result.stdout}${result.stderr}`).toMatch(/Only --dry-run is supported/);
  expect(`${result.stdout}${result.stderr}`).not.toMatch(/phc_live_key_must_not_leak|POSTHOG_API_KEY/);
});
