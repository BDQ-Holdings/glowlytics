import type { PermissionStatus } from '../types';

interface CameraPermissionLike {
  status?: string;
  granted?: boolean;
  canAskAgain?: boolean;
}

export const getCameraPermissionStatus = (
  permission?: CameraPermissionLike | null
): PermissionStatus => {
  if (!permission || permission.status === 'undetermined') {
    return 'not_requested';
  }

  if (permission.granted) {
    return 'granted';
  }

  if (permission.canAskAgain === false) {
    return 'blocked';
  }

  return 'denied';
};
