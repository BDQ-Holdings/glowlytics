import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Glowlytics Terms of Service.",
};

const sections: { num: string; title: string; body: React.ReactNode }[] = [
  {
    num: "01",
    title: "Acceptance of terms",
    body: (
      <p>
        By accessing or using Glowlytics (&ldquo;the Service&rdquo;), you agree to be bound by
        these Terms of Service. If you do not agree, do not use the Service.
      </p>
    ),
  },
  {
    num: "02",
    title: "Description of service",
    body: (
      <p>
        Glowlytics provides AI-powered skin health tracking for informational purposes only. It
        is not a medical device and does not provide medical diagnoses, treatment recommendations,
        or clinical advice.
      </p>
    ),
  },
  {
    num: "03",
    title: "Medical disclaimer",
    body: (
      <p>
        Glowlytics is a wellness tool, not a substitute for professional medical advice. Always
        consult a qualified dermatologist or healthcare provider for medical concerns. Never
        disregard professional medical advice because of information provided by the Service.
      </p>
    ),
  },
  {
    num: "04",
    title: "User accounts",
    body: (
      <p>
        You are responsible for maintaining the confidentiality of your account credentials and
        for all activities under your account.
      </p>
    ),
  },
  {
    num: "05",
    title: "Privacy",
    body: (
      <p>
        Your use of the Service is governed by our <Link href="/privacy">Privacy Policy</Link>.
        Scan photos are processed for analysis and retained in accordance with that policy.
      </p>
    ),
  },
  {
    num: "06",
    title: "Subscriptions",
    body: (
      <p>
        Glow Pro is an auto-renewing subscription managed by the Apple App Store or Google Play.
        It renews automatically unless canceled at least 24 hours before the end of the current
        billing period. Pricing, billing cadence, cancellation, and refunds are handled by the
        applicable app store.
      </p>
    ),
  },
  {
    num: "07",
    title: "Intellectual property",
    body: (
      <p>
        All content, features, and functionality of the Service are owned by BDQ Holdings LLC and
        are protected by copyright, trademark, and other intellectual property laws.
      </p>
    ),
  },
  {
    num: "08",
    title: "Limitation of liability",
    body: (
      <p>
        To the fullest extent permitted by law, BDQ Holdings LLC shall not be liable for any
        indirect, incidental, special, consequential, or punitive damages arising out of your use
        of the Service.
      </p>
    ),
  },
  {
    num: "09",
    title: "Changes to terms",
    body: (
      <p>
        We reserve the right to modify these terms at any time. Continued use of the Service
        after changes constitutes acceptance of the revised terms.
      </p>
    ),
  },
  {
    num: "10",
    title: "Contact",
    body: (
      <p>
        Questions about these terms? Contact us at{" "}
        <a href="mailto:drmustafa@bdqholdings.com">drmustafa@bdqholdings.com</a>.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <div className="legal-shell">
      <header className="legal-header">
        <div className="page-kicker">Terms</div>
        <h1>The quiet print, in plain words.</h1>
        <p>
          These terms govern your use of Glowlytics. We&apos;ve tried to write them like a
          letter, not a contract, but the contract part is real.
        </p>
        <dl className="legal-meta">
          <div>
            <dt>Last updated</dt>
            <dd>April 20, 2026</dd>
          </div>
          <div>
            <dt>Company</dt>
            <dd>BDQ Holdings LLC</dd>
          </div>
        </dl>
      </header>

      <ol className="legal-sections">
        {sections.map((section) => (
          <li key={section.num} className="legal-section">
            <div className="legal-section-num">{section.num}</div>
            <div className="legal-section-body">
              <h2>{section.title}</h2>
              <div className="article-prose">{section.body}</div>
            </div>
          </li>
        ))}
      </ol>

      <p className="legal-back">
        <Link href="/">← Back to Glowlytics</Link>
      </p>

      <style>{`
        .legal-shell {
          width: min(1080px, calc(100% - 48px));
          margin: 0 auto;
          padding: 88px 0 112px;
        }
        .legal-header {
          max-width: 720px;
          margin-bottom: 56px;
        }
        .legal-header h1 {
          margin: 14px 0 0;
          font-family: var(--font-display);
          font-style: italic;
          font-size: clamp(2.6rem, 5vw, 4.6rem);
          line-height: 1.02;
          letter-spacing: -0.02em;
          color: var(--ink);
          font-weight: 400;
          text-wrap: balance;
        }
        .legal-header p {
          margin: 22px 0 0;
          font-size: 1.05rem;
          line-height: 1.65;
          color: var(--muted);
          max-width: 560px;
          text-wrap: pretty;
        }
        .legal-meta {
          margin: 32px 0 0;
          padding: 22px 0 0;
          border-top: 1px solid var(--hairline);
          display: flex;
          flex-wrap: wrap;
          gap: 40px;
        }
        .legal-meta div {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .legal-meta dt {
          font-family: ui-monospace, "SF Mono", monospace;
          font-size: 10.5px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .legal-meta dd {
          margin: 0;
          font-size: 14px;
          color: var(--ink);
        }
        .legal-sections {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .legal-section {
          display: grid;
          grid-template-columns: 100px 1fr;
          gap: 40px;
          padding: 48px 0;
          border-top: 1px solid var(--hairline);
          align-items: start;
        }
        .legal-section:last-child {
          border-bottom: 1px solid var(--hairline);
        }
        .legal-section-num {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 1.6rem;
          color: var(--accent);
          line-height: 1;
          padding-top: 6px;
        }
        .legal-section-body h2 {
          margin: 0 0 14px;
          font-family: var(--font-display);
          font-style: italic;
          font-size: clamp(1.5rem, 2.6vw, 2rem);
          line-height: 1.12;
          letter-spacing: -0.01em;
          color: var(--ink);
          font-weight: 400;
        }
        .legal-section-body .article-prose {
          max-width: 720px;
        }
        .legal-back {
          margin-top: 56px;
          font-family: ui-monospace, "SF Mono", monospace;
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .legal-back a {
          color: var(--muted);
          transition: color 160ms var(--ease-out);
        }
        .legal-back a:hover {
          color: var(--ink);
        }
        @media (max-width: 720px) {
          .legal-shell {
            padding: 56px 0 80px;
          }
          .legal-meta {
            gap: 22px;
          }
          .legal-section {
            grid-template-columns: 1fr;
            gap: 12px;
            padding: 36px 0;
          }
          .legal-section-num {
            font-size: 1.2rem;
          }
        }
      `}</style>
    </div>
  );
}
