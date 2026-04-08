import { Platform } from 'react-native';
import {
  isHealthDataAvailableAsync,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';
import type {
  HealthConnectionState,
  HealthDataType,
  HealthSource,
  PermissionStatus,
} from '../types';

const REQUESTED_TYPES: HealthDataType[] = [
  'sleep',
  'resting_heart_rate',
  'heart_rate_variability',
];

// HealthKit identifiers we ask to read. String literals per
// @kingstinct/react-native-healthkit v13.x typings.
const READ_IDENTIFIERS = [
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKCategoryTypeIdentifierMindfulSession',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierStepCount',
] as const;

export const getHealthSourceLabel = (source?: HealthSource) => {
  if (source === 'apple_health') return 'Apple Health';
  if (source === 'health_connect') return 'Health Connect';
  return 'Health data';
};

export const getHealthConnectionState = async (
  _priorStatus?: PermissionStatus,
): Promise<HealthConnectionState> => {
  if (Platform.OS !== 'ios') {
    return {
      source: Platform.OS === 'android' ? 'health_connect' : undefined,
      status: 'unavailable',
      requested_types: REQUESTED_TYPES,
      granted_types: [],
      sync_skipped: false,
      last_checked_at: new Date().toISOString(),
      availability_note: 'Health data requires iOS for v1.',
    };
  }

  try {
    const available = await isHealthDataAvailableAsync();
    if (!available) {
      return {
        source: 'apple_health',
        status: 'unavailable',
        requested_types: REQUESTED_TYPES,
        granted_types: [],
        sync_skipped: false,
        last_checked_at: new Date().toISOString(),
        availability_note: 'Apple Health is not available on this device.',
      };
    }
    return {
      source: 'apple_health',
      status: 'not_requested',
      requested_types: REQUESTED_TYPES,
      granted_types: [],
      sync_skipped: false,
      last_checked_at: new Date().toISOString(),
    };
  } catch (e: any) {
    return {
      source: 'apple_health',
      status: 'unavailable',
      requested_types: REQUESTED_TYPES,
      granted_types: [],
      sync_skipped: false,
      last_checked_at: new Date().toISOString(),
      availability_note: `Apple Health init failed: ${e?.message ?? e}`,
    };
  }
};

/**
 * Request HealthKit read authorization for sleep, HRV, RHR, steps, and mindful.
 *
 * NOTE: HealthKit does not report per-type READ grants for privacy reasons —
 * Apple explicitly hides this to prevent apps from inferring which data the
 * user has. `granted_types` therefore stays empty here. Downstream code should
 * infer actual grants by observing which fields come back non-null from
 * `pullLastNDays` and update `HealthConnectionState.granted_types` accordingly.
 */
export const connectHealthData = async (
  _priorStatus?: PermissionStatus,
): Promise<HealthConnectionState> => {
  if (Platform.OS !== 'ios') {
    return getHealthConnectionState();
  }

  try {
    const ok = await requestAuthorization({ toRead: READ_IDENTIFIERS });
    if (!ok) {
      return {
        source: 'apple_health',
        status: 'denied',
        requested_types: REQUESTED_TYPES,
        granted_types: [],
        sync_skipped: false,
        last_checked_at: new Date().toISOString(),
        availability_note: 'HealthKit authorization dialog did not complete.',
      };
    }
    return {
      source: 'apple_health',
      status: 'granted',
      requested_types: REQUESTED_TYPES,
      granted_types: [], // See JSDoc — HealthKit does not disclose per-type reads.
      sync_skipped: false,
      last_checked_at: new Date().toISOString(),
    };
  } catch (e: any) {
    return {
      source: 'apple_health',
      status: 'denied',
      requested_types: REQUESTED_TYPES,
      granted_types: [],
      sync_skipped: false,
      last_checked_at: new Date().toISOString(),
      availability_note: `Permission request failed: ${e?.message ?? e}`,
    };
  }
};

export const getHealthDataPreview = async (
  _state: Pick<HealthConnectionState, 'source' | 'granted_types'>,
): Promise<Partial<Record<HealthDataType, boolean>>> => {
  // Not used in v1 — return empty.
  return {};
};
