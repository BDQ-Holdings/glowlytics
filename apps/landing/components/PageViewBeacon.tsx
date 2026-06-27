"use client";

import { useEffect } from "react";

import type { ContentType } from "@/lib/types";

interface Props {
  slug: string;
  type: ContentType;
}

const SESSION_KEY = "glw_last_article";

/**
 * Server-side analytics beacon for article pages.
 *
 * On mount we:
 *   1. Stash the current slug + referrer in sessionStorage so the waitlist
 *      form can attribute a conversion back to whatever the visitor was last
 *      reading.
 *   2. Fire a one-shot `sendBeacon` to /api/track with slug/type/path/ref/utm.
 *      sendBeacon is queued even if the user navigates away in the same tick,
 *      so it doesn't block paint or hold up unload.
 *
 * Failure mode is silent: if the network is offline or the endpoint is wedged
 * we simply lose the pageview event. We never surface anything to the user.
 */
export default function PageViewBeacon({ slug, type }: Props) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const path = window.location.pathname + window.location.search;
    const ref = document.referrer || "";

    // Attribution state for the waitlist form. Stored per-tab so a return
    // visit attributes to the most-recently-read article, not the very first.
    try {
      const value = JSON.stringify({ slug, type, ref, at: Date.now() });
      window.sessionStorage.setItem(SESSION_KEY, value);
    } catch {
      /* sessionStorage blocked (Safari ITP, private mode) — ignore. */
    }

    // Parse UTM parameters once; we only forward the canonical three.
    const params = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    for (const key of ["utm_source", "utm_medium", "utm_campaign"] as const) {
      const value = params.get(key);
      if (value) utm[key] = value.slice(0, 128);
    }

    const body = JSON.stringify({ slug, type, path, ref, utm });
    const url = "/api/track";

    // sendBeacon is the right primitive: it returns synchronously and the
    // browser delivers the payload after the current task, even across
    // navigations. We fall back to fetch with keepalive when it's missing.
    try {
      const blob = new Blob([body], { type: "application/json" });
      const ok =
        typeof navigator !== "undefined" &&
        typeof navigator.sendBeacon === "function" &&
        navigator.sendBeacon(url, blob);
      if (!ok) {
        void fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => undefined);
      }
    } catch {
      /* swallow — analytics MUST NOT throw into the article render path. */
    }
  }, [slug, type]);

  return null;
}

export { SESSION_KEY as PAGEVIEW_SESSION_KEY };
