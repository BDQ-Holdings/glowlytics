import { Alert } from 'react-native';
import { resetAnalytics, trackEvent } from './analytics';

type ClerkSignOut = { signOut: () => Promise<void> } | null | undefined;

/**
 * Shared sign-out confirmation for account/settings surfaces. Keep store access
 * lazy to avoid a service ↔ store import cycle, and treat Clerk as best-effort:
 * once the user confirms sign-out we must still clear device-local data so the
 * next account on a shared device cannot inherit it.
 */
export function confirmSignOut(clerk: ClerkSignOut): void {
  Alert.alert(
    'Sign out',
    'Are you sure you want to sign out?',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          try {
            trackEvent('auth_sign_out');
            resetAnalytics();
            await clerk?.signOut().catch(() => {});
            // Lazy require to avoid importing the Zustand store at service
            // module-load time (same pattern as accountDeletion.ts).
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { useStore } = require('../store/useStore');
            await useStore.getState().resetAll();
            // AuthRedirector handles navigation when Clerk reports signed-out.
          } catch {
            Alert.alert('Sign out failed', 'Please try again.');
          }
        },
      },
    ],
  );
}
