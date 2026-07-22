// The native module only exists after `expo prebuild` + an iOS build; under
// jest (like Expo Go and Android) requireOptionalNativeModule returns null.
// The JS wrapper must degrade to a silent no-op so the capture path in
// app/scan/camera.tsx can call it unconditionally.
import { setExcludedFromBackup } from '..';

describe('expo-backup-exclusion fallback', () => {
  it('resolves false without throwing when the native module is absent', async () => {
    await expect(setExcludedFromBackup('file://doc/scan_photos/')).resolves.toBe(false);
  });
});
