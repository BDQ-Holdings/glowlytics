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

export const connectHealthData = async (
  _priorStatus?: PermissionStatus,
): Promise<HealthConnectionState> => {
  if (Platform.OS !== 'ios') {
    return getHealthConnectionState();
  }

  try {
    // requestAuthorization resolves `true` on success. The user may still
    // deny individual types — HealthKit does not report per-type grants.
    await requestAuthorization({ toRead: READ_IDENTIFIERS });
    return {
      source: 'apple_health',
      status: 'granted',
      requested_types: REQUESTED_TYPES,
      granted_types: REQUESTED_TYPES,
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
