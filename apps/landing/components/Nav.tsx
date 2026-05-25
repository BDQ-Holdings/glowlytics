import Link from "next/link";

const APP_STORE_URL = "https://apps.apple.com/app/glowlytics/id6760600635";

export default function Nav() {
  return (
    <nav className="site-nav">
      <div className="site-nav-inner">
        <Link href="/" className="wordmark" aria-label="Glowlytics home">
          Glowl<em>y</em>tics
        </Link>
        <div className="site-nav-links">
          <Link href="/blog">Blog</Link>
          <Link href="/guides">Guides</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/glossary">Glossary</Link>
        </div>
        <a href={APP_STORE_URL} className="site-nav-cta">
          Get Glowlytics
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
      </div>

      <style>{`
        .site-nav {
          position: sticky;
          top: 0;
          z-index: 50;
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          background: color-mix(in oklab, var(--bg) 80%, transparent);
          border-bottom: 1px solid var(--hairline);
        }
        .site-nav-inner {
          max-width: 1240px;
          margin: 0 auto;
          padding: 18px 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 28px;
        }
        .site-nav .wordmark {
          font-family: var(--font-script);
          font-size: 30px;
          font-weight: 600;
          line-height: 1;
          color: var(--ink);
          letter-spacing: -0.5px;
        }
        .site-nav .wordmark em {
          color: var(--accent);
          font-style: normal;
        }
        .site-nav-links {
          display: flex;
          gap: 30px;
          align-items: center;
        }
        .site-nav-links a {
          font-size: 13px;
          color: var(--ink);
          opacity: 0.68;
          transition: opacity 160ms var(--ease-out);
          font-weight: 500;
        }
        .site-nav-links a:hover {
          opacity: 1;
        }
        .site-nav-cta {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 18px;
          border-radius: 999px;
          background: var(--ink);
          color: var(--bg);
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.1px;
          transition: transform 160ms var(--ease-out), background 160ms var(--ease-out);
        }
        .site-nav-cta:hover {
          transform: translateY(-1px);
          background: color-mix(in oklab, var(--ink) 92%, var(--accent));
        }
        @media (max-width: 720px) {
          .site-nav-inner {
            padding: 14px 20px;
            gap: 14px;
          }
          .site-nav-links {
            display: none;
          }
          .site-nav .wordmark {
            font-size: 26px;
          }
          .site-nav-cta {
            padding: 11px 16px;
            font-size: 12.5px;
            min-height: 40px;
          }
        }
        @media (max-width: 360px) {
          .site-nav-inner {
            padding: 12px 16px;
            gap: 10px;
          }
          .site-nav-cta {
            padding: 10px 14px;
            font-size: 12px;
          }
          .site-nav .wordmark {
            font-size: 24px;
          }
        }
      `}</style>
    </nav>
  );
}
