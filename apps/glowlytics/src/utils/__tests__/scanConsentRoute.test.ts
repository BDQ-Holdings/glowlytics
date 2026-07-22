import { resolveScanEntryRoute } from '../scanConsentRoute';

describe('resolveScanEntryRoute', () => {
  it('sends users to the consent disclosure before the camera when AI sharing is not approved', () => {
    expect(resolveScanEntryRoute(false)).toBe('/scan/ai-consent');
  });

  it('allows the camera route only after AI processing consent is granted', () => {
    expect(resolveScanEntryRoute(true)).toBe('/scan/camera');
  });
});
