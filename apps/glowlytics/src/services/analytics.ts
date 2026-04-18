import PostHog from 'posthog-react-native';
import { env } from '../config/env';

let posthog: PostHog | null = null;

export async function initAnalytics(): Promise<void> {
  if (!env.POSTHOG_API_KEY) return;
  posthog = new PostHog(env.POSTHOG_API_KEY, {
    host: 'https://us.i.posthog.com',
    enableSessionReplay: false,
  });
}

export function identifyUser(
  userId: string,
  traits?: Record<string, string | number | boolean | null>,
): void {
  if (!posthog) return;
  posthog.identify(userId, traits);
}

export function trackEvent(
  event: string,
  properties?: Record<string, string | number | boolean | null>,
): void {
  if (!posthog) return;
  posthog.capture(event, properties);
}

export function trackScreen(
  name: string,
  properties?: Record<string, string | number | boolean | null>,
): void {
  if (!posthog) return;
  posthog.screen(name, properties);
}

export function resetAnalytics(): void {
  if (!posthog) return;
  posthog.reset();
}
