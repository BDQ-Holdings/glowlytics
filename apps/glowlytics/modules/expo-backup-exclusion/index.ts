/**
 * expo-backup-exclusion — JS entry point.
 *
 * When the native module is linked (after `expo prebuild` + an iOS native
 * build), `requireOptionalNativeModule` returns the Swift implementation
 * that sets URLResourceValues.isExcludedFromBackup on a file or directory.
 *
 * In development (Expo Go, Jest, Android, or any environment where the
 * native module isn't linked), calls resolve to `false` (no-op) so the
 * rest of the app can continue to work.
 */
import { requireOptionalNativeModule } from 'expo-modules-core';

interface ExpoBackupExclusionNative {
  setExcludedFromBackup(path: string): Promise<boolean>;
}

const nativeModule = requireOptionalNativeModule<ExpoBackupExclusionNative>('ExpoBackupExclusionModule');

/**
 * Marks the file or directory at `path` as excluded from iCloud/iTunes
 * device backups (NSURLIsExcludedFromBackupKey). Accepts both file:// URLs
 * (what expo-file-system hands out) and plain filesystem paths.
 *
 * Resolves `true` when the flag was applied, `false` when the native module
 * is unavailable (Expo Go, Jest, Android) or the call failed — callers treat
 * exclusion as best-effort, so this never rejects.
 */
export async function setExcludedFromBackup(path: string): Promise<boolean> {
  if (!nativeModule) return false;
  try {
    return await nativeModule.setExcludedFromBackup(path);
  } catch {
    return false;
  }
}
