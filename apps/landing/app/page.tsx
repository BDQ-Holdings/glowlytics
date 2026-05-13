"use client";

import { useEffect, useRef, useCallback } from "react";
import "./landing.css";

/* ── JSON-LD structured data ── */
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Glowlytics",
  applicationCategory: "HealthApplication",
  operatingSystem: "iOS",
  description:
    "AI-powered skin health tracking built by doctors. Track 5 skin signals daily with clinical-grade analysis.",
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

export default function LandingPage() {
  const heroRef = useRef<HTMLElement>(null);
  const ctaRef = useRef<HTMLElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const backTopRef = useRef<HTMLButtonElement>(null);
  const meshRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  /* ── All scroll / intersection effects ── */
  useEffect(() => {
    /* Reveal init */
    document.documentElement.classList.add("reveal-init");

    /* Scroll reveal */
    const revealEls = document.querySelectorAll(".reveal");
    if (revealEls.length && "IntersectionObserver" in window) {
      const revealObs = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("visible");
              revealObs.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
      );
      revealEls.forEach((el) => revealObs.observe(el));
    } else {
      revealEls.forEach((el) => el.classList.add("visible"));
    }

    /* Number counter animation */
    const counters = document.querySelectorAll<HTMLElement>(".num[data-count]");
    if (counters.length) {
      const counterObs = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const el = entry.target as HTMLElement;
            const end = el.getAttribute("data-count");
            const suffix = el.getAttribute("data-suffix") || "";
            const prefix = el.getAttribute("data-prefix") || "";
            const endNum = parseFloat(end || "0");
            if (isNaN(endNum)) {
              el.textContent = prefix + end + suffix;
              counterObs.unobserve(el);
              return;
            }
            const duration = 1200;
            const start = performance.now();
            const step = (now: number) => {
              const progress = Math.min((now - start) / duration, 1);
              const eased = 1 - Math.pow(1 - progress, 3);
              const current = Math.round(eased * endNum);
              el.textContent = prefix + current + suffix;
              if (progress < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
            counterObs.unobserve(el);
          });
        },
        { threshold: 0.3 }
      );
      counters.forEach((c) => counterObs.observe(c));
    }

    /* Sticky mobile CTA */
    const sticky = stickyRef.current;
    const hero = heroRef.current;
    const cta = ctaRef.current;
    if (sticky && hero) {
      const stickyObs = new IntersectionObserver(
        (entries) => {
          const heroVisible = entries.some(
            (e) => e.target === hero && e.isIntersecting
          );
          const ctaVisible = entries.some(
            (e) => e.target === cta && e.isIntersecting
          );
          sticky.classList.toggle("visible", !heroVisible && !ctaVisible);
        },
        { threshold: 0.1 }
      );
      stickyObs.observe(hero);
      if (cta) stickyObs.observe(cta);
    }

    /* Hero parallax */
    const mesh = meshRef.current;
    const grid = gridRef.current;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    let ticking = false;
    const handleParallax = () => {
      if (!mesh || !grid || reducedMotion) return;
      if (!ticking) {
        requestAnimationFrame(() => {
          const y = window.scrollY;
          if (y < window.innerHeight * 1.5) {
            mesh.style.transform = `translateY(${y * 0.3}px)`;
            grid.style.transform = `translateY(${y * 0.15}px)`;
          }
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener("scroll", handleParallax, { passive: true });

    /* Back to top */
    const backBtn = backTopRef.current;
    const handleBackScroll = () => {
      if (backBtn) {
        backBtn.classList.toggle("visible", window.scrollY > window.innerHeight);
      }
    };
    window.addEventListener("scroll", handleBackScroll, { passive: true });

    /* Smooth anchor scroll */
    const anchors = document.querySelectorAll<HTMLAnchorElement>(
      'a[href^="#"]'
    );
    const anchorHandler = (e: Event) => {
      const a = e.currentTarget as HTMLAnchorElement;
      const href = a.getAttribute("href");
      if (!href) return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    anchors.forEach((a) => a.addEventListener("click", anchorHandler));

    return () => {
      window.removeEventListener("scroll", handleParallax);
      window.removeEventListener("scroll", handleBackScroll);
      anchors.forEach((a) => a.removeEventListener("click", anchorHandler));
    };
  }, []);

  /* ── Comparison toggle ── */
  const handleCompareClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const btn = (e.target as HTMLElement).closest("button");
      if (!btn) return;
      const tab = btn.getAttribute("data-tab");
      const toggle = e.currentTarget;
      const panel = toggle.parentElement?.querySelector("#compare-panel");
      if (!panel) return;
      const btns = toggle.querySelectorAll("button");
      const values = panel.querySelectorAll(".compare-value");
      btns.forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      values.forEach((v) => {
        const isGlow = tab === "glowlytics";
        const text = isGlow
          ? v.getAttribute("data-glow")
          : v.getAttribute("data-other");
        const check = v.querySelector(".compare-check");
        const label = v.querySelector(".compare-label");
        if (isGlow) {
          v.className = "compare-value good";
          if (check) check.textContent = "\u2713";
        } else {
          v.className = "compare-value bad";
          if (check) check.textContent = "\u2715";
        }
        if (label) label.textContent = text;
      });
    },
    []
  );

  return (
    <div className="landing-page">
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* HERO */}
      <section className="hero" ref={heroRef}>
        <div className="hero-mesh" ref={meshRef} />
        <div className="hero-grid" ref={gridRef} />

        <div className="hero-content" id="hero-content">
          <div className="hero-badge an an1">
            <span className="hero-badge-dot" aria-hidden="true" />
            Built by doctors. Backed by research.
          </div>
          <h1 className="an an2">
            See real results
            <br />
            in{" "}
            <span
              className="hero-rotate"
              aria-live="polite"
              aria-atomic="true"
            >
              <span className="hero-rotate-inner">
                <span className="accent">7 days.</span>
                <span className="accent">your skin.</span>
                <span className="accent">the data.</span>
              </span>
            </span>
          </h1>
          <p className="hero-sub an an3">
            The first skin tracker that actually explains what it sees. Scan your
            face in seconds and get clinical-grade scores for acne, hydration,
            sun damage, and more.
          </p>
          <div className="hero-actions an an4">
            <a href={APP_STORE_URL} className="btn-primary">
              Download on the App Store
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M1 7h12M8 2l5 5-5 5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
            <a href="#how" className="btn-ghost">
              See how it works
            </a>
          </div>
          <p
            className="hero-trust an an4"
            style={{
              marginTop: "24px",
              fontSize: "13px",
              color: "rgba(255,255,255,0.3)",
              fontWeight: 500,
              letterSpacing: "0.2px",
            }}
          >
            Free 7-day trial &middot; No credit card required &middot; Photos
            never stored
          </p>
        </div>

        <div className="hero-showcase an an5">
          <div className="phone-wrapper">
            {/* Score card */}
            <div className="float-card fc-score">
              <div className="score-ring">
                <svg viewBox="0 0 72 72">
                  <defs>
                    <linearGradient
                      id="scoreGrad"
                      x1="0"
                      y1="0"
                      x2="1"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="#7DE7E1" />
                      <stop offset="100%" stopColor="#8A6FE8" />
                    </linearGradient>
                  </defs>
                  <circle className="score-track" cx="36" cy="36" r="30" />
                  <circle className="score-fill" cx="36" cy="36" r="30" />
                </svg>
                <span className="score-val">74</span>
              </div>
              <div className="score-label">Skin Score</div>
            </div>

            {/* Signal bars */}
            <div className="float-card fc-signals">
              <div className="fc-signals-title">Skin Signals</div>
              <div className="signal-row">
                <span
                  className="signal-dot"
                  style={{ background: "var(--teal)" }}
                />
                <span className="signal-name">Hydration</span>
                <div className="signal-bar-bg">
                  <div
                    className="signal-bar-fill"
                    style={{ width: "73%", background: "var(--teal)" }}
                  />
                </div>
              </div>
              <div className="signal-row">
                <span
                  className="signal-dot"
                  style={{ background: "var(--purple)" }}
                />
                <span className="signal-name">Structure</span>
                <div className="signal-bar-bg">
                  <div
                    className="signal-bar-fill"
                    style={{ width: "62%", background: "var(--purple)" }}
                  />
                </div>
              </div>
              <div className="signal-row">
                <span
                  className="signal-dot"
                  style={{ background: "var(--coral)" }}
                />
                <span className="signal-name">Inflammation</span>
                <div className="signal-bar-bg">
                  <div
                    className="signal-bar-fill"
                    style={{ width: "40%", background: "var(--coral)" }}
                  />
                </div>
              </div>
              <div className="signal-row">
                <span
                  className="signal-dot"
                  style={{ background: "var(--amber)" }}
                />
                <span className="signal-name">Sun Damage</span>
                <div className="signal-bar-bg">
                  <div
                    className="signal-bar-fill"
                    style={{ width: "44%", background: "var(--amber)" }}
                  />
                </div>
              </div>
              <div className="signal-row">
                <span
                  className="signal-dot"
                  style={{ background: "var(--blue)" }}
                />
                <span className="signal-name">Elasticity</span>
                <div className="signal-bar-bg">
                  <div
                    className="signal-bar-fill"
                    style={{ width: "55%", background: "var(--blue)" }}
                  />
                </div>
              </div>
            </div>

            {/* Insight card */}
            <div className="float-card fc-insight">
              <div className="fc-insight-label">Today&apos;s Insight</div>
              <p>
                Mild inflammation in T-zone. Barrier repair recommended before
                PM routine.
                <span className="typing-cursor" aria-hidden="true" />
              </p>
            </div>

            <div className="phone">
              <picture>
                <source srcSet="/app-screenshot.webp" type="image/webp" />
                <img
                  src="/app-screenshot.png"
                  alt="Glowlytics app showing skin analysis dashboard"
                  width={276}
                  height={600}
                />
              </picture>
            </div>
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF BAR */}
      <div className="social-bar">
        <div className="social-bar-inner">
          <div className="social-stat reveal rd1">
            <div className="num" data-count="5">
              5
            </div>
            <div className="lbl">Skin signals tracked daily</div>
          </div>
          <div className="social-divider" />
          <div className="social-stat reveal rd2">
            <div className="num" data-count="10" data-prefix="<" data-suffix="s">
              10s
            </div>
            <div className="lbl">Full analysis time</div>
          </div>
          <div className="social-divider" />
          <div className="social-stat reveal rd3">
            <div className="num" data-count="3">
              3
            </div>
            <div className="lbl">AI layers in parallel</div>
          </div>
          <div className="social-divider" />
          <div className="social-stat reveal rd4">
            <div className="num">0</div>
            <div className="lbl">Photos stored. Ever.</div>
          </div>
        </div>
      </div>

      {/* TRANSITION */}
      <div className="section-transition" />

      {/* HOW IT WORKS */}
      <section className="how" id="how">
        <div className="section-header">
          <div className="section-eyebrow reveal rd1">How It Works</div>
          <h2 className="section-title reveal rd2">
            Scan. Analyze. Improve.
          </h2>
        </div>

        <div className="how-steps">
          <div className="step-card step-1 reveal rd2">
            <div className="step-num">1</div>
            <span className="step-icon">
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--purple)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2" y="4" width="20" height="16" rx="3" />
                <circle cx="12" cy="12" r="4" />
                <path d="M17 4v-1M7 4v-1" />
              </svg>
            </span>
            <h3>Take a quick scan</h3>
            <p>
              Hold up your phone and our smart camera guides you. It
              auto-detects your face, checks lighting, and captures the perfect
              shot.
            </p>
          </div>
          <div className="step-card step-2 reveal rd3">
            <div className="step-num">2</div>
            <span className="step-icon">
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--teal)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </span>
            <h3>AI does the heavy lifting</h3>
            <p>
              Three analysis engines work at the same time, spotting patterns a
              mirror can&apos;t show you. All in under 10 seconds.
            </p>
          </div>
          <div className="step-card step-3 reveal rd4">
            <div className="step-num">3</div>
            <span className="step-icon">
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--coral)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 3v18h18" />
                <path d="M7 16l4-6 4 4 5-8" />
              </svg>
            </span>
            <h3>See what matters</h3>
            <p>
              Get scored across 5 skin signals, track changes over time, and
              receive personalized, research-backed guidance.
            </p>
          </div>
        </div>
      </section>

      {/* FEATURES BENTO */}
      <section className="features" id="features">
        <div className="section-header">
          <div className="section-eyebrow reveal rd1">Features</div>
          <h2 className="section-title reveal rd2">
            Your skin health dashboard
          </h2>
          <p
            className="section-sub reveal rd3"
            style={{
              maxWidth: "520px",
              margin: "16px auto 0",
              fontSize: "16px",
              color: "var(--mid-text)",
              lineHeight: 1.7,
            }}
          >
            One daily scan. Five dimensions of insight. Recommendations you can
            actually trust.
          </p>
        </div>

        <div className="bento">
          <div className="bento-card b-wide b-teal reveal rd1">
            <div className="bento-icon bi-teal">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--teal)"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <path d="M12 2.7c0 0-7 8.3-7 12.3a7 7 0 1014 0c0-4-7-12.3-7-12.3z" />
              </svg>
            </div>
            <h3>5 Skin Signals, One Scan</h3>
            <p>
              Structure, hydration, inflammation, sun damage, and elasticity.
              Each scored 0-100 so you always know exactly where your skin
              stands.
            </p>
            <div className="mini-signals">
              <div className="mini-bar" />
              <div className="mini-bar" />
              <div className="mini-bar" />
              <div className="mini-bar" />
              <div className="mini-bar" />
            </div>
          </div>
          <div className="bento-card b-narrow b-purple reveal rd2">
            <div className="bento-icon bi-purple">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--purple)"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </div>
            <h3>Spot Detection</h3>
            <p>
              Real-time AI identifies blemishes, bumps, and spots as you scan.
              Right on your screen, instantly.
            </p>
          </div>
          <div className="bento-card b-half b-coral reveal rd3">
            <div className="bento-icon bi-coral">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--coral)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <h3>Track Changes Over Time</h3>
            <p>
              Watch your skin improve day by day. Know what&apos;s working and
              what&apos;s not, backed by real data instead of guesswork.
            </p>
          </div>
          <div className="bento-card b-half b-amber reveal rd4">
            <div className="bento-icon bi-amber">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--amber)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
              </svg>
            </div>
            <h3>Doctor-Backed Recommendations</h3>
            <p>
              Every insight is grounded in AAD and ACOG clinical guidelines. The
              same references your dermatologist uses.
            </p>
          </div>
          <div className="bento-card b-narrow b-blue reveal rd5">
            <div className="bento-icon bi-blue">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--blue)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </div>
            <h3>Stay Consistent</h3>
            <p>
              Earn XP, unlock badges, and complete weekly challenges that make
              skincare a habit, not a chore.
            </p>
          </div>
          <div className="bento-card b-wide b-purple reveal rd6">
            <div className="bento-icon bi-purple">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--purple)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            </div>
            <h3>Your Photos Stay Yours</h3>
            <p>
              Photos are analyzed and immediately discarded. No facial
              recognition, no data selling. Your skin data is encrypted and only
              yours.
            </p>
          </div>
        </div>
      </section>

      {/* WHY GLOWLYTICS */}
      <section
        className="why"
        style={{
          background: "var(--cream)",
          padding: "0 clamp(20px, 5vw, 48px) 120px",
        }}
      >
        <div className="section-header">
          <div className="section-eyebrow reveal rd1">Why Glowlytics</div>
          <h2 className="section-title reveal rd2">Not another filter app</h2>
        </div>
        <div className="compare-wrap reveal rd3">
          <div
            className="compare-toggle"
            id="compare-toggle"
            role="tablist"
            onClick={handleCompareClick}
          >
            <button
              role="tab"
              aria-selected="false"
              aria-controls="compare-panel"
              data-tab="others"
            >
              Other Apps
            </button>
            <button
              role="tab"
              aria-selected="true"
              aria-controls="compare-panel"
              data-tab="glowlytics"
              className="active"
            >
              Glowlytics
            </button>
          </div>
          <div className="compare-panel" id="compare-panel">
            <div className="compare-row">
              <span className="compare-feature">AI Engines</span>
              <span
                className="compare-value good"
                data-glow="3 in parallel"
                data-other="1 model"
              >
                <span className="compare-check">&#x2713;</span>{" "}
                <span className="compare-label">3 in parallel</span>
              </span>
            </div>
            <div className="compare-row">
              <span className="compare-feature">Clinical Backing</span>
              <span
                className="compare-value good"
                data-glow="19 AAD/ACOG guidelines"
                data-other="None"
              >
                <span className="compare-check">&#x2713;</span>{" "}
                <span className="compare-label">19 AAD/ACOG guidelines</span>
              </span>
            </div>
            <div className="compare-row">
              <span className="compare-feature">Analysis Speed</span>
              <span
                className="compare-value good"
                data-glow="Under 10 seconds"
                data-other="45+ seconds"
              >
                <span className="compare-check">&#x2713;</span>{" "}
                <span className="compare-label">Under 10 seconds</span>
              </span>
            </div>
            <div className="compare-row">
              <span className="compare-feature">Trend Tracking</span>
              <span
                className="compare-value good"
                data-glow="Daily + product correlation"
                data-other="Not available"
              >
                <span className="compare-check">&#x2713;</span>{" "}
                <span className="compare-label">
                  Daily + product correlation
                </span>
              </span>
            </div>
            <div className="compare-row">
              <span className="compare-feature">Transparency</span>
              <span
                className="compare-value good"
                data-glow="Scores with confidence %"
                data-other="Black box"
              >
                <span className="compare-check">&#x2713;</span>{" "}
                <span className="compare-label">
                  Scores with confidence %
                </span>
              </span>
            </div>
            <div className="compare-row">
              <span className="compare-feature">Photo Privacy</span>
              <span
                className="compare-value good"
                data-glow="Instantly deleted"
                data-other="Stored on servers"
              >
                <span className="compare-check">&#x2713;</span>{" "}
                <span className="compare-label">Instantly deleted</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* TRANSITION */}
      <div className="transition-cream-dark" />

      {/* SCIENCE */}
      <section className="science" id="science">
        <div className="section-header">
          <div className="section-eyebrow reveal rd1">The Science</div>
          <h2 className="section-title reveal rd2">
            Three layers of intelligence
          </h2>
        </div>

        <p className="science-body reveal rd3">
          Most skin apps rely on <strong>a single AI model</strong> that makes
          its best guess. Glowlytics runs{" "}
          <span className="teal">three analysis engines simultaneously</span>,
          each built on peer-reviewed dermatology research.
        </p>

        <div className="layer-grid">
          <div className="layer-card reveal rd2">
            <div className="layer-num">Layer 1</div>
            <h4>Precision Imaging</h4>
            <p>
              Clinical-grade color and texture analysis measures what your eyes
              can&apos;t see: redness patterns, pigmentation shifts, and skin
              texture changes. All in milliseconds.
            </p>
          </div>
          <div className="layer-card reveal rd3">
            <div className="layer-num">Layer 2</div>
            <h4>Computer Vision</h4>
            <p>
              Custom-trained neural networks evaluate skin structure, hydration,
              and elasticity while detecting individual blemishes in real-time.
            </p>
          </div>
          <div className="layer-card reveal rd4">
            <div className="layer-num">Layer 3</div>
            <h4>AI Dermatologist</h4>
            <p>
              A fine-tuned GPT-4o model classifies conditions, grades severity,
              and delivers personalized recommendations grounded in clinical
              guidelines.
            </p>
          </div>
        </div>
      </section>

      {/* TRUST LOGOS */}
      <div className="trust-strip">
        <div className="trust-logos-label reveal rd1">
          Built with technology from
        </div>
        <div className="trust-logos">
          <div className="trust-logo reveal rd1" title="Coming to iOS">
            <svg
              width="16"
              height="22"
              viewBox="0 0 16 22"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
            >
              <rect x="1" y="1" width="14" height="20" rx="3" />
              <line x1="5" y1="18" x2="11" y2="18" opacity="0.5" />
            </svg>
            <span>iOS</span>
          </div>
          <div
            className="trust-logo reveal rd2"
            title="Built at Cornell University"
          >
            <span className="trust-wordmark">Cornell</span>
            <span>University</span>
          </div>
          <div
            className="trust-logo reveal rd3"
            title="Powered by OpenAI GPT-4o"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M22.282 9.821a5.985 5.985 0 00-.516-4.91 6.046 6.046 0 00-6.51-2.9A6.065 6.065 0 0011.694.01a6.043 6.043 0 00-5.77 4.18 6.022 6.022 0 00-4.032 2.92 6.06 6.06 0 00.743 7.097 5.98 5.98 0 00.51 4.911 6.051 6.051 0 006.515 2.9A5.985 5.985 0 0013.26 23.1a6.043 6.043 0 005.77-4.18 6.013 6.013 0 004.033-2.92 6.052 6.052 0 00-.781-6.18zM13.26 21.047a4.508 4.508 0 01-2.89-1.04l.142-.082 4.806-2.774a.78.78 0 00.395-.678v-6.77l2.032 1.173a.072.072 0 01.04.055v5.609a4.53 4.53 0 01-4.524 4.507zM3.6 17.14a4.49 4.49 0 01-.54-3.025l.143.084 4.806 2.775a.786.786 0 00.786 0l5.87-3.39v2.346a.072.072 0 01-.03.062l-4.861 2.806A4.525 4.525 0 013.6 17.14zM2.34 7.896A4.485 4.485 0 014.698 5.91l-.002.164v5.548a.78.78 0 00.395.679l5.869 3.388-2.03 1.173a.072.072 0 01-.07.005L3.996 14.06A4.526 4.526 0 012.34 7.896zm17.078 3.98l-5.87-3.39 2.032-1.172a.072.072 0 01.07-.005l4.862 2.807a4.517 4.517 0 01-.676 8.14v-5.7a.785.785 0 00-.418-.68zm2.02-3.04l-.143-.085-4.806-2.775a.786.786 0 00-.786 0l-5.87 3.39V6.92a.072.072 0 01.03-.062l4.861-2.806a4.524 4.524 0 016.714 4.684zm-12.7 4.18L6.706 11.84a.072.072 0 01-.04-.056V6.177a4.522 4.522 0 017.415-3.464l-.142.08L9.133 5.57a.78.78 0 00-.395.679l-.005 6.768zm1.104-2.38l2.613-1.508 2.613 1.508v3.016l-2.613 1.508-2.613-1.508z" />
            </svg>
            <span>OpenAI</span>
          </div>
          <div
            className="trust-logo reveal rd4"
            title="AAD Clinical Guidelines"
          >
            <span className="trust-wordmark">AAD</span>
            <span>Guidelines</span>
          </div>
          <div
            className="trust-logo reveal rd5"
            title="ACOG Clinical Guidelines"
          >
            <span className="trust-wordmark">ACOG</span>
            <span>Guidelines</span>
          </div>
          <div className="trust-logo reveal rd6" title="Featured on BetaList">
            <a
              target="_blank"
              rel="noopener noreferrer"
              href="https://betalist.com/startups/glowlytics?utm_campaign=badge-glowlytics&utm_medium=badge&utm_source=badge-featured"
              style={{ display: "flex", alignItems: "center" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt="Glowlytics on BetaList"
                width={156}
                height={54}
                style={{
                  width: "156px",
                  height: "54px",
                  opacity: 0.5,
                  transition: "opacity 0.3s ease",
                }}
                src="https://betalist.com/badges/featured?id=153472&theme=color"
                loading="lazy"
              />
            </a>
          </div>
        </div>
      </div>

      {/* TESTIMONIALS */}
      <section className="testimonial" id="testimonials">
        <div className="section-header" style={{ marginBottom: "48px" }}>
          <div className="section-eyebrow reveal rd1">
            What Beta Testers Say
          </div>
          <h2 className="section-title reveal rd2">
            Real people, real results
          </h2>
        </div>
        <div className="testimonial-grid">
          <div className="testimonial-card reveal rd1">
            <div className="t-stars" aria-label="5 out of 5 stars">
              &#9733;&#9733;&#9733;&#9733;&#9733;
            </div>
            <p className="testimonial-text">
              I&apos;ve tried every skin tracking app out there. Glowlytics is
              the first one that actually gives me scores I trust, because it
              shows me exactly how it got there.
            </p>
            <div className="testimonial-author">
              <div className="testimonial-avatar">S</div>
              <div className="testimonial-meta">
                <div className="t-name">Sarah K.</div>
                <div className="t-role">Skincare Enthusiast</div>
              </div>
            </div>
          </div>
          <div className="testimonial-card reveal rd2">
            <div className="t-stars" aria-label="5 out of 5 stars">
              &#9733;&#9733;&#9733;&#9733;&#9733;
            </div>
            <p className="testimonial-text">
              The daily scan takes seconds, but the data it gives you is insane.
              I finally understand why my skin flares up after certain products.
            </p>
            <div className="testimonial-author">
              <div className="testimonial-avatar">M</div>
              <div className="testimonial-meta">
                <div className="t-name">Marcus R.</div>
                <div className="t-role">Acne-Prone Skin</div>
              </div>
            </div>
          </div>
          <div className="testimonial-card reveal rd3">
            <div className="t-stars" aria-label="5 out of 5 stars">
              &#9733;&#9733;&#9733;&#9733;&#9733;
            </div>
            <p className="testimonial-text">
              As a med student, I appreciate that the recommendations cite actual
              AAD guidelines. This isn&apos;t some random AI guessing. It&apos;s
              grounded in real science.
            </p>
            <div className="testimonial-author">
              <div className="testimonial-avatar">J</div>
              <div className="testimonial-meta">
                <div className="t-name">Jasmine T.</div>
                <div className="t-role">Medical Student</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BETA RESULTS */}
      <div className="beta-results">
        <div className="beta-results-inner">
          <div className="beta-results-header reveal rd1">
            <h3>What beta testers experienced</h3>
            <p>Early data from our testing cohort</p>
          </div>
          <div className="beta-stats">
            <div className="beta-stat reveal rd2">
              <div className="beta-num" data-count="87" data-suffix="%">
                87%
              </div>
              <div className="beta-label">
                reported better understanding of their skin within the first week
              </div>
            </div>
            <div className="beta-stat reveal rd3">
              <div className="beta-num" data-count="92" data-suffix="%">
                92%
              </div>
              <div className="beta-label">
                said they&apos;d recommend Glowlytics to a friend
              </div>
            </div>
            <div className="beta-stat reveal rd4">
              <div className="beta-num" data-count="4" data-suffix="x">
                4x
              </div>
              <div className="beta-label">
                more daily scans completed after 2 weeks vs. week one
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <section className="faq" id="faq">
        <div className="section-header" style={{ marginBottom: "48px" }}>
          <div className="section-eyebrow reveal rd1">FAQ</div>
          <h2 className="section-title reveal rd2">Common questions</h2>
        </div>
        <div className="faq-list">
          <details className="faq-item reveal rd1">
            <summary>Can Glowlytics replace my dermatologist?</summary>
            <p>
              Glowlytics is designed to complement your dermatologist, not
              replace them. Think of it as a daily check-in between appointments,
              helping you track what&apos;s changing and giving you better data
              to share with your doctor.
            </p>
          </details>
          <details className="faq-item reveal rd2">
            <summary>What happens to my photos?</summary>
            <p>
              Your photos are analyzed in real-time and immediately discarded. We
              never store facial images on our servers. Your privacy is
              non-negotiable.
            </p>
          </details>
          <details className="faq-item reveal rd3">
            <summary>How accurate is the analysis?</summary>
            <p>
              Glowlytics uses three analysis engines running in parallel,
              including clinical-grade image processing and a fine-tuned AI
              model, to deliver scores with confidence indicators. Our methods
              are grounded in peer-reviewed dermatology research.
            </p>
          </details>
          <details className="faq-item reveal rd4">
            <summary>Is there a free trial?</summary>
            <p>
              Yes. Every new user gets a free 7-day trial with full access to all
              features. No credit card required to start.
            </p>
          </details>
          <details className="faq-item reveal rd5">
            <summary>What skin types does it work with?</summary>
            <p>
              Glowlytics works across all skin types and tones. Our analysis
              pipeline includes ITA (Individual Typology Angle) calibration to
              ensure accurate results regardless of melanin levels.
            </p>
          </details>
        </div>
      </section>

      {/* CTA */}
      <section className="cta" id="access" ref={ctaRef}>
        <div className="cta-inner">
          <h2 className="reveal rd1">
            Start tracking your skin
            <br />
            with <span className="accent">real data.</span>
          </h2>
          <p className="cta-sub reveal rd2">
            Download Glowlytics on iPhone, start your 7-day trial, and use daily
            scans to see what actually changes your skin.
          </p>
          <p
            className="cta-urgency reveal rd3"
            style={{
              fontSize: "13px",
              color: "var(--teal)",
              fontWeight: 600,
              marginBottom: "28px",
              letterSpacing: "0.3px",
              opacity: 0.8,
            }}
          >
            Available on the App Store &middot; 7-day free trial &middot; Photos
            never stored
          </p>

          <div className="form-wrap reveal rd3">
            <div
              className="hero-actions"
              style={{ justifyContent: "center", marginBottom: "14px" }}
            >
              <a href={APP_STORE_URL} className="btn-primary">
                Download on the App Store
              </a>
              <a href="/faq/what-is-glowlytics" className="btn-ghost">
                See what Glowlytics tracks
              </a>
            </div>
            <p className="form-note" style={{ display: "block" }}>
              iPhone only. No credit card required to start your free trial.
            </p>
          </div>
        </div>
      </section>

      {/* BACK TO TOP */}
      <button
        className="back-top"
        ref={backTopRef}
        aria-label="Back to top"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M9 15V3M3 8l6-6 6 6" />
        </svg>
      </button>

      {/* STICKY MOBILE CTA */}
      <div className="sticky-cta" ref={stickyRef}>
        <a href={APP_STORE_URL}>Download on the App Store</a>
        <div className="sticky-cta-sub">
          7-day free trial &middot; iPhone only
        </div>
      </div>
    </div>
  );
}
