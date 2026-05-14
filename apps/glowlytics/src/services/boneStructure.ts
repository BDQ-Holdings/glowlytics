/**
 * Bone-structure / Harmony API client.
 *
 * Mirrors the visionAPI.ts pattern: builds the request, calls httpJson
 * (CLAUDE.md mandate), validates the response shape, throws on transport
 * errors with the existing ApiError surface.
 */

import { env } from '../config/env';
import { ApiError, httpJson } from './httpClient';
import type {
  BoneMeshSource,
  BoneStructureResult,
  CapturedFaceMesh,
  InterventionBundle,
} from '../types';

interface AnalyzeArgs {
  mesh: CapturedFaceMesh;
  dailyId?: string;
  sexOverride?: 'male' | 'female';
}

const EMPTY_INTERVENTIONS: InterventionBundle = {
  lifestyle: [],
  pharmacological: [],
  interventional: [],
  procedural_disclaimer: '',
};

function clampNumber(v: unknown, lo = 0, hi = 100): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function asSource(v: unknown): BoneMeshSource {
  return v === 'arkit' ? 'arkit' : 'mediapipe';
}

export async function analyzeBoneStructure(
  { mesh, dailyId, sexOverride }: AnalyzeArgs,
): Promise<BoneStructureResult> {
  if (!mesh?.vertices?.length || mesh.vertices.length % 3 !== 0) {
    throw new Error('mesh.vertices must be a flat xyz array (length divisible by 3)');
  }

  // The server doesn't read `mesh.indices` — connectivity is derived from
  // CANONICAL_OUTLINE_EDGES on the viewer side. Dropping it here saves ~30 KB
  // of bandwidth per ARKit capture (and removes a confusing accepted-but-unused
  // field from the wire shape).
  const body: Record<string, unknown> = {
    mesh: {
      vertices: mesh.vertices,
      blendShapes: mesh.blendShapes,
      source: mesh.source,
    },
  };
  if (dailyId) body.daily_id = dailyId;
  if (sexOverride) body.sex_override = sexOverride;

  let result: Record<string, unknown>;
  try {
    result = await httpJson<Record<string, unknown>>(
      `${env.API_BASE_URL}/api/vision/bone-structure`,
      {
        method: 'POST',
        body,
        // Mesh payload + scoring runs in <500ms server-side typically.
        timeoutMs: 15_000,
        retries: 1,
      },
    );
  } catch (err) {
    if (err instanceof ApiError && err.status > 0) {
      throw new Error(`Bone-structure API error (${err.status}): ${err.body || err.message}`);
    }
    throw err;
  }

  return {
    harmony: clampNumber(result.harmony),
    status: (result.status === 'ok' || result.status === 'no_face' || result.status === 'insufficient')
      ? result.status
      : 'insufficient',
    domain_scores: (result.domain_scores as BoneStructureResult['domain_scores']) || {},
    scored_metrics: (result.scored_metrics as Record<string, number>) || {},
    metrics: (result.metrics as BoneStructureResult['metrics']) || {},
    findings: Array.isArray(result.findings) ? (result.findings as BoneStructureResult['findings']) : [],
    interventions: (result.interventions as InterventionBundle) || EMPTY_INTERVENTIONS,
    dominant_driver: (result.dominant_driver as BoneStructureResult['dominant_driver']) || null,
    downsampled_mesh: (result.downsampled_mesh as BoneStructureResult['downsampled_mesh']) || null,
    source: asSource(result.source),
    sex: result.sex === 'male' || result.sex === 'female' ? result.sex : null,
    generated_at: (result.generated_at as string) || new Date().toISOString(),
    latency_ms: typeof result.latency_ms === 'number' ? result.latency_ms : undefined,
    persisted: typeof result.persisted === 'boolean' ? result.persisted : undefined,
  };
}
