import PostHog from 'posthog-react-native';
import { env } from '../config/env';

let posthog: PostHog | null = null;
let initPromise: Promise<boolean> | null = null;
let lastAnalyticsCanonicalUserId: string | null = null;

const GLOWLYTICS_ACCOUNT_PREFIX = 'glowlytics:user:';

function isGlowlyticsAccountDistinctId(distinctId: unknown): distinctId is string {
  return typeof distinctId === 'string' && distinctId.startsWith(GLOWLYTICS_ACCOUNT_PREFIX);
}
function isLegacyGlowlyticsIdentifiedDistinctId(distinctId: unknown): distinctId is string {
  return distinctId === 'anonymous' || (
    typeof distinctId === 'string' &&
    /^user_[A-Za-z0-9_-]+$/.test(distinctId)
  );
}


export function canonicalGlowlyticsUserId(userId: string): string {
  return `glowlytics:user:${userId}`;
}

export async function initAnalytics(): Promise<boolean> {
  if (posthog) return true;
  if (!env.POSTHOG_API_KEY) return false;
  initPromise ||= Promise.resolve()
    .then(async () => {
      const client = new PostHog(env.POSTHOG_API_KEY, {
        host: env.POSTHOG_HOST,
        enableSessionReplay: false,
      });
      await client.ready();
      posthog = client;
      return true;
    })
    .catch((error) => {
      initPromise = null;
      throw error;
    });
  return initPromise;
}

export function identifyGlowlyticsUser(userId: string): boolean {
  if (!posthog) return false;
  const canonicalUserId = canonicalGlowlyticsUserId(userId);
  posthog.identify(canonicalUserId, { product: 'glowlytics' });
  lastAnalyticsCanonicalUserId = canonicalUserId;
  return true;
}

export async function prepareAnalyticsIdentityHandoff(userId: string | null | undefined): Promise<boolean> {
  const ready = await initAnalytics();
  if (!ready || !posthog) return false;

  const activeUserId = typeof userId === 'string' && userId ? userId : null;
  const activeCanonicalUserId = activeUserId ? canonicalGlowlyticsUserId(activeUserId) : null;
  const distinctId = await Promise.resolve(posthog.getDistinctId());
  const persistedDistinctId = typeof distinctId === 'string' ? distinctId : null;
  const persistedIdentifiedUserId = (
    isGlowlyticsAccountDistinctId(persistedDistinctId) ||
    isLegacyGlowlyticsIdentifiedDistinctId(persistedDistinctId)
  )
    ? persistedDistinctId
    : null;
  const previousIdentifiedUserId = persistedIdentifiedUserId || lastAnalyticsCanonicalUserId;

  if (!activeUserId) {
    if (previousIdentifiedUserId) {
      posthog.reset();
      lastAnalyticsCanonicalUserId = null;
    }
    return true;
  }

  if (previousIdentifiedUserId && previousIdentifiedUserId !== activeCanonicalUserId) {
    posthog.reset();
    lastAnalyticsCanonicalUserId = null;
  }

  return identifyGlowlyticsUser(activeUserId);
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
  lastAnalyticsCanonicalUserId = null;
}
