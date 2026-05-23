"use client";

import { useEffect, useState, type FormEvent } from "react";
import "./landing.css";

/* ─── JSON-LD structured data ─── */
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Glowlytics",
  applicationCategory: "HealthApplication",
  operatingSystem: "iOS",
  description:
    "A glow companion that listens before it speaks. Daily skin readings, weekly patterns, and a quietly audited shelf — built on clinical-grade analysis.",
  url: "https://glowlytics.ai",
  author: { "@type": "Organization", name: "BDQ Holdings LLC" },
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Free 7-day trial",
  },
};

const APP_STORE_URL = "https://apps.apple.com/app/glowlytics/id6760600635";

function Wordmark({ style }: { style?: React.CSSProperties }) {
  return (
    <span className="wordmark" style={style}>
      Glowl<em>y</em>tics
    </span>
  );
}

function ArrowIcon() {
  return (
    <svg
      className="arrow"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12 h14" />
      <path d="M14 6 l6 6 -6 6" />
    </svg>
  );
}

/* Two-state email capture — keeps the visual but acknowledges submission
   without any backend wiring. */
function EmailCapture({ id }: { id?: string }) {
  const [done, setDone] = useState(false);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setDone(true);
  };
  return (
    <form className="hero-form" onSubmit={onSubmit} id={id}>
      <input
        type="email"
        placeholder="you@yourplace.com"
        aria-label="Email"
        required
        disabled={done}
      />
      <button type="submit" className="btn btn-primary">
        {done ? "You’re in ✓" : "Save my spot"}
      </button>
    </form>
  );
}

export default function LandingPage() {
  /* Mount-time setup: scope cream theme to <html>, restore on unmount,
     and wire up smooth-scroll for in-page anchors. */
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("dusk-landing");
    root.dataset.palette = "dusk";

    const anchors = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(
        '.dusk-page a[href^="#"]'
      )
    );
    const onClick = (e: Event) => {
      const a = e.currentTarget as HTMLAnchorElement;
      const href = a.getAttribute("href");
      if (!href || href === "#") return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        window.scrollTo({
          top:
            (target as HTMLElement).getBoundingClientRect().top +
            window.scrollY -
            60,
          behavior: "smooth",
        });
      }
    };
    anchors.forEach((a) => a.addEventListener("click", onClick));

    return () => {
      root.classList.remove("dusk-landing");
      delete root.dataset.palette;
      anchors.forEach((a) => a.removeEventListener("click", onClick));
    };
  }, []);

  return (
    <div className="dusk-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ─── Nav ─── */}
      <nav className="top">
        <div className="inner">
          <Wordmark />
          <div className="links">
            <a href="#how">How it works</a>
            <a href="#facets">What it watches</a>
            <a href="#patterns">Patterns</a>
            <a href="#privacy">Privacy</a>
            <a href="#faq">FAQ</a>
          </div>
          <a href={APP_STORE_URL} className="btn btn-primary btn-sm">
            Get Glowlytics
            <ArrowIcon />
          </a>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="hero">
        <div className="hero-grid">
          <div>
            <div className="eyebrow">— a glow companion · iOS, now in TestFlight</div>
            <h1 className="hero-h">
              Your skin keeps a journal.
              <br />
              <em>We read it back to you.</em>
            </h1>
            <div className="hero-sub">
              An eight-second daily check-in. A quiet weekly read of what&rsquo;s
              actually working &mdash; including the things already on your shelf.
              No grades. No streak guilt. No noise.
            </div>

            <EmailCapture id="hero-email" />

            <div className="hero-meta">
              <div className="avatar-stack">
                <span
                  className="av"
                  style={{ background: "linear-gradient(135deg, #D9A28B, #E8C9B8)" }}
                />
                <span
                  className="av"
                  style={{ background: "linear-gradient(135deg, #5A3A5E, #D9A28B)" }}
                />
                <span
                  className="av"
                  style={{ background: "linear-gradient(135deg, #C9B786, #CFE0C8)" }}
                />
                <span
                  className="av"
                  style={{ background: "linear-gradient(135deg, #A14A55, #E0B8A6)" }}
                />
              </div>
              <span>
                12,408 quiet observers, waiting with us.{" "}
                <em className="ink">Available on iPhone.</em>
              </span>
            </div>
          </div>

          <div className="phone-stage">
            <div className="callout callout-1">
              <div className="ct">
                Pattern · <em>Strong</em>
              </div>
              <div className="callout-tagline">
                Your skin loves slow mornings.
              </div>
            </div>
            <div className="callout callout-2">
              <div className="ct callout-streak">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--accent2)"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 3 c0 4 -5 5 -5 10 a5 5 0 0 0 10 0 c0-3 -3-4 -3-7 -1 1 -2 1 -2-3 z" />
                </svg>
                <span>12 day streak</span>
              </div>
              <div className="callout-tagline">No rush. The streak waits.</div>
            </div>

            <div className="phone">
              <div className="notch" />
              <div className="phone-inner">
                <div className="phone-status">
                  <span>9:41</span>
                  <span>● ● ●</span>
                </div>
                <div className="phone-h">
                  Good morning,
                  <br />
                  <em>Maya</em>
                </div>

                <div className="glow-card">
                  <div className="glow-card-top">
                    <div>
                      <div className="glow-label">Today&rsquo;s glow</div>
                      <div className="glow-score">78</div>
                      <div className="glow-delta">+6 vs. start</div>
                    </div>
                    <svg
                      className="glow-ring"
                      width="64"
                      height="64"
                      viewBox="0 0 64 64"
                      aria-hidden="true"
                    >
                      <circle
                        cx="32"
                        cy="32"
                        r="28"
                        stroke="var(--glow)"
                        strokeWidth="5"
                        fill="none"
                      />
                      <circle
                        cx="32"
                        cy="32"
                        r="28"
                        stroke="var(--accent)"
                        strokeWidth="5"
                        fill="none"
                        strokeDasharray="137 200"
                        strokeLinecap="round"
                        transform="rotate(-90 32 32)"
                      />
                    </svg>
                  </div>
                  <div className="phone-cta">Take today&rsquo;s check-in →</div>
                </div>

                <div className="phone-facets">
                  <div className="phone-facet">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 3 c-4 5 -6 8 -6 11 a6 6 0 0 0 12 0 c0-3 -2-6 -6-11 z" />
                    </svg>
                    <div className="val">82</div>
                    <div className="nm">Hydrated</div>
                    <div className="bar">
                      <i style={{ width: "82%" }} />
                    </div>
                  </div>
                  <div className="phone-facet">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 19 c0-9 7-14 14-14 0 8 -5 14 -14 14 z" />
                      <path d="M5 19 c3-3 6-5 10-7" />
                    </svg>
                    <div className="val">71</div>
                    <div className="nm">Calm</div>
                    <div className="bar">
                      <i style={{ width: "71%" }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Quiet pull ─── */}
      <section className="band quietband">
        <div className="container">
          <div className="eyebrow">— 01 · the difference</div>
          <p className="pull">
            Skin apps shout. We listen.
            <br />
            <span className="alt">
              No grades, no panic, no &ldquo;optimization.&rdquo; Glowlytics
              watches your face the way a friend who pays attention would —
              quietly, over weeks, and only speaks when there&rsquo;s something
              honestly worth saying.
            </span>
          </p>
        </div>
      </section>

      {/* ─── How it works ─── */}
      <section className="band" id="how">
        <div className="container">
          <div className="section-head">
            <div>
              <div className="section-num">— 02</div>
              <h2>
                How it works,
                <br />
                in four small acts.
              </h2>
            </div>
            <div className="lede">
              Eight seconds in the morning. A weekly story you can actually act
              on. The rest is up to your skin — which, by the way, moves on
              weeks, not hours.
            </div>
          </div>

          <div className="steps">
            <div className="step">
              <div className="num">i.</div>
              <h3>Soft light, chin level.</h3>
              <p>
                Find a window. Three breaths, one tap. The shutter measures
                fourteen reference points across your face — hydration, redness,
                tone variance, micro-texture — and is done before you&rsquo;ve
                blinked twice.
              </p>
              <div className="visual">
                <svg width="120" height="100" viewBox="0 0 120 100" fill="none" aria-hidden="true">
                  <ellipse
                    cx="60"
                    cy="50"
                    rx="36"
                    ry="46"
                    stroke="var(--accent)"
                    strokeWidth="1.4"
                    strokeDasharray="3 5"
                  />
                  <path d="M14 14 v-8 h8" stroke="var(--ink)" strokeWidth="1.4" strokeLinecap="round" />
                  <path d="M106 14 v-8 h-8" stroke="var(--ink)" strokeWidth="1.4" strokeLinecap="round" />
                  <path d="M14 86 v8 h8" stroke="var(--ink)" strokeWidth="1.4" strokeLinecap="round" />
                  <path d="M106 86 v8 h-8" stroke="var(--ink)" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </div>
            </div>

            <div className="step">
              <div className="num">ii.</div>
              <h3>A daily read, not a grade.</h3>
              <p>
                Your Glow score is one number — but the real story is underneath.
                Four facets, what moved, and the most likely{" "}
                <em className="it">why</em>. We never call you a 73%. We tell
                you you slept well.
              </p>
              <div className="visual">
                <div className="step-score">
                  <div className="n">78</div>
                  <div className="d">+5 today</div>
                </div>
              </div>
            </div>

            <div className="step">
              <div className="num">iii.</div>
              <h3>Patterns surface, week three.</h3>
              <p>
                Around day 18, the journal starts talking. &ldquo;Tuesdays run
                hot.&rdquo; &ldquo;Your retinoid is paying off.&rdquo; &ldquo;The
                new pillowcase is doing something.&rdquo; We connect sleep,
                weather, products, and skin — only with strong enough evidence
                to bother.
              </p>
              <div className="visual">
                <svg width="180" height="60" viewBox="0 0 180 60" aria-hidden="true">
                  <defs>
                    <linearGradient id="hwGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0,42 L25,38 L50,44 L75,32 L100,28 L125,22 L150,18 L180,12 L180,60 L0,60 Z"
                    fill="url(#hwGrad)"
                  />
                  <path
                    d="M0,42 L25,38 L50,44 L75,32 L100,28 L125,22 L150,18 L180,12"
                    stroke="var(--accent)"
                    strokeWidth="1.8"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx="180" cy="12" r="3.5" fill="var(--accent)" />
                </svg>
              </div>
            </div>

            <div className="step">
              <div className="num">iv.</div>
              <h3>A ritual that earns its place.</h3>
              <p>
                Pause what isn&rsquo;t working. Keep what is. Every product you
                own gets a quiet verdict — backed by the actual readings, not a
                sponsor&rsquo;s brief. You&rsquo;ll buy less, not more.
              </p>
              <div className="visual">
                <div className="step-bottles">
                  <span style={{ height: 38, background: "linear-gradient(160deg, #E8DCC8, var(--surface))" }} />
                  <span style={{ height: 44, background: "linear-gradient(160deg, #CFE0C8, var(--surface))" }} />
                  <span style={{ height: 36, background: "linear-gradient(160deg, #F2D9A8, var(--surface))" }} />
                  <span style={{ height: 42, background: "linear-gradient(160deg, #D9C8E0, var(--surface))" }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Facets ─── */}
      <section
        className="band"
        id="facets"
        style={{
          background: "var(--surface)",
          borderTop: "1px solid var(--hairline)",
          borderBottom: "1px solid var(--hairline)",
        }}
      >
        <div className="container">
          <div className="section-head">
            <div>
              <div className="section-num">— 03</div>
              <h2>
                What we watch.
                <br />
                Just four things.
              </h2>
            </div>
            <div className="lede">
              Skin is impossibly complex. We don&rsquo;t pretend otherwise. But
              four well-measured facets, repeated daily, will tell you almost
              everything you need to know about what&rsquo;s helping and what
              isn&rsquo;t.
            </div>
          </div>

          <div className="facets">
            <div className="facet">
              <div className="ix">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 3 c-4 5 -6 8 -6 11 a6 6 0 0 0 12 0 c0-3 -2-6 -6-11 z" />
                </svg>
              </div>
              <h4>Hydrated</h4>
              <div className="reading">Surface plumpness · 0–100</div>
              <p>
                How dewy and full your skin sits today. Most sensitive to sleep,
                water, and the moisture step you may have skipped last night.
              </p>
              <div className="what">
                Measured across forehead, cheek, jawline · 14 ref. points
              </div>
            </div>

            <div className="facet">
              <div className="ix">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 19 c0-9 7-14 14-14 0 8 -5 14 -14 14 z" />
                  <path d="M5 19 c3-3 6-5 10-7" />
                </svg>
              </div>
              <h4>Calm</h4>
              <div className="reading">Redness map · week-over-week</div>
              <p>
                Distribution and intensity of warm tones. We&rsquo;re not
                chasing zero — we&rsquo;re chasing your baseline, and noticing
                when something pushed you off it.
              </p>
              <div className="what">
                Heat-mapped by zone · trigger correlation built in
              </div>
            </div>

            <div className="facet">
              <div className="ix">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2 v3 M12 19 v3 M2 12 h3 M19 12 h3 M5 5 l2 2 M17 17 l2 2 M5 19 l2-2 M17 7 l2-2" />
                </svg>
              </div>
              <h4>Even</h4>
              <div className="reading">Tone variance + post-mark fade</div>
              <p>
                How uniform your tone is, and how quickly old marks are leaving.
                The slowest of the four to move — and the most rewarding when it
                does.
              </p>
              <div className="what">L*a*b* delta · 28-day rolling fade index</div>
            </div>

            <div className="facet">
              <div className="ix">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 4 v6 M12 14 v6 M4 12 h6 M14 12 h6 M7 7 l3 3 M14 14 l3 3 M7 17 l3-3 M14 10 l3-3" />
                </svg>
              </div>
              <h4>Firm</h4>
              <div className="reading">Micro-bounce · cheek + jaw</div>
              <p>
                How quickly your skin returns from a smile. A long-arc signal —
                meaningful over months, not days. We mark it but never alarm
                you.
              </p>
              <div className="what">
                Time-resolved elastography from a single capture
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Sample read ─── */}
      <section className="band" id="sample">
        <div className="container">
          <div className="section-head">
            <div>
              <div className="section-num">— 04</div>
              <h2>
                A real morning.
                <br />
                A real read.
              </h2>
            </div>
            <div className="lede">
              What a Wednesday in May looks like. The score on the left, the
              story on the right. The number is the smallest part — what moved
              and why is the point.
            </div>
          </div>

          <div className="sample-grid">
            <div className="sample-read">
              <div className="sample-inner">
                <div className="eyebrow">— Today&rsquo;s read · Wed, May 6</div>
                <div className="sample-big">78</div>
                <div className="sample-delta">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ transform: "rotate(-45deg)" }}
                    aria-hidden="true"
                  >
                    <path d="M5 12 h14" />
                    <path d="M14 6 l6 6 -6 6" />
                  </svg>
                  +5 since yesterday
                </div>
                <div className="sample-quote">
                  You look <em>well-rested</em>.
                </div>
                <div className="sample-sub">
                  Hydration is the standout. Tone took a small dip — nothing to
                  chase. We&rsquo;ll watch it again tomorrow.
                </div>
              </div>
            </div>

            <div className="changes">
              <div className="change-row">
                <div className="icbox">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 3 c-4 5 -6 8 -6 11 a6 6 0 0 0 12 0 c0-3 -2-6 -6-11 z" />
                  </svg>
                </div>
                <div>
                  <div className="nm">Hydrated</div>
                  <div className="why">Niacinamide + 7h sleep</div>
                </div>
                <div className="dlt up">+4 · 78→82</div>
              </div>
              <div className="change-row">
                <div className="icbox">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 19 c0-9 7-14 14-14 0 8 -5 14 -14 14 z" />
                  </svg>
                </div>
                <div>
                  <div className="nm">Calm</div>
                  <div className="why">No new redness around jaw</div>
                </div>
                <div className="dlt up">+2 · 69→71</div>
              </div>
              <div className="change-row">
                <div className="icbox">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2 v3 M12 19 v3 M2 12 h3 M19 12 h3" />
                  </svg>
                </div>
                <div>
                  <div className="nm">Even</div>
                  <div className="why">
                    Slight dullness — try a slow exfoliant tonight
                  </div>
                </div>
                <div className="dlt down">−1 · 65→64</div>
              </div>
              <div className="change-row">
                <div className="icbox">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 4 v6 M12 14 v6 M4 12 h6 M14 12 h6" />
                  </svg>
                </div>
                <div>
                  <div className="nm">Firm</div>
                  <div className="why">Steady. We&rsquo;ll mark it again Sunday.</div>
                </div>
                <div className="dlt up">+0 · 75→75</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Patterns ─── */}
      <section
        className="band"
        id="patterns"
        style={{
          background: "var(--surface)",
          borderTop: "1px solid var(--hairline)",
          borderBottom: "1px solid var(--hairline)",
        }}
      >
        <div className="container">
          <div className="section-head">
            <div>
              <div className="section-num">— 05</div>
              <h2>
                The patterns
                <br />
                that earn the headline.
              </h2>
            </div>
            <div className="lede">
              We don&rsquo;t ship every wiggle in the data. A pattern only
              surfaces once it&rsquo;s repeated enough times to mean something —
              and we&rsquo;ll tell you exactly how sure we are.
            </div>
          </div>

          <div className="patterns">
            <div className="pattern">
              <div className="row">
                <div className="tag">Sleep · Hydration</div>
                <div className="conf">● Strong</div>
              </div>
              <h3>Your skin loves slow mornings.</h3>
              <p>
                On days you sleep 7+ hours, your hydration jumps fourteen points
                by evening. Stay the course — no changes needed.
              </p>
              <div className="chart">
                <svg width="100%" height="56" viewBox="0 0 220 56" aria-hidden="true">
                  <defs>
                    <linearGradient id="p1g" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0,38 L31,36 L62,40 L93,28 L124,22 L155,20 L186,14 L220,8 L220,56 L0,56 Z"
                    fill="url(#p1g)"
                  />
                  <path
                    d="M0,38 L31,36 L62,40 L93,28 L124,22 L155,20 L186,14 L220,8"
                    stroke="var(--accent)"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx="220" cy="8" r="3.5" fill="var(--accent)" />
                </svg>
              </div>
            </div>

            <div className="pattern">
              <div className="row">
                <div className="tag">Workout · Calm</div>
                <div className="conf">○ Likely</div>
              </div>
              <h3>Tuesdays run hot.</h3>
              <p>
                Redness ticks up four points after Tuesday gym sessions. A cool
                rinse before serum on those days, and you&rsquo;re back at
                baseline by Wednesday.
              </p>
              <div className="chart">
                <svg width="100%" height="56" viewBox="0 0 220 56" aria-hidden="true">
                  <g stroke="var(--hairline)" strokeWidth="1">
                    <line x1="0" y1="28" x2="220" y2="28" />
                  </g>
                  <g fill="var(--accent)">
                    <rect x="14" y="22" width="10" height="6" rx="2" />
                    <rect x="44" y="14" width="10" height="14" rx="2" />
                    <rect x="74" y="20" width="10" height="8" rx="2" />
                    <rect x="104" y="6" width="10" height="22" rx="2" opacity="0.95" />
                    <rect x="134" y="18" width="10" height="10" rx="2" />
                    <rect x="164" y="10" width="10" height="18" rx="2" opacity="0.9" />
                    <rect x="194" y="22" width="10" height="6" rx="2" />
                  </g>
                  <g fill="var(--muted)" fontSize="8" fontFamily="ui-monospace">
                    <text x="19" y="44" textAnchor="middle">M</text>
                    <text x="49" y="44" textAnchor="middle">T</text>
                    <text x="79" y="44" textAnchor="middle">W</text>
                    <text x="109" y="44" textAnchor="middle" fill="var(--accent)">T</text>
                    <text x="139" y="44" textAnchor="middle">F</text>
                    <text x="169" y="44" textAnchor="middle">S</text>
                    <text x="199" y="44" textAnchor="middle">S</text>
                  </g>
                </svg>
              </div>
            </div>

            <div className="pattern">
              <div className="row">
                <div className="tag">Routine · Even</div>
                <div className="conf">● Strong</div>
              </div>
              <h3>The retinoid is paying off.</h3>
              <p>
                Three weeks in, evenness is up eleven points. Mild peel around
                day four was expected. Stay the course — no changes needed.
              </p>
              <div className="chart">
                <svg width="100%" height="56" viewBox="0 0 220 56" aria-hidden="true">
                  <defs>
                    <linearGradient id="p3g" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0,30 L20,32 L40,34 L60,42 L80,40 L100,34 L120,26 L140,20 L160,16 L180,14 L220,10 L220,56 L0,56 Z"
                    fill="url(#p3g)"
                  />
                  <path
                    d="M0,30 L20,32 L40,34 L60,42 L80,40 L100,34 L120,26 L140,20 L160,16 L180,14 L220,10"
                    stroke="var(--accent)"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx="60" cy="42" r="3" fill="var(--accent2)" />
                  <text x="60" y="54" textAnchor="middle" fontSize="8" fontFamily="ui-monospace" fill="var(--muted)">
                    peel
                  </text>
                  <circle cx="220" cy="10" r="3.5" fill="var(--accent)" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Shelf ─── */}
      <section className="band" id="shelf">
        <div className="container">
          <div className="section-head">
            <div>
              <div className="section-num">— 06</div>
              <h2>
                Your shelf,
                <br />
                quietly audited.
              </h2>
            </div>
            <div className="lede">
              Every product gets a verdict, backed by the actual readings. Five
              things working, two on the fence, and the courage to pause the
              rest. We don&rsquo;t take affiliate money — ever.
            </div>
          </div>

          <div className="shelf-grid">
            {[
              { brand: "Soft House", name: "Hydrating Serum", verdict: "Working", meta: "· +14 on hydration · 4 wks", bottle: "#CFE0C8" },
              { brand: "Quietcare", name: "Retinoid 0.3%", verdict: "Working", meta: "· +11 on evenness · 3 wks", bottle: "#D9C8E0" },
              { brand: "Sundwell", name: "SPF 50 Veil", verdict: "Working", meta: "· +6 on tone · 8 wks", bottle: "#F2D9A8" },
              { brand: "Atelier", name: "Gentle Milk Cleanser", verdict: "Working", meta: "· +8 on calm · 6 wks", bottle: "#E8DCC8" },
              { brand: "Kinde", name: "Slip Pillowcase", verdict: "Hard to say yet", meta: "· 2 wks · keep going", bottle: "#E8C9B8", maybe: true },
              { brand: "Hour & Day", name: "Vitamin C 15%", verdict: "Pause suggested", meta: "· no signal · 6 wks", bottle: "#C7B8A0", maybe: true },
            ].map((card) => (
              <div
                key={`${card.brand}-${card.name}`}
                className={`shelf-card${card.maybe ? " maybe" : ""}`}
              >
                <div
                  className="bottle"
                  style={{ background: `linear-gradient(160deg, ${card.bottle}, var(--surface))` }}
                />
                <div>
                  <div className="brand">{card.brand}</div>
                  <div className="nm">{card.name}</div>
                  <div className="verdict">
                    <span className="dot" />
                    <span className="v">{card.verdict}</span>
                    <span className="meta">{card.meta}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Voice ─── */}
      <section className="band quietband" id="voice">
        <div className="container">
          <div className="section-head">
            <div>
              <div className="section-num">— 07</div>
              <h2>
                How we talk
                <br />
                to you.
              </h2>
            </div>
            <div className="lede">
              A line we write twenty times before shipping. Calm over loud.
              Specific over generic. Steady over urgent. Italics where
              we&rsquo;d lean in if we were sitting across from you.
            </div>
          </div>

          <div className="voice-grid">
            <div className="voice-col we">
              <h3>We say —</h3>
              <div className="voice-line">
                You look <em>well-rested</em>.
              </div>
              <div className="voice-line">
                Tone took a small dip — nothing to chase.
              </div>
              <div className="voice-line">No rush. The streak waits.</div>
              <div className="voice-line">
                Three weeks in, evenness is up <em>eleven points</em>.
              </div>
            </div>
            <div className="voice-col not">
              <h3>We don&rsquo;t —</h3>
              <div className="voice-line">
                <span className="strike">Sleep score: 87 (great!) 💤✨</span>
              </div>
              <div className="voice-line">
                <span className="strike">
                  ⚠️ Tone score declined. Action recommended.
                </span>
              </div>
              <div className="voice-line">
                <span className="strike">Don&rsquo;t break your 12-day streak!</span>
              </div>
              <div className="voice-line">
                <span className="strike">Your skincare is 73% optimized.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Privacy ─── */}
      <section className="privacy-section" id="privacy">
        <div className="privacyband">
          <div className="privacyband-grid">
            <div>
              <div className="eyebrow">— 08 · your face, your phone</div>
              <h2>
                Stays <em>on the device</em>.
                <br />
                Never sold. Never trained on.
              </h2>
              <p>
                Reading a face is intimate work. We treat it like a journal
                you&rsquo;ve left out on the table — closed.
              </p>
            </div>

            <div className="privacy-list">
              <div className="priv-row">
                <svg
                  className="ic"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="5" y="11" width="14" height="9" rx="2" />
                  <path d="M8 11 V7 a4 4 0 0 1 8 0 v4" />
                </svg>
                <div>
                  <div className="tt">On-device analysis</div>
                  <div className="ds">
                    Every reading runs in the Neural Engine on your phone.
                    Photos never leave it — not for analysis, not for backups,
                    not ever.
                  </div>
                </div>
              </div>
              <div className="priv-row">
                <svg
                  className="ic"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M5 5 l14 14" />
                </svg>
                <div>
                  <div className="tt">No ad networks. No SDKs.</div>
                  <div className="ds">
                    Zero third-party analytics, no advertising IDs collected, no
                    embedded trackers. Our payroll is paid by subscriptions, not
                    your data.
                  </div>
                </div>
              </div>
              <div className="priv-row">
                <svg
                  className="ic"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 3 v18" />
                  <path d="M5 10 l7-7 7 7" />
                </svg>
                <div>
                  <div className="tt">Export &amp; delete, one tap each</div>
                  <div className="ds">
                    You own your timeline. Export the whole thing as a PDF or
                    JSON whenever you want. Delete it permanently in less than
                    two seconds.
                  </div>
                </div>
              </div>
              <div className="priv-row">
                <svg
                  className="ic"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 12 a8 8 0 1 1 16 0 a8 8 0 0 1 -16 0 z" />
                  <path d="M9 12 l2 2 l4-4" />
                </svg>
                <div>
                  <div className="tt">Independent audit</div>
                  <div className="ds">
                    Cure53 reviews our privacy claims twice a year. The latest
                    report sits on our footer, public, dated, and unredacted.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Testimonials ─── */}
      <section className="band" id="said">
        <div className="container">
          <div className="section-head">
            <div>
              <div className="section-num">— 09</div>
              <h2>
                What early
                <br />
                readers said.
              </h2>
            </div>
            <div className="lede">
              Four months of TestFlight, two thousand quiet observers. We asked:
              what&rsquo;s different about it? Three answers we kept hearing.
            </div>
          </div>

          <div className="quotes">
            <div className="quote">
              <blockquote>
                I bought <em>nothing</em> new for two months. It told me my
                serum was the hero — I just needed to keep using it.
              </blockquote>
              <div className="cite">
                <div
                  className="av"
                  style={{ background: "linear-gradient(135deg, #D9A28B, #E8C9B8)" }}
                />
                <div className="who">
                  Priya, 34<span className="ctx">Combination · Brooklyn</span>
                </div>
              </div>
            </div>
            <div className="quote">
              <blockquote>
                The first app I&rsquo;ve used that <em>didn&rsquo;t</em> make me
                feel behind on my own face.
              </blockquote>
              <div className="cite">
                <div
                  className="av"
                  style={{ background: "linear-gradient(135deg, #5A3A5E, #D9A28B)" }}
                />
                <div className="who">
                  Adaeze, 41<span className="ctx">Eczema-prone · London</span>
                </div>
              </div>
            </div>
            <div className="quote">
              <blockquote>
                I finally know why Tuesdays look the way they do. Turns out, the
                gym. Who knew.
              </blockquote>
              <div className="cite">
                <div
                  className="av"
                  style={{ background: "linear-gradient(135deg, #C9B786, #CFE0C8)" }}
                />
                <div className="who">
                  Sam, 28<span className="ctx">Sensitive · Berlin</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="band quietband" id="faq">
        <div className="container">
          <div className="section-head">
            <div>
              <div className="section-num">— 10</div>
              <h2>
                Honest answers
                <br />
                to honest questions.
              </h2>
            </div>
            <div className="lede">
              The things people ask us at dinner parties. If yours isn&rsquo;t
              here, we&rsquo;ll happily answer it — write us, the address is in
              the footer.
            </div>
          </div>

          <div className="faq-list">
            <details className="faq-item" open>
              <summary className="faq-q">
                Does it work on every skin tone?<span className="plus">+</span>
              </summary>
              <div className="faq-a">
                Yes. Our reference set spans Fitzpatrick I through VI, balanced
                across age and condition. Hydration and calm are tone-invariant;
                tone variance and post-mark fade are calibrated against your own
                baseline rather than a universal target, so the app never holds
                you to someone else&rsquo;s skin.
              </div>
            </details>
            <details className="faq-item">
              <summary className="faq-q">
                How long until I see patterns?<span className="plus">+</span>
              </summary>
              <div className="faq-a">
                Three to four weeks for the first strong pattern. We could
                surface them sooner — most apps do — but they wouldn&rsquo;t be
                true. Skin moves on weeks, and we&rsquo;d rather be slow and
                right than fast and noisy.
              </div>
            </details>
            <details className="faq-item">
              <summary className="faq-q">
                What if I miss a day, or a week?<span className="plus">+</span>
              </summary>
              <div className="faq-a">
                Nothing happens. We don&rsquo;t punish gaps, scold them, or
                design the streak to make you feel terrible. The patterns just
                take a little longer to surface, and we&rsquo;ll let you know
                when they&rsquo;re back.
              </div>
            </details>
            <details className="faq-item">
              <summary className="faq-q">
                Is it free?<span className="plus">+</span>
              </summary>
              <div className="faq-a">
                Free to start, forever. The core daily read, weekly patterns,
                and full shelf verdicts are included. Glow+ ($6/mo or $48/yr)
                unlocks deep history (beyond 90 days), full timeline exports,
                and side-by-side compare. We don&rsquo;t take a cent from
                brands.
              </div>
            </details>
            <details className="faq-item">
              <summary className="faq-q">
                iOS only?<span className="plus">+</span>
              </summary>
              <div className="faq-a">
                iOS 16+ at launch — the readings rely on the TrueDepth
                front-facing camera and on-device Neural Engine. A read-only web
                mirror for your timeline is in private beta. Android is on the
                roadmap once on-device depth is more uniform.
              </div>
            </details>
            <details className="faq-item">
              <summary className="faq-q">
                What about lighting? Doesn&rsquo;t it ruin the readings?
                <span className="plus">+</span>
              </summary>
              <div className="faq-a">
                We normalize against soft natural light from the side — the
                kind a window gives you. The app gently coaches you toward the
                right setup the first few times, and quietly tags any reading
                taken in low or harsh light as lower-confidence in your
                timeline.
              </div>
            </details>
          </div>
        </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section className="band" id="join">
        <div className="final">
          <div className="final-inner">
            <Wordmark />
            <h2>
              Skin moves on weeks.
              <br />
              Start a quiet one.
            </h2>
            <p>
              Download Glowlytics on iPhone — your first quiet read is waiting.
              One short letter a month from us, never more.
            </p>
            <EmailCapture id="final-email" />
            <div
              style={{
                marginTop: 18,
                display: "flex",
                gap: 12,
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <a href={APP_STORE_URL} className="btn btn-glow">
                Get it on the App Store
                <ArrowIcon />
              </a>
            </div>
            <div className="final-meta">
              12,408 quiet observers · iOS 16+ · 7-day free trial
            </div>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="foot">
        <div className="inner">
          <div className="col">
            <Wordmark style={{ fontSize: 30 }} />
            <p>
              A glow companion that listens before it speaks. Built between
              Manhattan and Austin.
            </p>
          </div>
          <div className="col">
            <h5>The app</h5>
            <a href="#how">How it works</a>
            <a href="#facets">What we watch</a>
            <a href="#patterns">Patterns</a>
            <a href="#shelf">Shelf verdicts</a>
          </div>
          <div className="col">
            <h5>Quiet print</h5>
            <a href="#privacy">Privacy</a>
            <a href="/privacy">Privacy policy</a>
            <a href="/terms">Terms</a>
            <a href="/guides">Method &amp; references</a>
          </div>
          <div className="col">
            <h5>Hello</h5>
            <a href="mailto:hello@glowlytics.ai">hello@glowlytics.ai</a>
            <a href="/blog">Letter, monthly</a>
            <a href="/faq">FAQ</a>
          </div>
        </div>
        <div className="legal">
          <span>© 2026 Glowlytics · BDQ Holdings LLC</span>
          <span>Made to be edited.</span>
        </div>
      </footer>
    </div>
  );
}
