export type ScanEntryRoute = '/scan/ai-consent' | '/scan/camera';

export function resolveScanEntryRoute(aiProcessingConsentGranted: boolean): ScanEntryRoute {
  return aiProcessingConsentGranted ? '/scan/camera' : '/scan/ai-consent';
}
