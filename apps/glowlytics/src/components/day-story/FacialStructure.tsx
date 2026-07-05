/**
 * Facial-structure card + face outline wireframe.
 *
 * Renders the user's bone-structure read as a compact card: the schematic
 * face on the left, prose verdict on the right, a 2×2 metric grid below,
 * and a tri-coloured facial-thirds bar. Pulls the real `BoneStructureResult`
 * from the latest scan when available; falls back to a neutral pose with
 * `—` placeholders when no bone-structure scan has been completed yet.
 *
 * Used by `DayPage` (in-feed) and by `ShareSheet`'s structure card
 * (off-screen capture, IG / Twitter aspect ratios).
 */

import React, { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Circle, Line, Path, G, Polygon, Defs, ClipPath } from 'react-native-svg';
import { GlowIcon } from '../glow/GlowIcons';
import { SectionHead } from '../glow/GlowPrimitives';
import { FontFamily, Glow } from '../../constants/theme';
import { useStore } from '../../store/useStore';
import { useTrueDepthSupported } from '../../hooks/useTrueDepthSupported';
import type { BoneStructureResult } from '../../types';

const P = Glow.palette;

// ---------------------------------------------------------------------------
// FaceOutline — schematic wireframe; the same SVG primitive the share card uses
// ---------------------------------------------------------------------------

export interface FaceOutlineProps {
  color?: string;
  size?: number;
  /** Show measurement guide-lines + landmark dots. */
  showGuides?: boolean;
}

/**
 * Polygonal facial mask — hand-built low-poly triangulated mesh.
 *
 * Replaces the earlier line-drawing wireframe with a faceted "cosmetic-mask"
 * aesthetic: ~22 anatomically-named vertices (left side + centerline), each
 * mirrored to the right, woven into ~66 triangles with three tone levels
 * (highlight / mid / shadow) that suggest light falling across forehead,
 * brow, cheekbone, nose bridge, lips, and jaw. Eye sockets carry a
 * crosshatch overlay clipped to almond shapes — the only place we leave
 * the strict triangle grid, intentionally, to read as "eyes" instantly.
 *
 * The mesh is perfectly bilaterally symmetric: every left-side vertex
 * keyed `*_L` has a mirrored `*_R` counterpart at `(100 - x, y)`. Triangles
 * touching the centerline use centerline vertices directly so the seam
 * doesn't visibly split.
 */
export function FaceOutline({ color = P.accent, size = 110, showGuides = true }: FaceOutlineProps) {
  const h = size * 1.3;

  // Tone palette — light/mid/dark across the dusk system.
  const stroke = color + 'B0';                   // ~69% accent for facet edges
  const F_LITE = 'rgba(255, 255, 255, 0.55)';    // highlight planes (forehead crest, nose bridge, chin)
  const F_MID  = 'rgba(217, 162, 139, 0.48)';    // warm midtones (cheek, lip)
  const F_DARK = 'rgba(90, 58, 94, 0.34)';       // dusk shadows (eye socket, jaw under)

  // ── Vertex table ─────────────────────────────────────────────────
  // Center-line vertices (x = 50).
  const C: Record<string, readonly [number, number]> = {
    H0:  [50, 8],     // crown
    G:   [50, 44],    // glabella
    NB:  [50, 60],    // nasion (bridge top)
    NT:  [50, 80],    // nose tip
    PH:  [50, 90],    // philtrum bottom
    UL:  [50, 95],    // mid upper lip
    LL:  [50, 102],   // mid lower lip
    CN:  [50, 114],   // chin top
    CH:  [50, 124],   // pogonion
  };
  // Left-side vertices; mirrored to right by `100 - x`.
  const L: Record<string, readonly [number, number]> = {
    H1:  [38, 12],    // hairline 1
    H2:  [22, 18],    // temple top
    H3:  [10, 32],    // temple side
    BO:  [22, 46],    // brow outer
    BI:  [40, 46],    // brow inner
    EO:  [22, 60],    // outer canthus
    EI:  [40, 60],    // inner canthus
    CT:  [12, 70],    // cheek-temple (high lateral)
    MF:  [32, 76],    // midface (under eye)
    CB:  [16, 88],    // cheekbone apex
    NA:  [44, 82],    // alar
    UO:  [38, 96],    // upper-lip corner
    LO:  [40, 102],   // lower-lip corner
    JU:  [22, 96],    // jaw upper
    JM:  [30, 112],   // gonial angle
    CC:  [42, 118],   // chin corner
  };

  const V: Record<string, readonly [number, number]> = { ...C };
  for (const [k, [x, y]] of Object.entries(L)) {
    V[`${k}_L`] = [x, y];
    V[`${k}_R`] = [100 - x, y];
  }

  // ── Triangle table ───────────────────────────────────────────────
  // [a, b, c, tone] — three vertex keys (CCW) and a tonal hint.
  type Tone = 'L' | 'M' | 'D';
  const tris: ReadonlyArray<readonly [string, string, string, Tone]> = [
    // Crown / top hairline
    ['H0', 'H1_L', 'H1_R', 'L'],
    ['H0', 'H2_L', 'H1_L', 'M'],
    ['H0', 'H1_R', 'H2_R', 'M'],
    // Hairline → brow
    ['H2_L', 'H3_L', 'BO_L', 'L'],
    ['H2_L', 'BO_L', 'H1_L', 'M'],
    ['H1_L', 'BO_L', 'BI_L', 'L'],
    ['H1_L', 'BI_L', 'G', 'M'],
    ['H1_L', 'G', 'H1_R', 'L'],
    ['H1_R', 'G', 'BI_R', 'M'],
    ['H1_R', 'BI_R', 'BO_R', 'L'],
    ['H1_R', 'BO_R', 'H2_R', 'M'],
    ['H2_R', 'BO_R', 'H3_R', 'L'],
    // Brow → eye line
    ['H3_L', 'EO_L', 'BO_L', 'L'],
    ['BO_L', 'EO_L', 'BI_L', 'D'],
    ['BI_L', 'EO_L', 'EI_L', 'D'],
    ['BI_L', 'EI_L', 'G', 'D'],
    ['G', 'EI_L', 'NB', 'M'],
    ['G', 'NB', 'EI_R', 'M'],
    ['G', 'EI_R', 'BI_R', 'D'],
    ['BI_R', 'EI_R', 'EO_R', 'D'],
    ['BI_R', 'EO_R', 'BO_R', 'D'],
    ['H3_R', 'BO_R', 'EO_R', 'L'],
    // Eye → midface
    ['H3_L', 'CT_L', 'EO_L', 'L'],
    ['EO_L', 'CT_L', 'MF_L', 'M'],
    ['EO_L', 'MF_L', 'EI_L', 'D'],
    ['EI_L', 'MF_L', 'NB', 'L'],
    ['NB', 'MF_L', 'NT', 'L'],
    ['NB', 'NT', 'MF_R', 'L'],
    ['NB', 'MF_R', 'EI_R', 'L'],
    ['EI_R', 'MF_R', 'EO_R', 'D'],
    ['EO_R', 'MF_R', 'CT_R', 'M'],
    ['EO_R', 'CT_R', 'H3_R', 'L'],
    // Midface → cheekbone → nose
    ['CT_L', 'CB_L', 'MF_L', 'M'],
    ['MF_L', 'CB_L', 'NA_L', 'D'],
    ['MF_L', 'NA_L', 'NT', 'L'],
    ['NT', 'NA_R', 'MF_R', 'L'],
    ['MF_R', 'NA_R', 'CB_R', 'D'],
    ['MF_R', 'CB_R', 'CT_R', 'M'],
    // Nose tip → philtrum
    ['NA_L', 'PH', 'NT', 'L'],
    ['NT', 'PH', 'NA_R', 'L'],
    // Upper lip
    ['NA_L', 'UO_L', 'PH', 'M'],
    ['UO_L', 'UL', 'PH', 'M'],
    ['PH', 'UL', 'UO_R', 'M'],
    ['PH', 'UO_R', 'NA_R', 'M'],
    // Lower lip
    ['UO_L', 'LL', 'UL', 'L'],
    ['UO_L', 'LO_L', 'LL', 'M'],
    ['UL', 'LL', 'UO_R', 'L'],
    ['LL', 'LO_R', 'UO_R', 'M'],
    // Cheek hollow → jaw upper
    ['CB_L', 'JU_L', 'NA_L', 'L'],
    ['JU_L', 'UO_L', 'NA_L', 'M'],
    ['NA_R', 'UO_R', 'JU_R', 'M'],
    ['NA_R', 'JU_R', 'CB_R', 'L'],
    // Jaw → gonial → chin corner
    ['JU_L', 'JM_L', 'UO_L', 'D'],
    ['UO_L', 'JM_L', 'LO_L', 'M'],
    ['LO_L', 'JM_L', 'CC_L', 'L'],
    ['CC_L', 'JM_L', 'CH', 'D'],
    ['UO_R', 'JM_R', 'JU_R', 'D'],
    ['LO_R', 'JM_R', 'UO_R', 'M'],
    ['CC_R', 'JM_R', 'LO_R', 'L'],
    ['CC_R', 'CH', 'JM_R', 'D'],
    // Chin frontal plane
    ['LO_L', 'CC_L', 'CN', 'L'],
    ['LL', 'LO_L', 'CN', 'M'],
    ['LL', 'CN', 'LO_R', 'M'],
    ['LO_R', 'CC_R', 'CN', 'L'],
    ['CC_L', 'CH', 'CN', 'M'],
    ['CC_R', 'CN', 'CH', 'M'],
  ];

  const toneFill = (t: Tone) => (t === 'L' ? F_LITE : t === 'M' ? F_MID : F_DARK);
  const pts = (a: string, b: string, c: string) =>
    `${V[a][0]},${V[a][1]} ${V[b][0]},${V[b][1]} ${V[c][0]},${V[c][1]}`;

  // Eye crosshatch — clipped to almond shapes.
  // Almond path: outer-canthus → upper arc → inner-canthus → lower arc.
  const leftAlmondD  = `M ${V.EO_L[0]} ${V.EO_L[1]} Q ${(V.EO_L[0]+V.EI_L[0])/2} ${V.EO_L[1]-3.2} ${V.EI_L[0]} ${V.EI_L[1]} Q ${(V.EO_L[0]+V.EI_L[0])/2} ${V.EO_L[1]+2.6} ${V.EO_L[0]} ${V.EO_L[1]} Z`;
  const rightAlmondD = `M ${V.EI_R[0]} ${V.EI_R[1]} Q ${(V.EI_R[0]+V.EO_R[0])/2} ${V.EO_R[1]-3.2} ${V.EO_R[0]} ${V.EO_R[1]} Q ${(V.EI_R[0]+V.EO_R[0])/2} ${V.EO_R[1]+2.6} ${V.EI_R[0]} ${V.EI_R[1]} Z`;

  return (
    <Svg width={size} height={h} viewBox="0 0 100 130">
      <Defs>
        <ClipPath id="eyeL">
          <Path d={leftAlmondD} />
        </ClipPath>
        <ClipPath id="eyeR">
          <Path d={rightAlmondD} />
        </ClipPath>
      </Defs>

      {/* Triangulated mesh — every facet stroked at 0.4 to read as wireframe */}
      <G>
        {tris.map(([a, b, c, t], i) => (
          <Polygon
            key={`tri-${i}`}
            points={pts(a, b, c)}
            fill={toneFill(t)}
            stroke={stroke}
            strokeWidth={0.4}
            strokeLinejoin="round"
          />
        ))}
      </G>

      {/* Eye almonds — solid dark inlay + diagonal crosshatch overlay */}
      <G>
        <Path d={leftAlmondD}  fill="rgba(42,31,45,0.55)" stroke={stroke} strokeWidth={0.5} />
        <Path d={rightAlmondD} fill="rgba(42,31,45,0.55)" stroke={stroke} strokeWidth={0.5} />
        <G clipPath="url(#eyeL)" stroke={stroke} strokeWidth={0.35}>
          <Line x1={22} y1={56} x2={40} y2={64} />
          <Line x1={22} y1={64} x2={40} y2={56} />
          <Line x1={26} y1={56} x2={36} y2={64} />
          <Line x1={26} y1={64} x2={36} y2={56} />
        </G>
        <G clipPath="url(#eyeR)" stroke={stroke} strokeWidth={0.35}>
          <Line x1={60} y1={56} x2={78} y2={64} />
          <Line x1={60} y1={64} x2={78} y2={56} />
          <Line x1={64} y1={56} x2={74} y2={64} />
          <Line x1={64} y1={64} x2={74} y2={56} />
        </G>
      </G>

      {/* Lip seam — single accent line that catches the eye between upper/lower */}
      <Path
        d={`M ${V.UO_L[0]} ${V.UL[1]} Q ${V.UL[0]} ${V.UL[1]+0.5} ${V.UO_R[0]} ${V.UL[1]}`}
        fill="none"
        stroke={color}
        strokeWidth={0.7}
        strokeLinecap="round"
        opacity={0.7}
      />

      {/* Single contour cue — only when guides requested, ultra-light */}
      {showGuides && (
        <Path
          d={`M ${V.H2_L[0]} ${V.H2_L[1]} Q ${V.H3_L[0]-2} ${V.CT_L[1]} ${V.CB_L[0]-2} ${V.CB_L[1]} Q ${V.JM_L[0]-2} ${V.JM_L[1]+1} ${V.CH[0]} ${V.CH[1]+1} Q ${100-V.JM_L[0]+2} ${V.JM_L[1]+1} ${100-V.CB_L[0]+2} ${V.CB_L[1]} Q ${100-V.H3_L[0]+2} ${V.CT_L[1]} ${100-V.H2_L[0]} ${V.H2_L[1]}`}
          fill="none"
          stroke={color}
          strokeWidth={0.55}
          strokeOpacity={0.45}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// FacialStructure — the in-feed card
// ---------------------------------------------------------------------------

export interface FacialStructureProps {
  compact?: boolean;
  onShare?: () => void;
}

interface Reading {
  shape: string;
  symmetry: number | null;     // 0–100 score
  ratio: number | null;        // facial_index: glabella→menton height ÷ bizygomatic width
  jawline: string;
  cheekbone: string;
  thirds: { upper: number; mid: number; lower: number };
  thirdsEstimated: boolean;
  estimated: boolean;
}

function isFacialThirdsRaw(value: unknown): value is { t1: number; t2: number; t3: number } {
  if (!value || typeof value !== 'object') return false;
  return (
    't1' in value && typeof value.t1 === 'number' && Number.isFinite(value.t1) &&
    't2' in value && typeof value.t2 === 'number' && Number.isFinite(value.t2) &&
    't3' in value && typeof value.t3 === 'number' && Number.isFinite(value.t3)
  );
}

/**
 * Derive a UI-ready reading from the most recent BoneStructureResult on
 * record. When none exists we hand back the same shape with neutral values
 * + an em-dash for each numeric metric — the card still renders.
 */
function readingFromBone(bone: BoneStructureResult | undefined | null): Reading {
  const fallback: Reading = {
    shape: '—',
    symmetry: null,
    ratio: null,
    jawline: 'no read yet',
    cheekbone: 'no read yet',
    thirds: { upper: 33, mid: 34, lower: 33 },
    thirdsEstimated: true,
    estimated: false,
  };
  if (!bone || bone.status !== 'ok') return fallback;

  // Dominant driver maps loosely to a perceived shape — strictly cosmetic.
  const shapeFromDriver: Record<string, string> = {
    symmetry: 'Symmetric',
    periorbital: 'Wide-set',
    mandibular: 'Defined',
    midface: 'Soft Oval',
    nose: 'Balanced',
    brow: 'Lifted',
  };
  const shape = bone.dominant_driver ? shapeFromDriver[bone.dominant_driver] ?? 'Balanced' : 'Balanced';

  const sym = bone.domain_scores?.symmetry;
  const symmetry = typeof sym === 'number' && Number.isFinite(sym) ? sym : null;

  // Cheekbone-projection metric (live key on bone.scored_metrics).
  const cheekScore = bone.scored_metrics?.zygomatic_projection;
  const cheekbone = typeof cheekScore === 'number'
    ? (cheekScore >= 75 ? 'Prominent' : cheekScore >= 55 ? 'Soft' : 'Subtle')
    : 'reading…';

  const gonialScore = bone.scored_metrics?.gonial_angle;
  const jawline = typeof gonialScore === 'number'
    ? (gonialScore >= 75 ? 'Defined' : gonialScore >= 55 ? 'Softly tapered' : 'Round')
    : 'reading…';

  const facialIndex = bone.metrics?.facial_index?.value;
  const ratio = typeof facialIndex === 'number' && Number.isFinite(facialIndex) ? Math.round(facialIndex * 100) / 100 : null;
  // Template calibration landed at 0.935, not phi-adjacent, so never present this as a 1.62/φ ideal.

  // Facial-thirds proportion from the scored metrics — approximate by
  // pulling the raw mesh measurements if present, otherwise default.
  const thirdsRead = (() => {
    const raw = bone.metrics?.facial_thirds?.raw;
    if (isFacialThirdsRaw(raw)) {
      const sum = raw.t1 + raw.t2 + raw.t3;
      if (sum > 0) {
        return {
          thirds: {
            upper: Math.round((raw.t1 / sum) * 100),
            mid:   Math.round((raw.t2 / sum) * 100),
            lower: Math.round((raw.t3 / sum) * 100),
          },
          estimated: false,
        };
      }
    }
    return { thirds: { upper: 33, mid: 34, lower: 33 }, estimated: true };
  })();

  const estimated = 'estimate' in bone && bone.estimate === true;
  return { shape, symmetry, ratio, jawline, cheekbone, thirds: thirdsRead.thirds, thirdsEstimated: thirdsRead.estimated, estimated };
}

export function FacialStructure({ compact = false, onShare }: FacialStructureProps) {
  const modelOutputs = useStore((s) => s.modelOutputs);
  // Suppress the "scan on a Face ID device" badge on TrueDepth devices — the
  // user is already on one, so the CTA would be nonsense there.
  const trueDepthSupported = useTrueDepthSupported();

  // Use the latest output that carries a bone-structure result — most scans
  // won't (it's a separate analysis path). Capture BOTH the reading shown and
  // the daily_id of the output that owns it, so the detail screen opens the
  // exact read the card displays rather than whatever happens to be the newest
  // (possibly skin-only) output on record.
  const { latestBone, boneDailyId } = useMemo(() => {
    for (let i = modelOutputs.length - 1; i >= 0; i--) {
      const output = modelOutputs[i];
      const b = output?.bone_structure;
      if (output && b && b.status === 'ok') {
        return { latestBone: b, boneDailyId: output.daily_id };
      }
    }
    return { latestBone: null, boneDailyId: null };
  }, [modelOutputs]);

  const handleOpenDetail = useCallback(() => {
    // Navigate with the daily_id of the bone read the card is displaying;
    // without it bone-results falls back to the newest output, which may be a
    // skin-only scan → the empty 'waiting' state. No bone read → keep the
    // param-less path (bone-results shows its own empty state).
    router.push(
      boneDailyId
        ? { pathname: '/scan/bone-results', params: { dailyId: boneDailyId } }
        : '/scan/bone-results',
    );
  }, [boneDailyId]);

  const reading = readingFromBone(latestBone);

  const metrics: Array<{ label: string; value: string; sub: string }> = [
    { label: 'Shape', value: reading.shape, sub: reading.shape === '—' ? 'awaiting scan' : 'dominant driver' },
    { label: 'Symmetry', value: reading.symmetry == null ? '—' : `Symmetry ${Math.round(reading.symmetry)}/100`, sub: 'left vs. right score' },
    { label: 'Face ratio', value: reading.ratio == null ? '—' : reading.ratio.toFixed(2), sub: 'length / width' },
    { label: 'Jawline', value: reading.jawline, sub: 'jaw angle band' },
  ];

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {!compact && (
        <SectionHead title="Your structure" hint="from your latest face read" ink={P.ink} muted={P.muted} />
      )}
      <Pressable
        onPress={handleOpenDetail}
        accessibilityRole="button"
        accessibilityLabel="Open your full facial structure read"
        accessibilityHint="Opens your detailed facial architecture results"
        style={({ pressed }) => [styles.card, compact && styles.cardCompact, pressed && styles.cardPressed]}
      >
        {/* breathing halo */}
        <View pointerEvents="none" style={styles.halo} />

        <View style={styles.heroRow}>
          <View style={styles.faceWrap}>
            <FaceOutline color={P.accent} size={108} />
          </View>
          <View style={styles.heroText}>
            <Text style={styles.eyebrow}>Face read</Text>
            {reading.shape === '—' ? (
              <>
                <Text style={styles.heroTitle}>
                  <Text style={styles.heroEm}>Awaiting</Text> your first scan
                </Text>
                <Text style={styles.heroSub}>
                  Take a face read to map your bone structure, symmetry and proportions.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.heroTitle}>
                  <Text style={styles.heroEm}>{reading.shape}</Text>, {reading.jawline.toLowerCase()}
                </Text>
                <Text style={styles.heroSub}>
                  {reading.cheekbone.toLowerCase()} cheekbones · {reading.jawline.toLowerCase()}
                </Text>
                {reading.estimated && !trueDepthSupported && (
                  <View style={styles.estimateBadge}>
                    <Text style={styles.estimateBadgeText}>
                      Estimated from a reference model — scan on a Face ID device for your own measurements
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        </View>

        <View style={styles.metricGrid}>
          {metrics.map((m) => (
            <View key={m.label} style={styles.metricCell}>
              <Text style={styles.metricLabel}>{m.label.toUpperCase()}</Text>
              <Text style={styles.metricValue}>{m.value}</Text>
              <Text style={styles.metricSub}>{m.sub}</Text>
            </View>
          ))}
        </View>

        {/* facial thirds bar */}
        <View style={styles.thirdsWrap}>
          <Text style={styles.metricLabel}>FACIAL THIRDS</Text>
          <View style={[styles.thirdsBar, reading.thirdsEstimated && styles.thirdsBarEstimated]}>
            <View style={[styles.thirdsSeg, reading.thirdsEstimated && styles.thirdsSegEstimated, { flex: reading.thirds.upper, backgroundColor: P.accent }]} />
            <View style={[styles.thirdsSeg, reading.thirdsEstimated && styles.thirdsSegEstimated, { flex: reading.thirds.mid,   backgroundColor: P.accent2 }]} />
            <View style={[styles.thirdsSeg, reading.thirdsEstimated && styles.thirdsSegEstimated, { flex: reading.thirds.lower, backgroundColor: P.glow }]} />
          </View>
          <View style={styles.thirdsLabels}>
            <Text style={styles.metricSub}>Upper {reading.thirds.upper}</Text>
            <Text style={styles.metricSub}>Mid {reading.thirds.mid}</Text>
            <Text style={styles.metricSub}>Lower {reading.thirds.lower}</Text>
            {reading.thirdsEstimated && <Text style={styles.metricSub}>Estimate</Text>}
          </View>
        </View>

        {onShare && (
          <TouchableOpacity
            onPress={onShare}
            accessibilityRole="button"
            accessibilityLabel="Share my face read"
            style={styles.shareBtn}
          >
            <GlowIcon name="share" size={14} color={P.ink} stroke={1.7} />
            <Text style={styles.shareBtnText}>Share my face read</Text>
          </TouchableOpacity>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 24, paddingTop: 24 },
  wrapCompact: { padding: 0, paddingTop: 0 },
  card: {
    marginTop: 12,
    backgroundColor: P.surface,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: P.glow,
    overflow: 'hidden',
  },
  cardCompact: { marginTop: 0 },
  cardPressed: { opacity: 0.94 },
  halo: {
    position: 'absolute',
    top: -30,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: P.accent + '20',
  },
  heroRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  faceWrap: { flexShrink: 0, marginTop: -4 },
  heroText: { flex: 1, minWidth: 0, paddingTop: 4 },
  eyebrow: { fontSize: 11, color: P.muted, letterSpacing: 1.2, fontFamily: FontFamily.sansMedium },
  heroTitle: {
    fontFamily: FontFamily.sansBold,
    fontSize: 22,
    color: P.ink,
    marginTop: 4,
    lineHeight: 26,
  },
  heroEm: { fontStyle: 'italic', color: P.accent },
  heroSub: { fontSize: 12, color: P.muted, marginTop: 6, lineHeight: 17 },
  estimateBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: P.accent + '55',
    backgroundColor: P.accent + '12',
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 8,
  },
  estimateBadgeText: { fontSize: 10, color: P.ink, lineHeight: 14, textAlign: 'center' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  metricCell: {
    backgroundColor: P.bg,
    borderRadius: 14,
    padding: 12,
    width: '47.5%',
  },
  metricLabel: { fontSize: 10, color: P.muted, letterSpacing: 0.6, fontFamily: FontFamily.sansMedium },
  metricValue: { fontFamily: FontFamily.sansBold, fontSize: 18, color: P.ink, marginTop: 2 },
  metricSub: { fontSize: 10, color: P.muted, marginTop: 3 },
  thirdsWrap: { marginTop: 16 },
  thirdsBar: { flexDirection: 'row', gap: 2, height: 6, borderRadius: 999, overflow: 'hidden', marginTop: 6 },
  thirdsSeg: { height: '100%' },
  thirdsBarEstimated: { borderWidth: 1, borderStyle: 'dashed', borderColor: P.muted + '66', opacity: 0.72 },
  thirdsSegEstimated: { opacity: 0.55 },
  thirdsLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  shareBtn: {
    marginTop: 18,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: P.glow,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  shareBtnText: { fontFamily: FontFamily.sansBold, fontSize: 13, color: P.ink },
});
