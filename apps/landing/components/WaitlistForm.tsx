"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import posthog from "posthog-js";

import { PAGEVIEW_SESSION_KEY } from "./PageViewBeacon";
import { getCurrentFirstTouch, getPostHogDistinctId } from "./PostHogAttribution";
type Status = "idle" | "loading" | "success" | "error";

interface Props {
  /** DOM id of the form (used by anchor links + autofocus). */
  id?: string;
  /** Tag stored alongside the email so we know which form converted. */
  source?: string;
  /** Visual variant. `hero` is the rounded pill used on the landing page;
   *  `band` is the slightly smaller pill used inside the newsletter band. */
  variant?: "hero" | "band";
  /** CTA label shown on the submit button in the idle state. */
  cta?: string;
  /** Optional placeholder override. */
  placeholder?: string;
  /** Optional className appended to the form element. */
  className?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type AcquisitionSource =
  | "instagram"
  | "tiktok"
  | "facebook"
  | "google"
  | "other_search"
  | "ai_search"
  | "direct"
  | "referral"
  | "unknown";
type AttributionQuality = "utm" | "referrer" | "unknown" | "backfilled";
type FormPlacement = "hero" | "footer" | "modal" | "pricing" | "mobile_onboarding" | "unknown";

export type WaitlistAttributionPayload = {
  posthog_distinct_id: string | null;
  acquisition_source: AcquisitionSource;
  acquisition_medium: string;
  attribution_model: "first_touch";
  attribution_quality: AttributionQuality;
  historical_backfill: false;
  form_placement: FormPlacement;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  google_click_id_present: boolean;
  referrer_host?: string | null;
  landing_path?: string | null;
};

type WaitlistAttribution = WaitlistAttributionPayload & { product: "glowlytics" };

type WaitlistSubmittedProperties = {
  product: "glowlytics";
  acquisition_source: AcquisitionSource;
  acquisition_medium: string;
  attribution_model: "first_touch";
  attribution_quality: AttributionQuality;
  historical_backfill: false;
  form_placement: FormPlacement;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  google_click_id_present: boolean;
  referrer_host: string | null;
  landing_path: string | null;
};

const FORM_PLACEMENT_ALIASES: Record<string, FormPlacement> = {
  hero: "hero",
  footer: "footer",
  "final-cta": "footer",
  "blog-newsletter": "footer",
  modal: "modal",
  pricing: "pricing",
  mobile_onboarding: "mobile_onboarding",
  "uv-scan-web": "unknown",
  unknown: "unknown",
};

export function normalizeFormPlacement(value: unknown): FormPlacement {
  return typeof value === "string" ? FORM_PLACEMENT_ALIASES[value] || "unknown" : "unknown";
}

export function shouldCaptureWaitlistSubmitted(body: unknown): boolean {
  return Boolean(
    body &&
      typeof body === "object" &&
      (body as { ok?: unknown }).ok === true &&
      (body as { created?: unknown }).created === true &&
      (body as { tracking_enabled?: unknown }).tracking_enabled === true,
  );
}

function buildWaitlistAttribution(formPlacement: string): WaitlistAttribution {
  const firstTouch = getCurrentFirstTouch();
  return {
    product: "glowlytics",
    acquisition_source: firstTouch?.acquisition_source || "unknown",
    acquisition_medium: firstTouch?.acquisition_medium || "unknown",
    attribution_model: "first_touch",
    attribution_quality: firstTouch?.attribution_quality || "unknown",
    historical_backfill: false,
    form_placement: normalizeFormPlacement(formPlacement),
    posthog_distinct_id: getPostHogDistinctId(),
    utm_source: firstTouch?.utm_source ?? null,
    utm_medium: firstTouch?.utm_medium ?? null,
    utm_campaign: firstTouch?.utm_campaign ?? null,
    utm_term: firstTouch?.utm_term ?? null,
    utm_content: firstTouch?.utm_content ?? null,
    google_click_id_present: firstTouch?.google_click_id_present ?? false,
    referrer_host: firstTouch?.referrer_host ?? null,
    landing_path: firstTouch?.landing_path ?? null,
  };
}

export function buildWaitlistSubmittedProperties(
  attribution: WaitlistAttributionPayload & { product?: unknown },
): WaitlistSubmittedProperties {
  return {
    product: "glowlytics",
    acquisition_source: attribution.acquisition_source,
    acquisition_medium: attribution.acquisition_medium,
    attribution_model: "first_touch",
    attribution_quality: attribution.attribution_quality,
    historical_backfill: false,
    form_placement: attribution.form_placement,
    utm_source: attribution.utm_source ?? null,
    utm_medium: attribution.utm_medium ?? null,
    utm_campaign: attribution.utm_campaign ?? null,
    utm_term: attribution.utm_term ?? null,
    utm_content: attribution.utm_content ?? null,
    google_click_id_present: attribution.google_click_id_present ?? false,
    referrer_host: attribution.referrer_host ?? null,
    landing_path: attribution.landing_path ?? null,
  };
}
/**
 * Reads the article-attribution snapshot left by <PageViewBeacon>, if any.
 * Returns an empty object on the server, in private mode, or when the visitor
 * has not viewed an article in this tab — the waitlist API tolerates both
 * cases and only persists the columns when present.
 */
function readAttribution(): {
  attribution_slug?: string;
  attribution_referrer?: string;
} {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(PAGEVIEW_SESSION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { slug?: unknown; ref?: unknown };
    const slug = typeof parsed.slug === "string" ? parsed.slug : undefined;
    const ref = typeof parsed.ref === "string" && parsed.ref ? parsed.ref : undefined;
    if (!slug) return {};
    return ref ? { attribution_slug: slug, attribution_referrer: ref } : { attribution_slug: slug };
  } catch {
    return {};
  }
}


export default function WaitlistForm({
  id,
  source = "landing",
  variant = "hero",
  cta = "Save my spot",
  placeholder = "you@yourplace.com",
  className,
}: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [alreadyOnList, setAlreadyOnList] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // After a transient error, drop the shake class so the next submit can
  // re-trigger the animation.
  useEffect(() => {
    if (status !== "error") return;
    const timer = window.setTimeout(() => setStatus("idle"), 600);
    return () => window.clearTimeout(timer);
  }, [status]);

  const submit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const trimmed = email.trim();
      if (!EMAIL_RE.test(trimmed)) {
        setError("That email doesn’t look right.");
        setStatus("error");
        inputRef.current?.focus();
        return;
      }

      setStatus("loading");
      setError(null);

      try {
        const attribution = buildWaitlistAttribution(source);
        const res = await fetch("/api/waitlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: trimmed,
            source,
            ...readAttribution(),
            ...attribution,
          }),
        });
        const body = (await res.json().catch(() => null)) as {
          ok?: boolean;
          created?: boolean;
          tracking_enabled?: boolean;
          alreadyOnList?: boolean;
          error?: string;
        } | null;

        if (!res.ok || !body?.ok) {
          setError(
            body?.error === "invalid email"
              ? "That email doesn’t look right."
              : "Something’s off on our end. Try again in a moment?",
          );
          setStatus("error");
          return;
        }

        if (shouldCaptureWaitlistSubmitted(body)) {
          posthog.capture("waitlist_submitted", buildWaitlistSubmittedProperties(attribution));
        }

        setAlreadyOnList(body.created === false || Boolean(body.alreadyOnList));
        setStatus("success");
      } catch {
        setError("We couldn’t reach the waitlist. Check your connection and try again?");
        setStatus("error");
      }
    },
    [email, source],
  );

  const sizeClass = variant === "band" ? "wl-form-band" : "wl-form-hero";
  const formClass = ["wl-form", sizeClass, status === "success" ? "is-success" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={`wl-shell ${sizeClass}`}>
      <form id={id} className={formClass} onSubmit={submit} aria-live="polite">
        <input
          ref={inputRef}
          type="email"
          inputMode="email"
          autoComplete="email"
          aria-label="Email"
          placeholder={placeholder}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={status === "loading" || status === "success"}
          className={status === "error" ? "wl-shake" : undefined}
          required
        />
        <button
          type="submit"
          className="wl-btn"
          disabled={status === "loading" || status === "success"}
          aria-busy={status === "loading" || undefined}
        >
          <span className="wl-btn-label">{cta}</span>
          <span className="wl-btn-spinner" aria-hidden="true" />
        </button>
      </form>

      {error ? (
        <p className="wl-error" role="alert">
          {error}
        </p>
      ) : null}

      <div
        className="wl-success"
        role="status"
        aria-hidden={status !== "success"}
        data-active={status === "success" ? "true" : "false"}
      >
        <span className="wl-success-glow" aria-hidden="true" />
        <span className="wl-success-check" aria-hidden="true">
          <svg viewBox="0 0 36 36" width="36" height="36" fill="none">
            <circle
              cx="18"
              cy="18"
              r="16"
              stroke="currentColor"
              strokeOpacity="0.25"
              strokeWidth="1.4"
            />
            <path
              className="wl-check-path"
              d="M11 18.5l4.5 4.5L25 13.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div className="wl-success-text">
          <strong>{alreadyOnList ? "Already on the list." : "You’re on the list."}</strong>
          <span>
            {alreadyOnList
              ? "We had you saved. We’ll write when we have something to share."
              : "We’ll send a quiet note when we’re ready for you."}
          </span>
        </div>
      </div>

      <style>{`
        .wl-shell { position: relative; width: 100%; }
        .wl-shell.wl-form-band { max-width: 440px; margin: 0 auto; }

        .wl-form {
          display: flex;
          align-items: center;
          background: var(--surface);
          border: 1px solid var(--glow);
          border-radius: 999px;
          transition:
            opacity 220ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
            transform 220ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
            filter 220ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
        }
        .wl-form-hero { padding: 6px 6px 6px 22px; }
        .wl-form-band { padding: 5px 5px 5px 22px; }

        .wl-form input {
          flex: 1;
          border: none;
          outline: none;
          background: transparent;
          font-family: inherit;
          font-size: 15px;
          color: var(--ink);
          padding: 13px 8px;
          min-width: 0;
        }
        .wl-form-band input { padding: 12px 8px; }
        .wl-form input::placeholder { color: var(--muted); opacity: 0.7; }
        .wl-form input:disabled { color: var(--muted); cursor: not-allowed; }

        .wl-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 13px 22px;
          border-radius: 999px;
          font-family: inherit;
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 0.01em;
          border: none;
          cursor: pointer;
          background: var(--ink);
          color: var(--surface);
          transition: transform 160ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
        }
        .wl-form-band .wl-btn { padding: 11px 18px; font-size: 13px; }
        .wl-btn:hover:not(:disabled) { transform: translateY(-1px); }
        .wl-btn:disabled { cursor: not-allowed; }
        .wl-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

        .wl-btn-label { transition: opacity 180ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)); }
        .wl-btn[aria-busy="true"] .wl-btn-label { opacity: 0; }

        .wl-btn-spinner {
          position: absolute;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 1.6px solid color-mix(in oklab, var(--surface) 35%, transparent);
          border-top-color: var(--surface);
          opacity: 0;
          animation: none;
        }
        .wl-btn[aria-busy="true"] .wl-btn-spinner {
          opacity: 1;
          animation: wl-spin 720ms linear infinite;
        }
        @keyframes wl-spin {
          to { transform: rotate(360deg); }
        }

        /* Submit-error shake — short, mostly imperceptible jolt. */
        .wl-shake { animation: wl-shake 340ms cubic-bezier(0.36, 0.07, 0.19, 0.97); }
        @keyframes wl-shake {
          10%, 90% { transform: translateX(-1px); }
          20%, 80% { transform: translateX(2px); }
          30%, 50%, 70% { transform: translateX(-3px); }
          40%, 60% { transform: translateX(3px); }
        }

        .wl-error {
          margin: 10px 4px 0;
          font-size: 12.5px;
          color: var(--accent);
          letter-spacing: 0.01em;
        }

        /* Success card — collapses on top of the form when active. */
        .wl-form.is-success {
          opacity: 0;
          transform: scale(0.96);
          filter: blur(4px);
          pointer-events: none;
        }
        .wl-success {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 10px 22px;
          border-radius: 999px;
          background: linear-gradient(160deg, var(--surface), var(--bg));
          border: 1px solid color-mix(in oklab, var(--accent) 35%, var(--glow));
          color: var(--ink);
          opacity: 0;
          transform: translateY(6px) scale(0.98);
          transition:
            opacity 360ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)) 80ms,
            transform 420ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)) 80ms;
          pointer-events: none;
          overflow: hidden;
        }
        .wl-success[data-active="true"] {
          opacity: 1;
          transform: translateY(0) scale(1);
          pointer-events: auto;
        }

        .wl-success-glow {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 18px 50%, color-mix(in oklab, var(--accent) 28%, transparent), transparent 65%);
          opacity: 0;
          transform: scale(0.6);
          transition:
            opacity 480ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)) 80ms,
            transform 760ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)) 80ms;
          pointer-events: none;
        }
        .wl-success[data-active="true"] .wl-success-glow {
          opacity: 0.85;
          transform: scale(1);
        }

        .wl-success-check {
          position: relative;
          flex-shrink: 0;
          width: 36px;
          height: 36px;
          color: var(--accent);
        }
        .wl-check-path {
          stroke-dasharray: 24;
          stroke-dashoffset: 24;
          transition: stroke-dashoffset 480ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)) 220ms;
        }
        .wl-success[data-active="true"] .wl-check-path {
          stroke-dashoffset: 0;
        }

        .wl-success-text {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 2px;
          font-size: 13.5px;
          line-height: 1.35;
          min-width: 0;
        }
        .wl-success-text strong {
          color: var(--ink);
          font-weight: 600;
          font-family: var(--font-display);
          font-style: italic;
          font-size: 16px;
          letter-spacing: -0.005em;
        }
        .wl-success-text span {
          color: var(--muted);
          font-size: 12.5px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* Mobile: break the single-pill layout. On phones the input + button
         * stacking inside one rounded pill reads as "button trapped inside the
         * textbox". Strip the outer chrome and let the input become its own
         * bordered field with the button sitting beneath it as a standalone
         * full-width CTA — same brand language, much more legible at thumb
         * size. */
        @media (max-width: 520px) {
          .wl-form {
            background: transparent;
            border: none;
            border-radius: 0;
            padding: 0;
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
          }
          .wl-form-hero,
          .wl-form-band { padding: 0; }

          .wl-form input {
            flex: 1 1 100%;
            padding: 14px 16px;
            background: var(--surface);
            border: 1px solid var(--glow);
            border-radius: 14px;
            font-size: 16px; /* prevent iOS zoom on focus */
            min-height: 48px;
          }
          .wl-form-band input { padding: 13px 16px; }

          .wl-btn {
            flex: 1 1 100%;
            padding: 14px;
            border-radius: 14px;
            font-size: 15px;
            min-height: 48px;
            width: 100%;
          }
          .wl-form-band .wl-btn { padding: 13px; font-size: 14px; }

          .wl-success {
            border-radius: 18px;
            padding: 14px 16px;
            align-items: flex-start;
          }
          .wl-success-text strong { font-size: 15px; }
          .wl-success-text span { white-space: normal; }
          .wl-error { margin: 4px 2px 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .wl-form, .wl-success, .wl-success-glow, .wl-check-path { transition-duration: 0ms; }
          .wl-btn-spinner { animation-duration: 0ms; }
          .wl-shake { animation: none; }
        }
      `}</style>
    </div>
  );
}
