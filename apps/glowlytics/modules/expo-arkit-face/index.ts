/**
 * expo-arkit-face — JS entry point.
 *
 * When the native module is linked (after `expo prebuild` + `npm run ios`
 * with the iOS native build), `requireNativeModule` returns the Swift
 * implementation that wraps ARFaceTrackingConfiguration.
 *
 * In development (Expo Go, Jest, or any environment where the native
 * module isn't linked), all calls fall through to no-ops / safe defaults
 * so the rest of the app can continue to work.
 */
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { ARFaceCaptureFrame } from './types';

interface ExpoArkitFaceNative {
  isSupported(): Promise<boolean>;
  startTracking(): Promise<void>;
  stopTracking(): Promise<void>;
  captureFrame(): Promise<ARFaceCaptureFrame | null>;
}

const nativeModule = requireOptionalNativeModule<ExpoArkitFaceNative>('ExpoArkitFaceModule');

export async function isSupported(): Promise<boolean> {
  if (!nativeModule) return false;
  try { return await nativeModule.isSupported(); } catch { return false; }
}

export async function startTracking(): Promise<void> {
  if (!nativeModule) return;
  await nativeModule.startTracking();
}

export async function stopTracking(): Promise<void> {
  if (!nativeModule) return;
  await nativeModule.stopTracking();
}

export async function captureFrame(): Promise<ARFaceCaptureFrame | null> {
  if (!nativeModule) return null;
  return nativeModule.captureFrame();
}

export type { ARFaceCaptureFrame };
