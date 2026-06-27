/**
 * UV Mirror vision core — deterministic screener + analysis tests.
 *
 * All fixtures are synthetic images built with sharp so the assertions check
 * BEHAVIOUR and INVARIANTS (verdicts, ranges, mirror-correct asymmetry), not
 * exact float magnitudes.
 *
 * Coordinate reminder: "left"/"right" are the SUBJECT's anatomical sides =
 * mirror of image x. Image-left pixels (low x) belong to the subject's RIGHT.
 */

const sharp = require('sharp');
const { screenImage, analyzeUv } = require('../uv-scan');

// Build a PNG (base64) from a per-pixel colour function.
async function makeImage(width, height, pixelFn) {
  const buf = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelFn(x, y);
      const i = (y * width + x) * 3;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
    }
  }
  const png = await sharp(buf, { raw: { width, height, channels: 3 } }).png().toBuffer();
  return png.toString('base64');
}

// Uniform single-colour image via sharp({create}) (per acceptance guidance).
async function makeUniform(width, height, r, g, b) {
  const png = await sharp({
    create: { width, height, channels: 3, background: { r, g, b } },
  })
    .png()
    .toBuffer();
  return png.toString('base64');
}

const SKIN = [200, 150, 130]; // light skin tone (classified as skin)
const SKIN_PIGMENTED = [170, 120, 100]; // darker / more pigment, lower ITA
const SKIN_CLEAN = [210, 170, 150]; // lighter / less pigment, higher ITA
const BG = [60, 60, 60]; // neutral grey background (not skin)

const check = (screen, id) => screen.checks.find((c) => c.id === id);

describe('screenImage', () => {
  test('centered skin face on a neutral background passes the screener', async () => {
    // 96x112 skin block centred in a 160x160 frame -> ~0.42 coverage, symmetric.
    const img = await makeImage(160, 160, (x, y) => {
      const inFace = x >= 32 && x < 128 && y >= 24 && y < 136;
      return inFace ? SKIN : BG;
    });
    const screen = await screenImage(img);

    expect(screen.ok).toBe(true);
    expect(screen.canProceed).toBe(true);
    expect(check(screen, 'brightness').pass).toBe(true);
    expect(check(screen, 'highlight_clipping').pass).toBe(true);
    expect(check(screen, 'lighting_symmetry').pass).toBe(true);
    expect(check(screen, 'face_coverage').pass).toBe(true);
    // No landmarks -> face_angle skipped, confidence reduced.
    expect(check(screen, 'face_angle').pass).toBeNull();
    expect(check(screen, 'face_angle').message).toBe('skipped');
    expect(screen.confidence).toBeGreaterThan(0);
    expect(screen.confidence).toBeLessThan(0.9);
  });

  test('left-dark / right-bright split fails lighting_symmetry but not the hard gate', async () => {
    const img = await makeImage(120, 120, (x) => (x < 60 ? [50, 50, 50] : [200, 200, 200]));
    const screen = await screenImage(img);

    expect(check(screen, 'lighting_symmetry').pass).toBe(false);
    expect(check(screen, 'brightness').pass).toBe(true); // mean ~125, in band
    expect(check(screen, 'highlight_clipping').pass).toBe(true);
    expect(screen.canProceed).toBe(false);
    expect(screen.ok).toBe(true); // soft failure does not block analysis
  });

  test('near-black image fails the brightness hard gate', async () => {
    const img = await makeUniform(64, 64, 2, 2, 2);
    const screen = await screenImage(img);

    expect(check(screen, 'brightness').pass).toBe(false);
    expect(screen.ok).toBe(false);
    expect(screen.canProceed).toBe(false);
  });

  test('full-frame uniform skin fails face_coverage (too close)', async () => {
    const img = await makeUniform(120, 120, ...SKIN);
    const screen = await screenImage(img);

    expect(check(screen, 'face_coverage').pass).toBe(false); // ~1.0 > 0.92
    expect(check(screen, 'face_coverage').value).toBeGreaterThan(0.92);
    expect(check(screen, 'lighting_symmetry').pass).toBe(true); // symmetric
    expect(screen.canProceed).toBe(false);
  });

  test('uniform grey fails face_coverage (no face)', async () => {
    const img = await makeUniform(120, 120, 128, 128, 128);
    const screen = await screenImage(img);

    expect(check(screen, 'face_coverage').pass).toBe(false); // ~0 < 0.12
    expect(check(screen, 'brightness').pass).toBe(true);
    expect(screen.canProceed).toBe(false);
  });

  test('face_angle: forward-facing landmarks pass, turned head fails', async () => {
    const img = await makeImage(160, 160, (x, y) => {
      const inFace = x >= 32 && x < 128 && y >= 24 && y < 136;
      return inFace ? SKIN : BG;
    });

    const forward = await screenImage(img, {
      leftEye: { x: 0.35, y: 0.4 },
      rightEye: { x: 0.65, y: 0.4 },
      nose: { x: 0.5, y: 0.55 },
    });
    expect(check(forward, 'face_angle').pass).toBe(true);
    expect(typeof check(forward, 'face_angle').value).toBe('number');
    expect(forward.confidence).toBeGreaterThan(0.8); // landmarks -> higher base

    const turned = await screenImage(img, {
      leftEye: { x: 0.3, y: 0.4 },
      rightEye: { x: 0.5, y: 0.4 },
      nose: { x: 0.48, y: 0.55 },
    });
    expect(check(turned, 'face_angle').pass).toBe(false);
    expect(turned.canProceed).toBe(false);
  });
});

describe('analyzeUv', () => {
  test('throws UV_UNUSABLE with checks attached on a hard-fail image', async () => {
    const img = await makeUniform(64, 64, 2, 2, 2);
    expect.assertions(3);
    try {
      await analyzeUv(img, {});
    } catch (err) {
      expect(err.code).toBe('UV_UNUSABLE');
      expect(Array.isArray(err.checks)).toBe(true);
      expect(err.checks.find((c) => c.id === 'brightness').pass).toBe(false);
    }
  });

  test('uniform skin face: valid heatmap/regions and balanced asymmetry', async () => {
    const img = await makeImage(160, 160, (x, y) => {
      const inFace = x >= 32 && x < 128 && y >= 24 && y < 136;
      return inFace ? SKIN : BG;
    });
    const res = await analyzeUv(img, {});

    // heatmap invariants
    const { cols, rows, cells, bounds } = res.heatmap;
    expect(cells.length).toBe(cols * rows);
    for (const v of cells) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    for (const k of ['x', 'y', 'w', 'h']) {
      expect(bounds[k]).toBeGreaterThanOrEqual(0);
      expect(bounds[k]).toBeLessThanOrEqual(1);
    }

    // region invariants — all 7 ids present, scores 0..100, intensity 0..1
    const expectedIds = [
      'forehead',
      'periorbital_left',
      'periorbital_right',
      'cheek_left',
      'cheek_right',
      'nose',
      'perioral_chin',
    ];
    const ids = res.regions.map((r) => r.id).sort();
    expect(ids).toEqual([...expectedIds].sort());
    for (const r of res.regions) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(r.intensity).toBeGreaterThanOrEqual(0);
      expect(r.intensity).toBeLessThanOrEqual(1);
      expect(r.spotCount).toBeGreaterThanOrEqual(0);
      expect(['left', 'right', 'center']).toContain(r.side);
      expect(r.polygon).toHaveLength(4);
    }

    // overall + severity band consistency
    expect(res.overall.sunDamageScore).toBeGreaterThanOrEqual(0);
    expect(res.overall.sunDamageScore).toBeLessThanOrEqual(100);
    expect(res.overall.severity).toBe(expectedSeverity(res.overall.sunDamageScore));
    expect(res.overall.confidence).toBeGreaterThanOrEqual(0);
    expect(res.overall.confidence).toBeLessThanOrEqual(1);

    // symmetric face -> balanced asymmetry
    expect(res.asymmetry.score).toBeGreaterThanOrEqual(0);
    expect(res.asymmetry.score).toBeLessThanOrEqual(100);
    expect(res.asymmetry.dominantSide).toBe('balanced');
    expect(Math.abs(res.asymmetry.leftMean - res.asymmetry.rightMean)).toBeLessThan(0.05);
    expect(res.landmarksUsed).toBe(false);
  });

  test('image-left pigmented vs right clean -> dominantSide is subject RIGHT', async () => {
    // Image-left half (low x) is more pigmented = the SUBJECT's right side.
    const img = await makeImage(160, 160, (x) => (x < 80 ? SKIN_PIGMENTED : SKIN_CLEAN));
    const res = await analyzeUv(img, {});

    expect(res.asymmetry.dominantSide).toBe('right');
    expect(res.asymmetry.rightMean).toBeGreaterThan(res.asymmetry.leftMean);
    expect(res.asymmetry.score).toBeGreaterThan(5);

    // still a structurally valid result
    expect(res.heatmap.cells.length).toBe(res.heatmap.cols * res.heatmap.rows);
    for (const v of res.heatmap.cells) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(res.regions).toHaveLength(7);
  });

  test('landmarks drive bounds and set landmarksUsed=true', async () => {
    const img = await makeImage(160, 160, (x, y) => {
      const inFace = x >= 32 && x < 128 && y >= 24 && y < 136;
      return inFace ? SKIN : BG;
    });
    const res = await analyzeUv(img, {
      landmarks: {
        leftEye: { x: 0.6, y: 0.4 },
        rightEye: { x: 0.4, y: 0.4 },
        nose: { x: 0.5, y: 0.52 },
      },
    });
    expect(res.landmarksUsed).toBe(true);
    for (const k of ['x', 'y', 'w', 'h']) {
      expect(res.heatmap.bounds[k]).toBeGreaterThanOrEqual(0);
      expect(res.heatmap.bounds[k]).toBeLessThanOrEqual(1);
    }
  });

  test('severity bands map correctly across the 0..100 range', () => {
    expect(expectedSeverity(0)).toBe('low');
    expect(expectedSeverity(32)).toBe('low');
    expect(expectedSeverity(33)).toBe('moderate');
    expect(expectedSeverity(65)).toBe('moderate');
    expect(expectedSeverity(66)).toBe('high');
    expect(expectedSeverity(100)).toBe('high');
  });
});

describe('sharp-unavailable fallback', () => {
  test('returns low-confidence deterministic results instead of throwing', async () => {
    jest.resetModules();
    jest.doMock('sharp', () => {
      throw new Error('sharp not installed');
    });
    // eslint-disable-next-line global-require
    const uvFallback = require('../uv-scan');
    const img = 'iVBORw0KGgoAAAANSUhEUg=='; // arbitrary base64; never decoded

    const screen = await uvFallback.screenImage(img);
    expect(screen.ok).toBe(true);
    expect(screen.confidence).toBeLessThan(0.5);

    const res = await uvFallback.analyzeUv(img, {});
    expect(res.heatmap.cells.length).toBe(res.heatmap.cols * res.heatmap.rows);
    for (const v of res.heatmap.cells) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(res.regions).toHaveLength(7);
    expect(res.overall.confidence).toBeLessThan(0.5);
    expect(res.asymmetry.dominantSide).toBe('balanced');
    expect(res.landmarksUsed).toBe(false);

    jest.dontMock('sharp');
    jest.resetModules();
  });
});

// local mirror of the module's severity banding for assertion clarity
function expectedSeverity(score) {
  if (score < 33) return 'low';
  if (score < 66) return 'moderate';
  return 'high';
}
