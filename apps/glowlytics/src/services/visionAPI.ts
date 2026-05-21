import { env } from '../config/env';
import { getAuthHeaders } from './api';
import { httpJson, ApiError } from './httpClient';
import { safeClamp } from '../utils/safeClamp';
import type {
  Confidence,
  DetectedCondition,
  DetectedLesion,
  GeneratedInsights,
  RagRecommendation,
  SignalConfidence,
  SignalFeatures,
  SignalScores,
  ZoneSeverity,
} from '../types';

/**
 * Validate signal scores from the backend — reject NaN/undefined/non-finite.
 * Returns undefined if ALL values are invalid (client falls through to
 * deriveCompositeSignals). Replaces individual invalid values with 50 (neutral).
 */
function sanitizeSignalScores(scores: any): SignalScores | undefined {
  if (!scores || typeof scores !== 'object') return undefined;
  const keys: (keyof SignalScores)[] = ['structure', 'hydration', 'inflammation', 'sunDamage', 'elasticity'];
  let validCount = 0;
  const result = {} as SignalScores;
  for (const k of keys) {
    const v = scores[k];
    if (Number.isFinite(v)) {
      result[k] = Math.max(0, Math.min(100, Math.round(v)));
      validCount++;
    } else {
      result[k] = 50; // neutral fallback
    }
  }
  return validCount > 0 ? result : undefined;
}

export interface VisionAnalysisResult {
  acne_score: number;
  sun_damage_score: number;
  skin_age_score: number;
  confidence: Confidence;
  primary_driver: string;
  recommended_action: string;
  conditions?: DetectedCondition[];
  rag_recommendations?: RagRecommendation[];
  personalized_feedback?: string;
  signal_scores?: SignalScores;
  signal_features?: SignalFeatures;
  lesions?: DetectedLesion[];
  signal_confidence?: SignalConfidence;
  zone_severity?: ZoneSeverity;
}

export async function imageToBase64(uri: string): Promise<string> {
  // Use the legacy API — SDK 54 deprecated the top-level readAsStringAsync
  const FileSystem = await import('expo-file-system/legacy');
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return base64;
}

export async function analyzeWithVisionAPI(
  photoUri: string,
  context: {
    primary_goal: string;
    scan_region: string;
    sunscreen_used: boolean;
    sleep_quality?: string;
    stress_level?: string;
    scan_count: number;
  },
  preEncodedBase64?: string,
): Promise<VisionAnalysisResult> {
  const base64Image = preEncodedBase64 || await imageToBase64(photoUri);

  // Vision analyze is expensive on the backend (GPT-4o + RAG). Cap retries at
  // 1 (so 2 attempts max) to avoid duplicate paid calls when the backend is
  // legitimately busy. httpClient handles the timeout, backoff, and Retry-After.
  const result = await httpJson<Record<string, unknown>>(`${env.API_BASE_URL}/api/vision/analyze`, {
    method: 'POST',
    body: {
      image_base64: base64Image,
      context: {
        primary_goal: context.primary_goal,
        scan_region: context.scan_region,
        sunscreen_used: context.sunscreen_used,
        sleep_quality: context.sleep_quality,
        stress_level: context.stress_level,
        scan_count: context.scan_count,
      },
    },
    timeoutMs: 15_000,
    retries: 1,
  }).catch((err) => {
    // Preserve the existing message shape for telemetry continuity.
    if (err instanceof ApiError && err.status > 0) {
      throw new Error(`Vision API error (${err.status}): ${err.body || err.message}`);
    }
    throw err;
  });

  // Validate the response shape — backend output is trusted but we still clamp
  // numerics and pin the confidence enum so a malformed reply can't corrupt
  // downstream insight calculations.
  const clamp = safeClamp;
  return {
    acne_score: clamp(result.acne_score as number),
    sun_damage_score: clamp(result.sun_damage_score as number),
    skin_age_score: clamp(result.skin_age_score as number),
    confidence: (['low', 'med', 'high'].includes(result.confidence as string) ? result.confidence : 'low') as Confidence,
    primary_driver: (result.primary_driver as string) || 'general tracking',
    recommended_action: (result.recommended_action as string) || 'Continue daily scans for more data.',
    conditions: result.conditions as DetectedCondition[] | undefined,
    rag_recommendations: result.rag_recommendations as RagRecommendation[] | undefined,
    personalized_feedback: result.personalized_feedback as string | undefined,
    signal_scores: sanitizeSignalScores(result.signal_scores),
    signal_features: result.signal_features as SignalFeatures | undefined,
    lesions: result.lesions as DetectedLesion[] | undefined,
    signal_confidence: result.signal_confidence as SignalConfidence | undefined,
    zone_severity: result.zone_severity as ZoneSeverity | undefined,
  };
}

/**
 * Stage 2: Stream personalized insights from the backend via SSE.
 * Calls /api/vision/generate-insights with merged Stage 1 data.
 *
 * Uses XMLHttpRequest with onprogress for React Native compatibility
 * (fetch ReadableStream is not supported on Hermes/React Native).
 *
 * @param params Stage 1 results + user context for insight generation
 * @param onChunk Called with each streamed text chunk for live display
 * @returns Parsed GeneratedInsights JSON once stream completes
 */
export async function streamInsights(
  params: {
    signal_scores: SignalScores;
    signal_features?: SignalFeatures;
    signal_confidence?: SignalConfidence;
    lesions?: DetectedLesion[];
    conditions?: DetectedCondition[];
    zone_severity?: ZoneSeverity;
    user_profile?: Record<string, unknown>;
    user_goal?: string;
    products?: Array<{ product_name: string; usage_schedule: string }>;
    scan_count?: number;
    rag_context?: RagRecommendation[];
    /**
     * Rolling 7-day HealthKit averages so L3 GPT-4o can ground pattern-level
     * insights ("your average sleep dropped 1h this week") instead of only
     * referencing the single scan's lifestyle log. Built by the caller from
     * `healthDailyRecords` — null fields mean "no signal this week".
     */
    healthkit_context?: {
      window_days: number;
      sleep_total_minutes_avg: number | null;
      sleep_deep_minutes_avg: number | null;
      sleep_rem_minutes_avg: number | null;
      hrv_sdnn_ms_avg: number | null;
      resting_hr_bpm_avg: number | null;
      steps_avg: number | null;
      mindful_minutes_avg: number | null;
      menstrual_flow_last7: string | null;
      cycle_day: number | null;
    };
  },
  onChunk: (text: string) => void,
): Promise<GeneratedInsights | null> {
  const authHeaders = await getAuthHeaders();

  return new Promise((resolve) => {
    let fullText = '';
    let processedLength = 0;
    const timeoutId = setTimeout(() => {
      xhr.abort();
      resolve(parseInsightsFromText(fullText));
    }, 15_000); // 15s max for streaming (not 30 — avoid blocking UX)

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${env.API_BASE_URL}/api/vision/generate-insights`);

    // Set headers from auth
    for (const [key, value] of Object.entries(authHeaders)) {
      if (typeof value === 'string') {
        xhr.setRequestHeader(key, value);
      }
    }

    xhr.onprogress = () => {
      // Process new data since last onprogress
      const newData = xhr.responseText.slice(processedLength);
      processedLength = xhr.responseText.length;

      const lines = newData.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          if (parsed.text) {
            fullText += parsed.text;
            onChunk(parsed.text);
          }
        } catch {
          // Skip malformed SSE chunks
        }
      }
    };

    xhr.onload = () => {
      clearTimeout(timeoutId);
      // XHR never rejects on HTTP error status — it just fires onload with the
      // failing response. Without this check, a 401 / 500 from
      // /api/vision/generate-insights would silently resolve to null and the
      // caller (fire-and-forget in analyzing.tsx) would have no idea the
      // backend rejected the request.
      if (xhr.status < 200 || xhr.status >= 300) {
        const snippet = (xhr.responseText || '').slice(0, 200);
        console.warn(`[Glowlytics] Insight stream HTTP ${xhr.status}: ${snippet}`);
        resolve(null);
        return;
      }
      resolve(parseInsightsFromText(fullText));
    };

    xhr.onerror = () => {
      clearTimeout(timeoutId);
      console.warn('[Glowlytics] Insight stream XHR error');
      resolve(null);
    };

    xhr.onabort = () => {
      clearTimeout(timeoutId);
      resolve(parseInsightsFromText(fullText));
    };

    xhr.send(JSON.stringify(params));
  });
}

/** Extract and parse the GeneratedInsights JSON from accumulated GPT text. */
function parseInsightsFromText(text: string): GeneratedInsights | null {
  if (!text) return null;

  try {
    // Find balanced JSON object — match first { to its closing }
    let depth = 0;
    let start = -1;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (text[i] === '}') {
        depth--;
        if (depth === 0 && start >= 0) {
          const jsonStr = text.slice(start, i + 1);
          return JSON.parse(jsonStr) as GeneratedInsights;
        }
      }
    }
  } catch (err) {
    console.warn('[Glowlytics] Failed to parse insights JSON:', err);
  }

  return null;
}
