/**
 * Face3DViewer — real 3D face-mesh viewer rendered via SVG + JS projection.
 *
 * We avoid pulling expo-gl / expo-three for v1: the mesh is ~80 vertices and
 * a handful of measurement overlays, well within react-native-svg's
 * performance envelope. Perspective projection, orbit/zoom gestures, and
 * per-vertex heatmaps all live here.
 *
 * Modes:
 *   - 'anatomy'      → wireframe outline + landmark dots
 *   - 'heatmap'      → outline + finding-tinted dots
 *   - 'measurements' → outline + dimension lines + floating labels
 *   - 'skin'         → outline + projected lesion bbox centres
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { buildCanonicalMesh, CANONICAL_OUTLINE_EDGES } from '../services/canonicalFaceMesh';
import {
  HARMONY_ACCENT,
  MEASUREMENT_LINES,
  MEASUREMENT_ANGLES,
  METRIC_BY_KEY,
  formatMetricValue,
  type BoneMetricKey,
} from '../constants/boneStructure';
import { Colors, FontFamily, FontSize } from '../constants/theme';
import type {
  BoneFinding,
  BoneMeshSource,
  BoneStructureResult,
  DetectedLesion,
} from '../types';

export type Face3DViewerMode = 'anatomy' | 'heatmap' | 'measurements' | 'skin';

interface Props {
  vertices: number[];                 // flat xyz
  source: BoneMeshSource;
  mode?: Face3DViewerMode;
  size?: number;                      // square viewport edge in px
  bone?: BoneStructureResult | null;  // for heatmap + measurements modes
  lesions?: DetectedLesion[] | null;  // for skin mode
  /**
   * 0..1 fraction of landmarks + edges to render. Used by the capture
   * flow to "build" the face mesh progressively while the analyze call
   * is in flight. Default 1 (full mesh, no animation gating).
   */
  revealProgress?: number;
}

// --- math helpers ---

interface Vec3 { x: number; y: number; z: number }

function vert(verts: number[], i: number): Vec3 | null {
  const o = i * 3;
  if (o + 2 >= verts.length) return null;
  return { x: verts[o], y: verts[o + 1], z: verts[o + 2] };
}

// Rotate around Y then around X, then project with perspective foreshortening.
//
// Mesh convention (matches backend bone-structure-3d.js + canonicalFaceMesh.ts):
//   +X = subject's right (away from viewer when looking at the face)
//   +Y = up
//   +Z = out of the face, toward the camera
//
// Camera sits at world z = +distance looking toward -Z. So the eye-space depth
// of a vertex is `distance - z2` (front-of-face → small w, back → large w).
// We also negate screen x because subject-right should appear on screen-left
// (mirror-image expectation when looking at a face).
function projectVertex(v: Vec3, yaw: number, pitch: number, distance: number, fov: number, size: number): { x: number; y: number; depth: number } {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const x1 = v.x * cy + v.z * sy;
  const z1 = -v.x * sy + v.z * cy;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const y2 = v.y * cp - z1 * sp;
  const z2 = v.y * sp + z1 * cp;
  const w = distance - z2;
  const denom = w > 0.1 ? w : 0.1;
  const focal = (size / 2) / Math.tan((fov * Math.PI / 180) / 2);
  return {
    x: -(x1 * focal) / denom + size / 2,
    y: -(y2 * focal) / denom + size / 2,
    depth: w,
  };
}

// --- severity → color ---

function severityColor(severity: BoneFinding['severity']): string {
  if (severity === 'mild') return Colors.warning;
  if (severity === 'moderate') return Colors.error;
  return '#7A1A1A';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// Highest vertex index referenced by any wireframe edge or measurement overlay.
// If the captured mesh is shorter than this, our index-keyed rendering won't
// produce a recognisable head — we fall back to the canonical mesh instead.
const MAX_REFERENCED_INDEX = (() => {
  let m = 0;
  for (const [a, b] of CANONICAL_OUTLINE_EDGES) m = Math.max(m, a, b);
  return m;
})();

function vertexHasContent(vertices: number[], idx: number): boolean {
  const o = idx * 3;
  if (o + 2 >= vertices.length) return false;
  // Any non-zero coord component counts as "set"
  return vertices[o] !== 0 || vertices[o + 1] !== 0 || vertices[o + 2] !== 0;
}

export const Face3DViewer: React.FC<Props> = ({
  vertices: rawVertices,
  source,
  mode = 'anatomy',
  size = 320,
  bone,
  lesions,
  revealProgress = 1,
}) => {
  // Clamp to [0, 1] — caller may pass NaN/Infinity from a botched animation
  const reveal = Number.isFinite(revealProgress)
    ? Math.max(0, Math.min(1, revealProgress))
    : 1;
  // Guard against meshes that don't honour the MediaPipe-index contract
  // (e.g. an older server response that dropped every Nth vertex). If the
  // mesh is too short OR most of the anatomically-named landmark slots are
  // empty, fall back to the bundled canonical mesh so the viewer still
  // renders a recognisable head outline + dimension overlays.
  const vertices = useMemo(() => {
    const tripleCount = Math.floor(rawVertices.length / 3);
    if (tripleCount <= MAX_REFERENCED_INDEX) return buildCanonicalMesh();
    // Spot-check a handful of edge endpoints — if more than half are blank,
    // the mapping is broken and we replace.
    let blank = 0;
    let probed = 0;
    for (const [a, b] of CANONICAL_OUTLINE_EDGES.slice(0, 12)) {
      if (!vertexHasContent(rawVertices, a)) blank++;
      if (!vertexHasContent(rawVertices, b)) blank++;
      probed += 2;
    }
    if (probed > 0 && blank / probed > 0.5) return buildCanonicalMesh();
    return rawVertices;
  }, [rawVertices]);

  // Orbit + zoom state
  const [yaw, setYaw] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [distance, setDistance] = useState(180);
  const baseRef = useRef({ yaw: 0, pitch: 0, distance: 180 });

  // Auto-rotate when the user hasn't touched the viewer recently. Halts on
  // any pan and resumes after a short idle window.
  const idleSince = useRef(Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      if (Date.now() - idleSince.current < 1500) return;
      setYaw((y) => y + 0.012);
    }, 40);
    return () => clearInterval(id);
  }, []);

  const pan = Gesture.Pan()
    .onStart(() => {
      idleSince.current = Date.now();
      baseRef.current = { yaw, pitch, distance };
    })
    .onUpdate((e) => {
      idleSince.current = Date.now();
      const newYaw = baseRef.current.yaw + e.translationX / 90;
      const newPitch = Math.max(-1.0, Math.min(1.0, baseRef.current.pitch - e.translationY / 120));
      runOnJS(setYaw)(newYaw);
      runOnJS(setPitch)(newPitch);
    })
    .onEnd(() => {
      idleSince.current = Date.now();
    });

  const pinch = Gesture.Pinch()
    .onStart(() => {
      idleSince.current = Date.now();
      baseRef.current = { yaw, pitch, distance };
    })
    .onUpdate((e) => {
      idleSince.current = Date.now();
      const next = Math.max(120, Math.min(360, baseRef.current.distance / e.scale));
      runOnJS(setDistance)(next);
    })
    .onEnd(() => {
      idleSince.current = Date.now();
    });

  const composed = Gesture.Simultaneous(pan, pinch);

  // Project every vertex once per render. Zero-coord slots (placeholder
  // padding between named landmark indices) are skipped so 442 dots don't
  // stack at the viewport centre.
  const projected = useMemo(() => {
    const out: Array<{ x: number; y: number; depth: number } | null> = [];
    for (let i = 0; i * 3 < vertices.length; i++) {
      const v = vert(vertices, i);
      if (!v || (v.x === 0 && v.y === 0 && v.z === 0)) {
        out.push(null);
        continue;
      }
      out.push(projectVertex(v, yaw, pitch, distance, 45, size));
    }
    return out;
  }, [vertices, yaw, pitch, distance, size]);

  // Edges
  const edges = useMemo(() => {
    const list: Array<{ a: number; b: number }> = [];
    for (const [a, b] of CANONICAL_OUTLINE_EDGES) list.push({ a, b });
    return list;
  }, []);

  // Measurement overlays
  const measurementLines = MEASUREMENT_LINES[source] || MEASUREMENT_LINES.mediapipe;
  const measurementAngles = MEASUREMENT_ANGLES[source] || MEASUREMENT_ANGLES.mediapipe;

  // Heatmap: map findings to vertices
  const findingByVertex = useMemo(() => {
    if (!bone || mode !== 'heatmap') return new Map<number, BoneFinding>();
    const map = new Map<number, BoneFinding>();
    for (const f of bone.findings) {
      // Map each finding back to its primary vertex through the measurement-line table
      const line = measurementLines.find((l) => l.metricKey === (f.metric as BoneMetricKey));
      if (line) {
        map.set(line.vertices[0], f);
        map.set(line.vertices[1], f);
        continue;
      }
      const angle = measurementAngles.find((a) => a.metricKey === (f.metric as BoneMetricKey));
      if (angle) {
        map.set(angle.vertices[1], f);
      }
    }
    return map;
  }, [bone, mode, measurementLines, measurementAngles]);

  // Lesion bboxes → project onto the front of the mesh (z = pronasale.z ≈ 22)
  // The lesion bbox is normalised to image coordinates; we map it to the
  // canonical mesh's xy range (~[-40, +40], [-50, +50]) and place at depth z=10.
  const lesionDots = useMemo(() => {
    if (mode !== 'skin' || !lesions || lesions.length === 0) return [];
    return lesions.map((les) => {
      const [bx, by, bw, bh] = les.bbox;
      const cx = bx + bw / 2;
      const cy = by + bh / 2;
      // Map [0,1] image space → mesh xy
      const mx = (0.5 - cx) * 80;   // flip x so subject-left maps to +X
      const my = (0.5 - cy) * 100;  // flip y
      return projectVertex({ x: mx, y: my, z: 10 }, yaw, pitch, distance, 45, size);
    });
  }, [lesions, mode, yaw, pitch, distance, size]);

  return (
    <GestureHandlerRootView style={{ width: size, height: size }}>
      <GestureDetector gesture={composed}>
        <View style={[styles.canvas, { width: size, height: size }]}>
          <Svg width={size} height={size}>
            <Defs>
              <RadialGradient id="bgGlow" cx="50%" cy="50%" rx="55%" ry="55%">
                <Stop offset="0%" stopColor={HARMONY_ACCENT} stopOpacity="0.18" />
                <Stop offset="100%" stopColor={HARMONY_ACCENT} stopOpacity="0" />
              </RadialGradient>
            </Defs>

            <Circle cx={size / 2} cy={size / 2} r={size / 2.1} fill="url(#bgGlow)" />

            {/* Outline edges — depth-graded so front-facing geometry reads
                stronger than the back, giving the 2D wireframe a sense of
                volume even before any shading.
                When `reveal` < 1 (capture-flow animation), edges past the
                threshold fade out — combined with the dot reveal below
                this gives the impression of the head "forming" as the
                analyse call progresses. */}
            <G>
              {edges.map(({ a, b }, i) => {
                const pa = projected[a];
                const pb = projected[b];
                if (!pa || !pb) return null;
                // Per-edge reveal threshold — edges appear in array order
                const edgeT = (i + 1) / edges.length;
                if (edgeT > reveal) return null;
                // Soft fade-in near the threshold for a smoother appearance
                const revealFade = Math.max(0, Math.min(1, (reveal - edgeT) * 6 + 0.4));
                // Depth normalisation: distance + z=80 is the closest a vertex
                // gets at default camera; distance - 80 is the furthest.
                const avgDepth = (pa.depth + pb.depth) / 2;
                const frontness = Math.max(0, Math.min(1, (distance + 80 - avgDepth) / 160));
                const opacity = (0.25 + 0.65 * frontness) * revealFade;
                const width = 0.9 + 1.0 * frontness;
                return (
                  <Line
                    key={i}
                    x1={pa.x} y1={pa.y}
                    x2={pb.x} y2={pb.y}
                    stroke={Colors.text}
                    strokeWidth={width}
                    strokeOpacity={opacity}
                    strokeLinecap="round"
                  />
                );
              })}
            </G>

            {/* Landmark dots */}
            <G>
              {projected.map((p, i) => {
                if (!p) return null;
                if (mode === 'heatmap') {
                  const f = findingByVertex.get(i);
                  if (!f) return null;
                  return (
                    <Circle
                      key={`l${i}`}
                      cx={p.x} cy={p.y}
                      r={6}
                      fill={severityColor(f.severity)}
                      fillOpacity={0.85}
                      stroke={Colors.background}
                      strokeWidth={1}
                    />
                  );
                }
                // Default landmark dots — depth-graded radius + opacity
                // so the eye reads silhouette as well as mesh density.
                // Per-dot reveal driven by index so the dots appear in a
                // deterministic order during capture animation.
                const dotT = projected.length > 0 ? (i + 1) / projected.length : 1;
                if (dotT > reveal) return null;
                const revealFade = Math.max(0, Math.min(1, (reveal - dotT) * 6 + 0.4));
                const frontness = Math.max(0, Math.min(1, (distance + 80 - p.depth) / 160));
                const r = 1.2 + 1.4 * frontness;
                const op = (0.35 + 0.55 * frontness) * revealFade;
                return (
                  <Circle
                    key={`l${i}`}
                    cx={p.x} cy={p.y}
                    r={r}
                    fill={HARMONY_ACCENT}
                    fillOpacity={op}
                  />
                );
              })}
            </G>

            {/* Measurement lines (measurements mode) */}
            {mode === 'measurements' && bone && (
              <G>
                {measurementLines.map((line, i) => {
                  const pa = projected[line.vertices[0]];
                  const pb = projected[line.vertices[1]];
                  const value = bone.metrics?.[line.metricKey]?.value;
                  if (!pa || !pb) return null;
                  const labelX = (pa.x + pb.x) / 2;
                  const labelY = (pa.y + pb.y) / 2 - 8;
                  const labelText = Number.isFinite(value)
                    ? `${line.label}  ${formatMetricValue(line.metricKey, value as number)}`
                    : null;
                  // Approximate label width — rough but good enough for a
                  // softly-rounded backdrop that stays legible over wireframe.
                  const labelWidth = labelText ? labelText.length * 4.2 + 10 : 0;
                  return (
                    <G key={`ml${i}`}>
                      <Line
                        x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                        stroke={HARMONY_ACCENT}
                        strokeWidth={1.4}
                        strokeDasharray="3,3"
                      />
                      {labelText && (
                        <>
                          <Rect
                            x={labelX - labelWidth / 2}
                            y={labelY - 8}
                            width={labelWidth}
                            height={12}
                            rx={6}
                            fill={Colors.background}
                            fillOpacity={0.78}
                          />
                          <SvgText
                            x={labelX} y={labelY}
                            fontSize={FontSize.xxs}
                            fontFamily={FontFamily.sansMedium}
                            fill={HARMONY_ACCENT}
                            textAnchor="middle"
                          >
                            {labelText}
                          </SvgText>
                        </>
                      )}
                    </G>
                  );
                })}
                {measurementAngles.map((arc, i) => {
                  const pa = projected[arc.vertices[0]];
                  const pc = projected[arc.vertices[1]];
                  const pb = projected[arc.vertices[2]];
                  const value = bone.metrics?.[arc.metricKey]?.value;
                  if (!pa || !pc || !pb) return null;
                  const labelText = Number.isFinite(value)
                    ? formatMetricValue(arc.metricKey, value as number)
                    : null;
                  return (
                    <G key={`ma${i}`}>
                      <Line x1={pc.x} y1={pc.y} x2={pa.x} y2={pa.y} stroke={HARMONY_ACCENT} strokeWidth={1.2} strokeOpacity={0.7} />
                      <Line x1={pc.x} y1={pc.y} x2={pb.x} y2={pb.y} stroke={HARMONY_ACCENT} strokeWidth={1.2} strokeOpacity={0.7} />
                      {labelText && (
                        <>
                          <Rect
                            x={pc.x + 8} y={pc.y - 12}
                            width={labelText.length * 4.4 + 8}
                            height={12} rx={6}
                            fill={Colors.background} fillOpacity={0.78}
                          />
                          <SvgText
                            x={pc.x + 12} y={pc.y - 4}
                            fontSize={FontSize.xxs}
                            fontFamily={FontFamily.sansMedium}
                            fill={HARMONY_ACCENT}
                          >
                            {labelText}
                          </SvgText>
                        </>
                      )}
                    </G>
                  );
                })}
              </G>
            )}

            {/* Skin mode — lesion dots projected onto mesh */}
            {mode === 'skin' && lesionDots.length > 0 && (
              <G>
                {lesionDots.map((p, i) => (
                  <Circle
                    key={`lesion${i}`}
                    cx={p.x} cy={p.y}
                    r={4}
                    fill={Colors.acne}
                    fillOpacity={0.85}
                  />
                ))}
              </G>
            )}
          </Svg>
        </View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  canvas: {
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
