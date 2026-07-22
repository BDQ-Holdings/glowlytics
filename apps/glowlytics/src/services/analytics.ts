import PostHog from 'posthog-react-native';
import { env } from '../config/env';

let posthog: PostHog | null = null;
let initPromise: Promise<boolean> | null = null;

export function canonicalGlowlyticsUserId(userId: string): string {
  return `glowlytics:user:${userId}`;
}

export async function initAnalytics(): Promise<boolean> {
  if (posthog) return true;
  if (!env.POSTHOG_API_KEY) return false;
  initPromise ||= Promise.resolve().then(() => {
    posthog = new PostHog(env.POSTHOG_API_KEY, {
      host: env.POSTHOG_HOST,
      enableSessionReplay: false,
    });
    return true;
  });
  return initPromise;
}

export function identifyGlowlyticsUser(userId: string): boolean {
  if (!posthog) return false;
  posthog.identify(canonicalGlowlyticsUserId(userId), { product: 'glowlytics' });
  return true;
}

export function identifyUser(userId: string): void {
  if (userId === 'anonymous') return;
  identifyGlowlyticsUser(userId);
}

export function trackEvent(
  event: string,
  properties?: Record<string, string | number | boolean | null>,
): void {
  if (!posthog) return;
  posthog.capture(event, { product: 'glowlytics', ...(properties || {}) });
}

export function trackScreen(
  name: string,
  properties?: Record<string, string | number | boolean | null>,
): void {
  if (!posthog) return;
  posthog.screen(name, { product: 'glowlytics', ...(properties || {}) });
}

export function resetAnalytics(): void {
  if (!posthog) return;
  posthog.reset();
}
