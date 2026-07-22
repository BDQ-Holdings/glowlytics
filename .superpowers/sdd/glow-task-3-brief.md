### Task 3: Expo Clerk Identity Transition Fix

**Files:**
- Modify: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/src/services/analytics.ts`
- Modify: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/app/_layout.tsx`
- Modify: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/src/config/env.ts`
- Modify: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/src/services/__tests__/analytics.test.ts`
- Modify: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/src/config/__tests__/env.test.ts`

**Interfaces:**
- Produces:
  - `canonicalGlowlyticsUserId(userId: string): string`
  - `identifyGlowlyticsUser(userId: string): boolean` always identifies the namespaced Clerk ID with exactly `{ product: "glowlytics" }` once the SDK is ready, returns whether an identify actually happened, and accepts no arbitrary traits.
  - `trackEvent(event: string, properties?: Record<string, string | number | boolean | null>): void` always adds `product="glowlytics"` unless the caller already supplied it.
- Consumes: Clerk `userId` from `useAuth()`.

- [ ] **Step 1: Extend failing analytics tests for canonical IDs and no shared anonymous identify**

Modify `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/src/services/__tests__/analytics.test.ts`:

```ts
const MockPostHog = jest.requireMock('posthog-react-native') as jest.Mock;
const instance = () => MockPostHog.mock.results.at(-1)?.value;

describe('Glowlytics canonical PostHog identity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_POSTHOG_API_KEY = 'phc_test';
    jest.resetModules();
  });

  it('namespaces Clerk IDs for the shared project', () => {
    const { canonicalGlowlyticsUserId } = require('../analytics');
    expect(canonicalGlowlyticsUserId('user_2xABC')).toBe('glowlytics:user:user_2xABC');
  });

  it('identifyGlowlyticsUser identifies the namespaced ID and never identifies literal anonymous', async () => {
    const { initAnalytics, identifyGlowlyticsUser, identifyUser } = require('../analytics');
    await initAnalytics();
    identifyGlowlyticsUser('user_2xABC');
    identifyUser('anonymous');

    expect(instance().identify).toHaveBeenCalledWith('glowlytics:user:user_2xABC', { product: 'glowlytics' });
    expect(instance().identify).not.toHaveBeenCalledWith('anonymous', expect.anything());
  });

  it('does not accept or emit email/name-like identify traits from stale callers', async () => {
    const { initAnalytics, identifyGlowlyticsUser, identifyUser } = require('../analytics');
    await initAnalytics();
    (identifyGlowlyticsUser as unknown as (id: string, traits: unknown) => void)('user_2xABC', { email: 'lead@example.com', name: 'Lead Name' });
    (identifyUser as unknown as (id: string, traits: unknown) => void)('user_2xDEF', { phone: '+15555550100' });
    expect(instance().identify).toHaveBeenCalledWith('glowlytics:user:user_2xABC', { product: 'glowlytics' });
    expect(instance().identify).toHaveBeenCalledWith('glowlytics:user:user_2xDEF', { product: 'glowlytics' });
    expect(JSON.stringify(instance().identify.mock.calls)).not.toMatch(/lead@example\.com|Lead Name|\+15555550100/);
  });

  it('signed-in startup identifies after analytics readiness, not before', async () => {
    const { initAnalytics, identifyGlowlyticsUser } = require('../analytics');
    expect(identifyGlowlyticsUser('user_startup')).toBe(false);
    await expect(initAnalytics()).resolves.toBe(true);
    expect(identifyGlowlyticsUser('user_startup')).toBe(true);
    expect(instance().identify).toHaveBeenCalledWith('glowlytics:user:user_startup', { product: 'glowlytics' });
  });

  it('trackEvent adds product=glowlytics', async () => {
    const { initAnalytics, trackEvent } = require('../analytics');
    await initAnalytics();
    trackEvent('scan_started', { subscription_tier: 'free' });
    expect(instance().capture).toHaveBeenCalledWith('scan_started', {
      product: 'glowlytics',
      subscription_tier: 'free',
    });
  });
});
```

- [ ] **Step 2: Run the analytics tests to verify failure**

Run: `cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics && npm test -- src/services/__tests__/analytics.test.ts --runInBand`

Expected: FAIL because `canonicalGlowlyticsUserId` and `identifyGlowlyticsUser` do not exist, existing identity helpers allow arbitrary traits, and `trackEvent` does not add `product`.

- [ ] **Step 3: Implement canonical ID helpers and product enrichment**

Modify `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/src/services/analytics.ts`:

```ts
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
```

- [ ] **Step 4: Add configurable PostHog host**

Modify `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/src/config/env.ts`:

```ts
interface EnvConfig {
  CLERK_PUBLISHABLE_KEY: string;
  CLERK_INSTANCE_HOST: string;
  CLERK_KEY_ENV: 'live' | 'test' | 'unknown';
  API_BASE_URL: string;
  REVENUECAT_API_KEY: string;
  POSTHOG_API_KEY: string;
  POSTHOG_HOST: string;
  ENABLE_APPLE_OAUTH: boolean;
  ENABLE_GOOGLE_OAUTH: boolean;
  SENTRY_DSN: string;
}

// inside exported env
POSTHOG_API_KEY: process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? '',
POSTHOG_HOST: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
```

Extend `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/src/config/__tests__/env.test.ts` with:

```ts
it('defaults PostHog host to the US ingestion host', () => {
  withDev(true, () => {
    const env = loadEnv('http://localhost:3001');
    expect(env.env.POSTHOG_HOST).toBe('https://us.i.posthog.com');
  });
});
```

- [ ] **Step 5: Fix `_layout.tsx` so identity updates on Clerk transitions and no shared anonymous is identified**

Modify `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/app/_layout.tsx` import:

```ts
import { initAnalytics, identifyGlowlyticsUser, trackEvent, resetAnalytics } from '../src/services/analytics';
```

Replace the one-shot `identifyAnalyticsUser(userId || 'anonymous')` inside deferred initialization with no identify call:

```ts
await initAnalytics();
trackEvent('app_init_complete', {
  has_revenuecat_key: !!env.REVENUECAT_API_KEY,
  has_posthog_key: !!env.POSTHOG_API_KEY,
  has_api_url: !!env.API_BASE_URL,
});
```

Add a separate effect below the deferred init effect:

```ts
const lastAnalyticsUserId = useRef<string | null>(null);

useEffect(() => {
  if (!clerkLoaded) return;
  let cancelled = false;
  if (userId && lastAnalyticsUserId.current !== userId) {
    void initAnalytics().then((ready) => {
      if (cancelled || !ready) return;
      if (identifyGlowlyticsUser(userId)) {
        lastAnalyticsUserId.current = userId;
      }
    });
    return () => {
      cancelled = true;
    };
  }
  if (!userId && lastAnalyticsUserId.current) {
    resetAnalytics();
    lastAnalyticsUserId.current = null;
  }
}, [clerkLoaded, userId]);
```

- [ ] **Step 6: Run focused Expo tests**

Run: `cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics && npm test -- src/services/__tests__/analytics.test.ts src/config/__tests__/env.test.ts --runInBand`

Expected: PASS. Confirm captured events include `product="glowlytics"`, signed-in startup waits for analytics readiness before setting the last identified user ref, and no assertion permits `identify('anonymous')`.

- [ ] **Step 7: Commit**

```bash
cd /Users/mustafaboorenie/cornell-hackathon
 git add apps/glowlytics/src/services/analytics.ts apps/glowlytics/app/_layout.tsx apps/glowlytics/src/config/env.ts apps/glowlytics/src/services/__tests__/analytics.test.ts apps/glowlytics/src/config/__tests__/env.test.ts
 git commit -m "fix(glowlytics): use stable product-namespaced posthog identity"
```

---
