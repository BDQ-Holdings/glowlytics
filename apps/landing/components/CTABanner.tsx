const APP_STORE_URL = "https://apps.apple.com/app/glowlytics/id6760600635";

export default function CTABanner({ signal }: { signal?: string }) {
  const title = signal
    ? `Track your ${signal} trend with Glowlytics`
    : "Track your skin health daily with Glowlytics";

  return (
    <section className="cta-banner">
      <div className="cta-banner-inner">
        <div className="cta-banner-text">
          <div className="page-kicker">Glowlytics on iPhone</div>
          <h2>{title}</h2>
          <p>
            Eight seconds a morning. A quietly audited shelf. The first strong pattern surfaces
            around week three — no streak guilt before then, no noise after.
          </p>
        </div>
        <div className="cta-banner-cta">
          <a href={APP_STORE_URL} className="cta-banner-button">
            Download on the App Store
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
              <path d="M14 6l6 6-6 6" />
            </svg>
          </a>
          <span className="cta-banner-meta">iOS 16+ · 7-day trial · photos stay on-device</span>
        </div>
      </div>

      <style>{`
        .cta-banner {
          margin-top: 64px;
          padding: 44px 40px;
          border-radius: 28px;
          background: linear-gradient(160deg, var(--surface), var(--bg));
          border: 1px solid var(--glow);
          position: relative;
          overflow: hidden;
        }
        .cta-banner::before {
          content: "";
          position: absolute;
          top: -140px;
          right: -140px;
          width: 360px;
          height: 360px;
          background: radial-gradient(circle, var(--glow) 0%, transparent 60%);
          opacity: 0.55;
          pointer-events: none;
        }
        .cta-banner-inner {
          position: relative;
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 40px;
          align-items: end;
        }
        .cta-banner-text {
          max-width: 560px;
        }
        .cta-banner-text h2 {
          margin: 14px 0 0;
          font-family: var(--font-display);
          font-style: italic;
          font-size: clamp(1.7rem, 3vw, 2.4rem);
          line-height: 1.08;
          letter-spacing: -0.01em;
          color: var(--ink);
          font-weight: 400;
          text-wrap: balance;
        }
        .cta-banner-text p {
          margin: 14px 0 0;
          font-size: 14.5px;
          line-height: 1.6;
          color: var(--muted);
          max-width: 480px;
        }
        .cta-banner-cta {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 12px;
        }
        .cta-banner-button {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 13px 22px;
          border-radius: 999px;
          background: var(--ink);
          color: var(--bg);
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 0.1px;
          transition: transform 160ms var(--ease-out);
        }
        .cta-banner-button:hover {
          transform: translateY(-2px);
        }
        .cta-banner-meta {
          font-family: ui-monospace, "SF Mono", monospace;
          font-size: 10.5px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--muted);
        }
        @media (max-width: 720px) {
          .cta-banner {
            padding: 32px 26px;
            border-radius: 22px;
          }
          .cta-banner-inner {
            grid-template-columns: 1fr;
            align-items: flex-start;
          }
          .cta-banner-cta {
            align-items: flex-start;
          }
        }
      `}</style>
    </section>
  );
}
