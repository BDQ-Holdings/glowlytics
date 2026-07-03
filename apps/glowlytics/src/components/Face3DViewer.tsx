/**
 * Face3DViewer — SVG face renderer for canonical MediaPipe-indexed geometry.
 *
 * The render stack is deliberately native-dependency-free: auto-fit the input
 * mesh to a stable view radius, project in JS, draw the real 898-face topology
 * as bucketed clay-shaded SVG paths, then place hidden-line feature edges,
 * occluded landmark dots, measurements, and lesion/finding overlays on top.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, View, type AppStateStatus } from 'react-native';
import Svg, { Circle, Defs, G, Line, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { buildCanonicalMesh, CANONICAL_OUTLINE_EDGES, CANONICAL_TRIANGLES } from '../services/canonicalFaceMesh';
import {
  HARMONY_ACCENT,
  MEASUREMENT_LINES,
  MEASUREMENT_ANGLES,
  formatMetricValue,
  resolveLabelCollisions,
  type BoneMetricKey,
  type LabelBox,
  type MeasurementAngle,
  type MeasurementLine,
} from '../constants/boneStructure';
import { Colors, FontFamily, FontSize } from '../constants/theme';
import type {
  BoneFinding,
  BoneMeshSource,
  BoneStructureResult,
  DetectedLesion,
} from '../types';

export type Face3DViewerMode = 'anatomy' | 'heatmap' | 'measurements' | 'skin';
type ViewerMeshSource = BoneMeshSource | 'canonical';

interface Props {
  vertices: number[];
  source: ViewerMeshSource;
  mode?: Face3DViewerMode;
  size?: number;
  bone?: BoneStructureResult | null;
  lesions?: DetectedLesion[] | null;
  revealProgress?: number;
  highlightMetric?: BoneMetricKey;
}

export interface Vec3 { x: number; y: number; z: number }
interface ProjectedVertex { x: number; y: number; depth: number }
interface FaceFrameVertex extends ProjectedVertex { tx: number; ty: number; tz: number }
interface NormalizedMesh { vertices: number[]; center: Vec3; radius: number; scale: number }
interface TriangleRun { key: string; path: string; fill: string; opacity: number; depth: number }

const TARGET_RADIUS = 78;
const DEFAULT_DISTANCE = 220;
const FOV = 45;
const LIGHT = normalizeVec({ x: 0.3, y: 0.4, z: 1 });
const SHADE_BUCKETS = 12;

const MAX_REFERENCED_INDEX = (() => {
  let m = 0;
  for (const [a, b] of CANONICAL_OUTLINE_EDGES) m = Math.max(m, a, b);
  for (const [a, b, c] of CANONICAL_TRIANGLES) m = Math.max(m, a, b, c);
  return m;
})();

function vert(verts: readonly number[], i: number): Vec3 | null {
  const o = i * 3;
  if (o + 2 >= verts.length) return null;
  return { x: verts[o], y: verts[o + 1], z: verts[o + 2] };
}

function vertexHasContent(vertices: readonly number[], idx: number): boolean {
  const o = idx * 3;
  return o + 2 < vertices.length && (vertices[o] !== 0 || vertices[o + 1] !== 0 || vertices[o + 2] !== 0);
}

function normalizeVec(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function transformVertex(v: Vec3, yaw: number, pitch: number): Vec3 {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const x1 = v.x * cy + v.z * sy;
  const z1 = -v.x * sy + v.z * cy;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  return {
    x: x1,
    y: v.y * cp - z1 * sp,
    z: v.y * sp + z1 * cp,
  };
}

function projectTransformedVertex(v: Vec3, distance: number, fov: number, size: number): ProjectedVertex {
  const w = distance - v.z;
  const denom = w > 0.1 ? w : 0.1;
  const focal = (size / 2) / Math.tan((fov * Math.PI / 180) / 2);
  return {
    x: -(v.x * focal) / denom + size / 2,
    y: -(v.y * focal) / denom + size / 2,
    depth: w,
  };
}

// Rotate around Y then X, then project with perspective foreshortening.
export function projectVertex(v: Vec3, yaw: number, pitch: number, distance: number, fov: number, size: number): ProjectedVertex {
  return projectTransformedVertex(transformVertex(v, yaw, pitch), distance, fov, size);
}

export function normalizeMeshToTargetRadius(vertices: readonly number[], targetRadius = TARGET_RADIUS): NormalizedMesh {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let populated = 0;
  for (let i = 0; i * 3 + 2 < vertices.length; i++) {
    const o = i * 3;
    const x = vertices[o], y = vertices[o + 1], z = vertices[o + 2];
    if (x === 0 && y === 0 && z === 0) continue;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    populated++;
  }
  if (populated === 0) {
    return { vertices: vertices.slice(), center: { x: 0, y: 0, z: 0 }, radius: 1, scale: 1 };
  }

  const center = {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    z: (minZ + maxZ) / 2,
  };
  let radius = 0;
  for (let i = 0; i * 3 + 2 < vertices.length; i++) {
    const o = i * 3;
    const x = vertices[o], y = vertices[o + 1], z = vertices[o + 2];
    if (x === 0 && y === 0 && z === 0) continue;
    radius = Math.max(radius, Math.hypot(x - center.x, y - center.y, z - center.z));
  }
  const scale = targetRadius / Math.max(radius, 1e-6);
  const fitted = new Array<number>(vertices.length).fill(0);
  for (let i = 0; i * 3 + 2 < vertices.length; i++) {
    const o = i * 3;
    const x = vertices[o], y = vertices[o + 1], z = vertices[o + 2];
    if (x === 0 && y === 0 && z === 0) continue;
    fitted[o] = (x - center.x) * scale;
    fitted[o + 1] = (y - center.y) * scale;
    fitted[o + 2] = (z - center.z) * scale;
  }
  return { vertices: fitted, center, radius, scale };
}

function signedArea2(a: ProjectedVertex, b: ProjectedVertex, c: ProjectedVertex): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function triangleNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
  const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
  return normalizeVec({
    x: uy * vz - uz * vy,
    y: uz * vx - ux * vz,
    z: ux * vy - uy * vx,
  });
}

function buildProjectedFrame(vertices: readonly number[], yaw: number, pitch: number, distance: number, fov: number, size: number): Array<FaceFrameVertex | null> {
  const out: Array<FaceFrameVertex | null> = [];
  for (let i = 0; i * 3 + 2 < vertices.length; i++) {
    const v = vert(vertices, i);
    if (!v || (v.x === 0 && v.y === 0 && v.z === 0)) {
      out.push(null);
      continue;
    }
    const t = transformVertex(v, yaw, pitch);
    const p = projectTransformedVertex(t, distance, fov, size);
    out.push({ ...p, tx: t.x, ty: t.y, tz: t.z });
  }
  return out;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

function clayRamp(bucket: number, bucketCount: number, tint?: string): string {
  const t = bucketCount <= 1 ? 1 : bucket / (bucketCount - 1);
  const base = mixHex('#6F5478', HARMONY_ACCENT, 0.55 + 0.35 * t);
  const lit = mixHex(base, '#F5EDF8', 0.18 + 0.38 * t);
  return tint ? mixHex(lit, tint, 0.35) : lit;
}

function severityColor(severity: BoneFinding['severity']): string {
  if (severity === 'mild') return Colors.warning;
  if (severity === 'moderate') return Colors.error;
  return '#7A1A1A';
}

function severityWeight(severity: BoneFinding['severity']): number {
  if (severity === 'marked') return 3;
  if (severity === 'moderate') return 2;
  return 1;
}

export interface BucketTrianglesInput {
  vertices: readonly number[];
  triangles: ReadonlyArray<readonly [number, number, number]>;
  yaw: number;
  pitch: number;
  distance: number;
  fov: number;
  size: number;
  bucketCount?: number;
  tintByVertex?: ReadonlyMap<number, string>;
}

export function bucketFrontFacingTriangles(input: BucketTrianglesInput): { runs: TriangleRun[]; frontFaceCount: number } {
  const bucketCount = Math.max(1, Math.floor(input.bucketCount ?? SHADE_BUCKETS));
  const frame = buildProjectedFrame(input.vertices, input.yaw, input.pitch, input.distance, input.fov, input.size);
  const buckets = new Map<string, { path: string; depthSum: number; count: number; fill: string; opacity: number }>();
  let frontFaceCount = 0;

  for (let i = 0; i < input.triangles.length; i++) {
    const [ai, bi, ci] = input.triangles[i];
    const a = frame[ai], b = frame[bi], c = frame[ci];
    if (!a || !b || !c) continue;
    const area = signedArea2(a, b, c);
    if (area >= -0.01) continue;

    const normal = triangleNormal(
      { x: a.tx, y: a.ty, z: a.tz },
      { x: b.tx, y: b.ty, z: b.tz },
      { x: c.tx, y: c.ty, z: c.tz },
    );
    const lambert = Math.max(0, normal.x * LIGHT.x + normal.y * LIGHT.y + normal.z * LIGHT.z);
    const luminance = 0.22 + 0.78 * lambert;
    const bucket = Math.max(0, Math.min(bucketCount - 1, Math.round(luminance * (bucketCount - 1))));
    const tint = input.tintByVertex?.get(ai) || input.tintByVertex?.get(bi) || input.tintByVertex?.get(ci);
    const key = `${bucket}:${tint || 'clay'}`;
    const fill = clayRamp(bucket, bucketCount, tint);
    const d = `M${a.x.toFixed(1)},${a.y.toFixed(1)}L${b.x.toFixed(1)},${b.y.toFixed(1)}L${c.x.toFixed(1)},${c.y.toFixed(1)}Z`;
    const depth = (a.depth + b.depth + c.depth) / 3;
    const prev = buckets.get(key);
    if (prev) {
      prev.path += d;
      prev.depthSum += depth;
      prev.count++;
    } else {
      buckets.set(key, { path: d, depthSum: depth, count: 1, fill, opacity: tint ? 0.92 : 1 });
    }
    frontFaceCount++;
  }

  return {
    frontFaceCount,
    runs: Array.from(buckets.entries())
      .map(([key, value]) => ({
        key,
        path: value.path,
        fill: value.fill,
        opacity: value.opacity,
        depth: value.depthSum / value.count,
      }))
      .sort((a, b) => b.depth - a.depth),
  };
}

function vertexRevealScore(vertices: readonly number[], idx: number): number {
  let maxAbsX = 1;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i * 3 + 2 < vertices.length; i++) {
    const o = i * 3;
    const x = vertices[o], y = vertices[o + 1], z = vertices[o + 2];
    if (x === 0 && y === 0 && z === 0) continue;
    maxAbsX = Math.max(maxAbsX, Math.abs(x));
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const o = idx * 3;
  const radial = Math.abs(vertices[o]) / maxAbsX;
  const vertical = maxY > minY ? (maxY - vertices[o + 1]) / (maxY - minY) : 0;
  // Mostly centre-out by |x|; a small top-to-bottom term makes the reveal feel
  // intentional while preserving exact left/right pair scores.
  return Math.max(0, Math.min(1, radial * 0.86 + vertical * 0.14));
}

export function revealedVertexIndices(vertices: readonly number[], revealProgress: number): Set<number> {
  const reveal = Number.isFinite(revealProgress) ? Math.max(0, Math.min(1, revealProgress)) : 1;
  const set = new Set<number>();
  for (let i = 0; i * 3 + 2 < vertices.length; i++) {
    if (!vertexHasContent(vertices, i)) continue;
    if (vertexRevealScore(vertices, i) <= reveal) set.add(i);
  }
  return set;
}

function buildVertexNormals(vertices: readonly number[], triangles: ReadonlyArray<readonly [number, number, number]>): Vec3[] {
  const normals = Array.from({ length: Math.floor(vertices.length / 3) }, () => ({ x: 0, y: 0, z: 0 }));
  for (const [ai, bi, ci] of triangles) {
    const a = vert(vertices, ai), b = vert(vertices, bi), c = vert(vertices, ci);
    if (!a || !b || !c) continue;
    const n = triangleNormal(a, b, c);
    for (const idx of [ai, bi, ci]) {
      normals[idx].x += n.x;
      normals[idx].y += n.y;
      normals[idx].z += n.z;
    }
  }
  return normals.map(normalizeVec);
}

type Segment = readonly [number, number];
type AngleSegment = readonly [number, number, number];

// Overlay tables are canonical-topology flat arrays — the per-source variants
// died with the fake ARKit index table, and the viewer always renders the
// canonical head, so `source` no longer selects a table.
function lineSegments(line: MeasurementLine): readonly Segment[] {
  // Runtime-checked union split: vertices is one segment or a list of them.
  return Array.isArray(line.vertices[0])
    ? (line.vertices as readonly Segment[])
    : [line.vertices as Segment];
}

function angleSegments(angle: MeasurementAngle): readonly AngleSegment[] {
  return [angle.vertices];
}

export const Face3DViewer: React.FC<Props> = ({
  vertices: rawVertices,
  source,
  mode = 'anatomy',
  size = 320,
  bone,
  lesions,
  revealProgress = 1,
  highlightMetric,
}) => {
  const reveal = Number.isFinite(revealProgress) ? Math.max(0, Math.min(1, revealProgress)) : 1;
  const vertices = useMemo(() => {
    const tripleCount = Math.floor(rawVertices.length / 3);
    if (tripleCount <= MAX_REFERENCED_INDEX) return buildCanonicalMesh();
    let blank = 0;
    let probed = 0;
    for (const [a, b] of CANONICAL_OUTLINE_EDGES.slice(0, 16)) {
      if (!vertexHasContent(rawVertices, a)) blank++;
      if (!vertexHasContent(rawVertices, b)) blank++;
      probed += 2;
    }
    return probed > 0 && blank / probed > 0.5 ? buildCanonicalMesh() : rawVertices;
  }, [rawVertices]);
  const fitted = useMemo(() => normalizeMeshToTargetRadius(vertices, TARGET_RADIUS).vertices, [vertices]);

  const [yaw, setYaw] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [distance, setDistance] = useState(DEFAULT_DISTANCE);
  const baseRef = useRef({ yaw: 0, pitch: 0, distance: DEFAULT_DISTANCE });
  const idleSince = useRef(Date.now());
  const appActive = useRef(true);

  useEffect(() => {
    const onState = (state: AppStateStatus) => {
      appActive.current = state === 'active';
    };
    const sub = AppState.addEventListener('change', onState);
    onState(AppState.currentState);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let raf = 0;
    let lastT = Date.now();
    let lastFrame = 0;
    const step = () => {
      const now = Date.now();
      const dt = (now - lastT) / 1000;
      lastT = now;
      if (appActive.current && now - lastFrame >= 33) {
        lastFrame = now;
        if (now - idleSince.current >= 1500) {
          setYaw((y) => y + 0.3 * Math.min(dt, 0.05));
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const pan = Gesture.Pan()
    .onStart(() => {
      idleSince.current = Date.now();
      baseRef.current = { yaw, pitch, distance };
    })
    .onUpdate((e) => {
      idleSince.current = Date.now();
      runOnJS(setYaw)(baseRef.current.yaw + e.translationX / 90);
      runOnJS(setPitch)(Math.max(-1.0, Math.min(1.0, baseRef.current.pitch - e.translationY / 120)));
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
      runOnJS(setDistance)(Math.max(130, Math.min(360, baseRef.current.distance / e.scale)));
    })
    .onEnd(() => {
      idleSince.current = Date.now();
    });

  const composed = Gesture.Simultaneous(pan, pinch);
  const projected = useMemo(() => buildProjectedFrame(fitted, yaw, pitch, distance, FOV, size), [fitted, yaw, pitch, distance, size]);
  const baseNormals = useMemo(() => buildVertexNormals(fitted, CANONICAL_TRIANGLES), [fitted]);
  const viewNormals = useMemo(() => baseNormals.map((n) => transformVertex(n, yaw, pitch)), [baseNormals, yaw, pitch]);
  const revealed = useMemo(() => revealedVertexIndices(fitted, reveal), [fitted, reveal]);

  const measurementLines = MEASUREMENT_LINES;
  const measurementAngles = MEASUREMENT_ANGLES;

  const findingByVertex = useMemo(() => {
    if (!bone || mode !== 'heatmap') return new Map<number, BoneFinding>();
    const map = new Map<number, BoneFinding>();
    for (const f of bone.findings) {
      for (const line of measurementLines) {
        if (line.metricKey !== (f.metric as BoneMetricKey)) continue;
        for (const [a, b] of lineSegments(line)) {
          map.set(a, f);
          map.set(b, f);
        }
      }
      for (const angle of measurementAngles) {
        if (angle.metricKey !== (f.metric as BoneMetricKey)) continue;
        for (const [a, c, b] of angleSegments(angle)) {
          map.set(a, f);
          map.set(c, f);
          map.set(b, f);
        }
      }
    }
    return map;
  }, [bone, mode, measurementLines, measurementAngles]);

  const tintByVertex = useMemo(() => {
    if (mode !== 'heatmap' || findingByVertex.size === 0) return undefined;
    const map = new Map<number, string>();
    for (const [idx, finding] of findingByVertex) map.set(idx, severityColor(finding.severity));
    return map;
  }, [findingByVertex, mode]);

  const triangleRuns = useMemo(() => bucketFrontFacingTriangles({
    vertices: fitted,
    triangles: CANONICAL_TRIANGLES,
    yaw,
    pitch,
    distance,
    fov: FOV,
    size,
    bucketCount: SHADE_BUCKETS,
    tintByVertex,
  }).runs, [fitted, yaw, pitch, distance, size, tintByVertex]);

  const frontEdges = useMemo(() => {
    const list: Array<{ a: number; b: number; score: number }> = [];
    for (const [a, b] of CANONICAL_OUTLINE_EDGES) {
      const pa = projected[a], pb = projected[b];
      if (!pa || !pb) continue;
      const na = viewNormals[a], nb = viewNormals[b];
      const visibleByNormal = (na?.z ?? 1) > -0.05 && (nb?.z ?? 1) > -0.05;
      if (!visibleByNormal) continue;
      list.push({ a, b, score: Math.max(vertexRevealScore(fitted, a), vertexRevealScore(fitted, b)) });
    }
    return list;
  }, [projected, viewNormals, fitted]);

  const lesionDots = useMemo(() => {
    if (mode !== 'skin' || !lesions || lesions.length === 0) return [];
    return lesions.map((les) => {
      const [bx, by, bw, bh] = les.bbox;
      const cx = bx + bw / 2;
      const cy = by + bh / 2;
      return projectVertex({ x: (0.5 - cx) * TARGET_RADIUS, y: (0.5 - cy) * TARGET_RADIUS * 1.25, z: TARGET_RADIUS * 0.35 }, yaw, pitch, distance, FOV, size);
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

            <G opacity={Math.max(0.08, reveal)}>
              {triangleRuns.map((run) => (
                <Path key={run.key} d={run.path} fill={run.fill} fillOpacity={run.opacity} stroke="none" />
              ))}
            </G>

            <G>
              {frontEdges.map(({ a, b, score }, i) => {
                if (score > reveal) return null;
                const pa = projected[a];
                const pb = projected[b];
                if (!pa || !pb) return null;
                const revealFade = Math.max(0, Math.min(1, (reveal - score) * 8 + 0.35));
                const frontness = Math.max(0, Math.min(1, ((viewNormals[a]?.z ?? 0.5) + (viewNormals[b]?.z ?? 0.5)) / 2));
                return (
                  <Line
                    key={`${a}-${b}-${i}`}
                    x1={pa.x} y1={pa.y}
                    x2={pb.x} y2={pb.y}
                    stroke={Colors.text}
                    strokeWidth={0.65 + 1.05 * frontness}
                    strokeOpacity={(0.18 + 0.55 * frontness) * revealFade}
                    strokeLinecap="round"
                  />
                );
              })}
            </G>

            <G>
              {projected.map((p, i) => {
                if (!p || !revealed.has(i)) return null;
                if ((viewNormals[i]?.z ?? 1) <= -0.02) return null;
                const frontness = Math.max(0, Math.min(1, viewNormals[i]?.z ?? 0.5));
                const revealFade = Math.max(0.35, Math.min(1, (reveal - vertexRevealScore(fitted, i)) * 8 + 0.35));
                if (mode === 'heatmap') {
                  const f = findingByVertex.get(i);
                  if (!f) return null;
                  const c = severityColor(f.severity);
                  return (
                    <G key={`l${i}`}>
                      <Circle cx={p.x} cy={p.y} r={10 + severityWeight(f.severity) * 2} fill={c} fillOpacity={0.16} />
                      <Circle cx={p.x} cy={p.y} r={4.5 + severityWeight(f.severity)} fill={c} fillOpacity={0.88} stroke={Colors.background} strokeWidth={1} />
                    </G>
                  );
                }
                return (
                  <Circle
                    key={`l${i}`}
                    cx={p.x} cy={p.y}
                    r={1.15 + 1.2 * frontness}
                    fill={HARMONY_ACCENT}
                    fillOpacity={(0.26 + 0.56 * frontness) * revealFade}
                  />
                );
              })}
            </G>

            {mode === 'measurements' && bone && (() => {
              const LABEL_H = FontSize.xxs + 4;
              type Candidate = { key: string; text: string; centerX: number; topY: number; width: number; fill: string };
              const candidates: Candidate[] = [];
              const guides: React.ReactNode[] = [];

              measurementLines.forEach((line, i) => {
                const highlighted = highlightMetric === line.metricKey;
                const stroke = highlighted ? Colors.warning : HARMONY_ACCENT;
                const strokeOpacity = highlightMetric && !highlighted ? 0.34 : 0.78;
                let labelPoint: { x: number; y: number } | null = null;
                for (const [j, [aIdx, bIdx]] of lineSegments(line).entries()) {
                  const pa = projected[aIdx];
                  const pb = projected[bIdx];
                  if (!pa || !pb) continue;
                  guides.push(
                    <Line key={`ml${i}-${j}`} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                      stroke={stroke} strokeWidth={highlighted ? 2.2 : 1.25} strokeOpacity={strokeOpacity} strokeDasharray="3,3" />,
                  );
                  labelPoint ||= { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
                }
                if (!labelPoint) return;
                const value = bone.metrics?.[line.metricKey]?.value;
                if (!Number.isFinite(value)) return;
                const text = `${line.label}  ${formatMetricValue(line.metricKey, value as number)}`;
                candidates.push({
                  key: `ll${i}`,
                  text,
                  centerX: labelPoint.x,
                  topY: labelPoint.y - LABEL_H - 4,
                  width: text.length * 4.2 + 10,
                  fill: stroke,
                });
              });

              measurementAngles.forEach((arc, i) => {
                const highlighted = highlightMetric === arc.metricKey;
                const stroke = highlighted ? Colors.warning : HARMONY_ACCENT;
                const strokeOpacity = highlightMetric && !highlighted ? 0.34 : 0.74;
                let labelPoint: { x: number; y: number } | null = null;
                for (const [j, [aIdx, cIdx, bIdx]] of angleSegments(arc).entries()) {
                  const pa = projected[aIdx];
                  const pc = projected[cIdx];
                  const pb = projected[bIdx];
                  if (!pa || !pc || !pb) continue;
                  guides.push(
                    <G key={`ma${i}-${j}`}>
                      <Line x1={pc.x} y1={pc.y} x2={pa.x} y2={pa.y} stroke={stroke} strokeWidth={highlighted ? 2 : 1.1} strokeOpacity={strokeOpacity} />
                      <Line x1={pc.x} y1={pc.y} x2={pb.x} y2={pb.y} stroke={stroke} strokeWidth={highlighted ? 2 : 1.1} strokeOpacity={strokeOpacity} />
                    </G>,
                  );
                  labelPoint ||= { x: pc.x, y: pc.y };
                }
                if (!labelPoint) return;
                const value = bone.metrics?.[arc.metricKey]?.value;
                if (!Number.isFinite(value)) return;
                const text = `${arc.label}  ${formatMetricValue(arc.metricKey, value as number)}`;
                candidates.push({
                  key: `la${i}`,
                  text,
                  centerX: labelPoint.x + text.length * 2.2 + 6,
                  topY: labelPoint.y - LABEL_H - 6,
                  width: text.length * 4.2 + 10,
                  fill: stroke,
                });
              });

              const boxes: LabelBox[] = candidates.map((c) => ({ x: c.centerX, y: c.topY, width: c.width, height: LABEL_H }));
              const resolved = resolveLabelCollisions(boxes, 3);

              return (
                <G>
                  {guides}
                  {candidates.map((c, idx) => {
                    const b = resolved[idx];
                    const baselineY = b.y + LABEL_H - 3;
                    return (
                      <G key={c.key}>
                        <Rect x={b.x - b.width / 2} y={b.y} width={b.width} height={LABEL_H} rx={6}
                          fill={Colors.background} fillOpacity={0.86} />
                        <SvgText x={b.x} y={baselineY} fontSize={FontSize.xxs} fontFamily={FontFamily.sansMedium}
                          fill={c.fill} textAnchor="middle">
                          {c.text}
                        </SvgText>
                      </G>
                    );
                  })}
                </G>
              );
            })()}

            {mode === 'skin' && lesionDots.length > 0 && (
              <G>
                {lesionDots.map((p, i) => (
                  <Circle key={`lesion${i}`} cx={p.x} cy={p.y} r={4} fill={Colors.acne} fillOpacity={0.85} />
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
