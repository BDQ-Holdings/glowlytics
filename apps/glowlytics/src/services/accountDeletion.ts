import * as api from './api';
import { resetAnalytics, trackEvent } from './analytics';

/**
 * Shared account-deletion routine used by the Account screen and
 * Settings → Delete account (App Store Guideline 5.1.1(v) requires in-app
 * deletion to actually delete). Order matters: the backend delete is the
 * only step that can meaningfully fail, so it runs first and any error
 * propagates to the caller before we touch local state. Clerk sign-out is
 * best-effort — the backend user is already gone, so a sign-out hiccup
 * must not strand the flow. Deletion is immediate and permanent; there is
 * no grace period or pause.
 */
export async function deleteAccountAndSignOut({
  userId,
  clerk,
}: {
  userId: string;
  clerk: { signOut: () => Promise<void> } | null | undefined;
}): Promise<void> {
  trackEvent('account_delete_requested');
  await api.deleteUser(userId);
  await clerk?.signOut().catch(() => {});
  resetAnalytics();
  // Lazy require to avoid a service ↔ store import cycle (same pattern as
  // subscription.ts gateWithPaywall).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useStore } = require('../store/useStore');
  await useStore.getState().resetAll();
}
