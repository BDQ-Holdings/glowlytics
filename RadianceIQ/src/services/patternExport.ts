import type { Pattern } from '../types';
import { trackEvent } from './analytics';

/**
 * Export a pattern to a temp PNG and invoke the native share sheet.
 *
 * All native module imports (react-native-view-shot, expo-sharing, expo-file-system)
 * are loaded lazily inside the functions that need them. This prevents
 * TurboModuleRegistry.getEnforcing crashes when the module is imported
 * in a JS bundle running on a dev client that doesn't have the native
 * module compiled in (e.g., older EAS builds).
 */
export async function exportPatternToFile(ref: any): Promise<string> {
  const { captureRef } = require('react-native-view-shot');
  const uri = await captureRef(ref, {
    format: 'png',
    quality: 1.0,
    width: 1080,
    height: 1920,
    result: 'tmpfile',
  });
  return uri;
}

export async function sharePatternFile(pattern: Pattern, uri: string): Promise<void> {
  try {
    const Sharing = require('expo-sharing');
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share this pattern',
        UTI: 'public.png',
      });
      trackEvent('pattern_shared', {
        pattern_id: pattern.id,
        pattern_type: pattern.type,
        confidence: pattern.confidence,
      });
    }
  } catch (e: any) {
    trackEvent('pattern_export_failed', { error: e?.message ?? String(e) });
  } finally {
    try {
      const FileSystem = require('expo-file-system/legacy');
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch {
      // ignore
    }
  }
}

export async function exportAndSharePattern(
  pattern: Pattern,
  ref?: any,
): Promise<void> {
  if (!ref || !ref.current) {
    trackEvent('pattern_export_failed', { error: 'no_ref' });
    return;
  }
  try {
    const uri = await exportPatternToFile(ref);
    await sharePatternFile(pattern, uri);
  } catch (e: any) {
    trackEvent('pattern_export_failed', { error: e?.message ?? String(e) });
  }
}
