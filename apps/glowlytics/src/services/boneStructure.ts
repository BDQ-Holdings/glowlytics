/**
 * Bone-structure / Harmony — on-device analyzer with optional backend
 * persistence.
 *
 * The full math (metrics → scoring → findings → interventions) runs locally
 * via `onDeviceBoneStructure` + `boneInterventions`, eliminating the
 * `/api/vision/bone-structure` round-trip from the user-visible scan flow.
 *
 * Backend POST is now strictly a best-effort persistence call so that MCP
 * queries (which read `model_outputs.bone_structure`) eventually see this
 * scan. When the persist call fails or times out the local result is still
 * returned with `persisted: false`, and `syncOutbox` (driven by the caller)
 * handles the retry.
 */

import { env } from '../config/env';
import { ApiError, httpJson } from './httpClient';
import { analyzeBoneStructure as analyzeLocal } from './onDeviceBoneStructure';
import { recommendInterventions } from './boneInterventions';
import type {
  BoneDomain,
  BoneStructureResult,
  CapturedFaceMesh,
} from '../types';

interface AnalyzeArgs {
  mesh: CapturedFaceMesh;
  dailyId?: string;
  sexOverride?: 'male' | 'female';
}

function clampHarmony(v: number | null): number | null {
  if (v == null) return null;
  if (!Number.isFinite(v)) return null;
  return Math.max(0, Math.min(100, Math.round(v)));
}

/**
 * Compute bone-structure analysis on-device.
 *
 * `dailyId` is optional. When supplied we fire a best-effort persistence POST
 * to the backend so MCP tooling can read the result back later. The local
 * computation is always returned regardless of network outcome.
 */
export async function analyzeBoneStructure(
  { mesh, dailyId, sexOverride }: AnalyzeArgs,
): Promise<BoneStructureResult> {
  if (!mesh?.vertices?.length || mesh.vertices.length % 3 !== 0) {
    throw new Error('mesh.vertices must be a flat xyz array (length divisible by 3)');
  }

  // --- On-device analysis (the only path that produces user-visible scores) ---
  const t0 = Date.now();
  const analysis = analyzeLocal({
    vertices: mesh.vertices,
    blendShapes: mesh.blendShapes ?? null,
    indices: mesh.indices ?? null,
    sex: sexOverride ?? null,
    source: mesh.source,
  });
  const interventions = recommendInterventions(analysis.findings);
  const localLatencyMs = Date.now() - t0;

  const result: BoneStructureResult = {
    harmony: clampHarmony(analysis.harmony),
    status: analysis.status,
    domain_scores: analysis.domainScores as Partial<Record<BoneDomain, number | null>>,
    scored_metrics: analysis.scored,
    metrics: analysis.metrics,
    findings: analysis.findings,
    interventions,
    dominant_driver: analysis.dominantDriver,
    downsampled_mesh: { vertices: Array.from(mesh.vertices), source: mesh.source },
    source: mesh.source,
    sex: analysis.sex,
    estimate: analysis.estimate,
    confidence: analysis.confidence,
    landmark_source: analysis.landmark_source,
    generated_at: new Date().toISOString(),
    latency_ms: localLatencyMs,
    persisted: false,
  };

  // --- Backend persistence (best effort, never blocks the UI on failure) ---
  if (!dailyId) return result;

  const body: Record<string, unknown> = {
    mesh: {
      vertices: mesh.vertices,
      blendShapes: mesh.blendShapes,
      indices: mesh.indices,
      source: mesh.source,
    },
    daily_id: dailyId,
  };
  if (sexOverride) body.sex_override = sexOverride;

  try {
    const persisted = await httpJson<{ persisted?: boolean }>(
      `${env.API_BASE_URL}/api/vision/bone-structure`,
      {
        method: 'POST',
        body,
        // Server-side computation is duplicative but cheap (<500ms);
        // keep the persist window tight so a slow backend never strands
        // the scan UI.
        timeoutMs: 8_000,
        retries: 1,
      },
    );
    result.persisted = persisted?.persisted === true;
  } catch (err) {
    if (err instanceof ApiError && err.status > 0) {
      // 4xx/5xx — surface for telemetry but don't fail the scan.
      if (__DEV__) {
        console.warn(`[boneStructure] Persist API ${err.status}: ${err.body || err.message}`);
      }
    } else if (__DEV__) {
      console.warn('[boneStructure] Persist failed:', (err as Error)?.message);
    }
    // Local result is still returned with `persisted: false` so the caller's
    // syncOutbox retry path engages.
  }

  return result;
}
