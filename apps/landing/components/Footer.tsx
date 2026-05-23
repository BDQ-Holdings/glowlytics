import Link from "next/link";

export default function Footer() {
  return (
    <footer className="site-foot">
      <div className="site-foot-inner">
        <div className="site-foot-col site-foot-brand">
          <span className="wordmark" style={{ fontSize: 30 }}>
            Glowl<em>y</em>tics
          </span>
          <p>
            A glow companion that listens before it speaks. Built quietly in Lisbon and Brooklyn.
          </p>
        </div>
        <div className="site-foot-col">
          <h5>The app</h5>
          <a href="/#how">How it works</a>
          <a href="/#facets">What we watch</a>
          <a href="/#patterns">Patterns</a>
          <a href="/#shelf">Shelf verdicts</a>
        </div>
        <div className="site-foot-col">
          <h5>Library</h5>
          <Link href="/blog">Blog</Link>
          <Link href="/guides">Guides</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/glossary">Glossary</Link>
        </div>
        <div className="site-foot-col">
          <h5>Quiet print</h5>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <a href="mailto:hello@glowlytics.ai">hello@glowlytics.ai</a>
        </div>
      </div>
      <div className="site-foot-legal">
        <span>© {new Date().getFullYear()} Glowlytics · BDQ Holdings LLC</span>
        <span>Made to be edited.</span>
      </div>

      <style>{`
        .site-foot {
          padding: 80px 32px 56px;
          border-top: 1px solid var(--hairline);
          margin-top: 80px;
          background: var(--bg);
        }
        .site-foot-inner {
          max-width: 1240px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1.6fr 1fr 1fr 1fr;
          gap: 56px;
        }
        .site-foot-col h5 {
          margin: 0 0 18px;
          font-family: ui-monospace, "SF Mono", monospace;
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--muted);
          font-weight: 500;
        }
        .site-foot-col a {
          display: block;
          font-size: 14px;
          color: var(--ink);
          opacity: 0.72;
          padding: 5px 0;
          transition: opacity 160ms var(--ease-out);
        }
        .site-foot-col a:hover {
          opacity: 1;
        }
        .site-foot-brand p {
          margin: 18px 0 0;
          font-size: 13px;
          color: var(--muted);
          line-height: 1.65;
          max-width: 320px;
        }
        .site-foot-legal {
          max-width: 1240px;
          margin: 56px auto 0;
          padding-top: 28px;
          border-top: 1px solid var(--hairline);
          display: flex;
          justify-content: space-between;
          font-family: ui-monospace, "SF Mono", monospace;
          font-size: 11px;
          letter-spacing: 0.06em;
          color: var(--muted);
        }
        @media (max-width: 900px) {
          .site-foot-inner {
            grid-template-columns: 1fr 1fr;
            gap: 36px;
          }
        }
        @media (max-width: 560px) {
          .site-foot {
            padding: 56px 24px 40px;
          }
          .site-foot-inner {
            grid-template-columns: 1fr;
            gap: 32px;
          }
          .site-foot-legal {
            flex-direction: column;
            gap: 10px;
            margin-top: 36px;
          }
        }
      `}</style>
    </footer>
  );
}
