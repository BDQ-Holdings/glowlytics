"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import posthog from "posthog-js";
import { createFirstTouchSnapshot, storeFirstTouchOnce, readStoredFirstTouch, sanitizePostHogCaptureResult } from "@/lib/posthogAttribution";

export const POSTHOG_INIT_OPTIONS = {
  api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
  capture_pageview: false,
  autocapture: true,
  persistence: "localStorage+cookie" as const,
  save_campaign_params: false,
  mask_personal_data_properties: true,
  before_send: sanitizePostHogCaptureResult,
};

let initialized = false;

export function getCurrentPostHogSessionId(): string | null {
  if (!initialized) return null;
  const id = posthog.get_session_id();
  return typeof id === "string" && id ? id : null;
}

export function getCurrentFirstTouch() {
  return readStoredFirstTouch();
}

export function captureLandingPageview(pathname: string, search: string, referrer: string) {
  const snapshot = storeFirstTouchOnce(createFirstTouchSnapshot({ url: `${pathname}${search}`, referrer }));
  posthog.register({ product: "glowlytics" });
  posthog.capture("$pageview", snapshot);
  return snapshot;
}

export default function PostHogAttribution() {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_API_KEY;
    if (!key) return;
    if (!initialized) {
      posthog.init(key, POSTHOG_INIT_OPTIONS);
      initialized = true;
    }
    const search = searchParams?.toString() ? `?${searchParams.toString()}` : "";
    captureLandingPageview(pathname, search, document.referrer || "");
  }, [pathname, searchParams]);

  return null;
}
