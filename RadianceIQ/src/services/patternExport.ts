import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import type { Pattern } from '../types';
import { trackEvent } from './analytics';

/**
 * Export a pattern to a temp PNG and invoke the native share sheet.
 * This is called from pattern card share buttons and the detail screen.
 *
 * Implementation note: the PatternExportCard component must already be
 * mounted off-screen (via a hidden container on the screen that triggers
 * the share). In practice we use a ref-based approach — the caller mounts
 * the component hidden and passes the ref here.
 *
 * For v1, we use a simpler approach: mount the card in a transparent
 * off-screen container controlled by the calling screen, capture via
 * ref, hand to share sheet, unmount.
 */
export async function exportPatternToFile(ref: any): Promise<string> {
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
    // Best-effort cleanup
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch {
      // ignore
    }
  }
}

/**
 * Convenience: caller passes a Pattern, we handle the rest.
 * This version requires the caller to have a ref to a mounted PatternExportCard.
 * Since screens that invoke this do so via a button tap, the simplest pattern is:
 *
 *   1. On share button tap, set state `sharingPattern = pattern`
 *   2. Mount <PatternExportCard ref={exportRef} pattern={sharingPattern} /> hidden
 *   3. useEffect on sharingPattern: call exportAndSharePattern(pattern, exportRef)
 *   4. Clear sharingPattern after share completes
 *
 * See Task 25 for the wiring into screens.
 */
export async function exportAndSharePattern(
  pattern: Pattern,
  ref?: any,
): Promise<void> {
  if (!ref || !ref.current) {
    // Fallback: share just the text headline via share sheet
    if (await Sharing.isAvailableAsync()) {
      // expo-sharing requires a file; fall back to a simple text-only share via native API
      // For now, log and skip — the ref-based path is the supported flow
      trackEvent('pattern_export_failed', { error: 'no_ref' });
    }
    return;
  }
  try {
    const uri = await exportPatternToFile(ref);
    await sharePatternFile(pattern, uri);
  } catch (e: any) {
    trackEvent('pattern_export_failed', { error: e?.message ?? String(e) });
  }
}
