"use client";

import Link from "next/link";
import WaitlistForm from "@/components/WaitlistForm";
import { useEffect, useRef, useState } from "react";
import type { ContentMeta, MarkdownHeading } from "@/lib/types";

const APP_STORE_URL = "https://apps.apple.com/app/glowlytics/id6760600635";

interface RelatedPost {
  slug: string;
  title: string;
  category: string;
  readingTime: number;
  href: string;
}

interface Props {
  meta: ContentMeta;
  headings: MarkdownHeading[];
  related: RelatedPost[];
  children: React.ReactNode;
  /** Editorial category line above the title. Falls back to "Journal". */
  category?: string;
  /** Author display name shown in post-meta and author-block. */
  authorName?: string;
  /** Author role shown under the name. */
  authorRole?: string;
  /** Short author bio for the post-foot author-block. */
  authorBio?: string;
  /** Optional caption rendered beneath the hero. */
  heroCaption?: string;
}

function formatDate(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function ArrowIcon() {
  return (
    <svg
      className="bp-arrow"
      width="16"
      height="16"
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
  );
}

export default function BlogArticleLayout({
  meta,
  headings,
  related,
  children,
  category = "Glowlytics Journal",
  authorName = "Glowlytics Editorial",
  authorRole = "Skin science team",
  authorBio = "The Glowlytics editorial team writes from clinical dermatology research, peer-reviewed studies, and patterns we surface in our own data. Every piece is reviewed against primary sources before it ships.",
  heroCaption,
}: Props) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef<HTMLSpanElement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const date = formatDate(meta.dateModified || meta.dateGenerated);
  const tags = meta.keywords.slice(0, 6);

  useEffect(() => {
    const body = bodyRef.current;
    const bar = progressRef.current;
    if (!body || !bar) return;

    const updateProgress = () => {
      const rect = body.getBoundingClientRect();
      const total = body.offsetHeight - window.innerHeight;
      const read = Math.min(Math.max(-rect.top, 0), Math.max(total, 0));
      bar.style.width = total > 0 ? `${(read / total) * 100}%` : "0%";
    };

    const spy = () => {
      const hs = body.querySelectorAll<HTMLHeadingElement>("h2[id], h3[id]");
      let current: string | null = null;
      hs.forEach((h) => {
        const top = h.getBoundingClientRect().top;
        if (top < 120) current = h.id;
      });
      setActiveId(current);
    };

    const onScroll = () => {
      updateProgress();
      spy();
    };

    updateProgress();
    spy();
    document.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", updateProgress, { passive: true });
    return () => {
      document.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", updateProgress);
    };
  }, []);

  const handleAnchorClick = (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    window.scrollTo({ top: target.offsetTop - 80, behavior: "smooth" });
    history.replaceState(null, "", `#${id}`);
  };

  const handleShare = async () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: meta.title, text: meta.description, url });
        return;
      } catch {
        /* user dismissed, fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard unavailable, no-op */
    }
  };

  const handleCopyLink = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      /* no-op */
    }
  };

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const twitterHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    meta.title,
  )}&url=${encodeURIComponent(shareUrl)}`;
  const mailtoHref = `mailto:?subject=${encodeURIComponent(meta.title)}&body=${encodeURIComponent(
    `${meta.description}\n\n${shareUrl}`,
  )}`;

  return (
    <>
      <div className="bp-progress" aria-hidden="true">
        <span ref={progressRef} className="bp-progress-bar" />
      </div>

      <article className="bp-post">
        <nav className="bp-breadcrumb" aria-label="Breadcrumb">
          <Link href="/blog">Journal</Link>
          <span className="bp-sep">/</span>
          <span className="bp-cur">{meta.title}</span>
        </nav>

        <header className="bp-header">
          <div className="bp-cat">{category}</div>
          <h1 className="bp-title">{meta.title}</h1>
          <p className="bp-dek">{meta.description}</p>

          <div className="bp-meta">
            <div className="bp-av" aria-hidden="true" />
            <div>
              <div className="bp-who">{authorName}</div>
              <div className="bp-role">{authorRole}</div>
            </div>
            {date ? (
              <>
                <span className="bp-dot" />
                <span>{date}</span>
              </>
            ) : null}
            <span className="bp-dot" />
            <span>{meta.readingTime} min read</span>
            <div className="bp-actions">
              <button
                type="button"
                className="bp-iconbtn"
                aria-label="Share article"
                onClick={handleShare}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="6" cy="12" r="2.5" />
                  <circle cx="18" cy="6" r="2.5" />
                  <circle cx="18" cy="18" r="2.5" />
                  <path d="M8 11l8-4M8 13l8 4" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        <div className="bp-hero">
          <div className="bp-hero-img" role="img" aria-label="Article header illustration" />
          {heroCaption ? <div className="bp-hero-cap">{heroCaption}</div> : null}
        </div>

        {headings.length > 0 ? (
          <aside className="bp-toc" aria-label="Table of contents">
            <div className="bp-toc-label">In this piece</div>
            <ul>
              {headings.map((h) => (
                <li key={`${h.id}-${h.level}`} className={`bp-toc-lvl-${h.level}`}>
                  <a
                    href={`#${h.id}`}
                    className={activeId === h.id ? "bp-toc-active" : undefined}
                    onClick={(event) => handleAnchorClick(event, h.id)}
                  >
                    {h.text}
                  </a>
                </li>
              ))}
            </ul>
          </aside>
        ) : (
          // Keep grid area populated so the body column stays centered on wide viewports.
          <div className="bp-toc bp-toc-empty" aria-hidden="true" />
        )}

        <div ref={bodyRef} className="bp-body">
          {children}
        </div>

        <aside className="bp-rail">
          <div className="bp-rail-card">
            <h5>Get the journal, monthly.</h5>
            <p>One short letter. Patterns we surfaced, methods we changed, nothing else.</p>
            <a href="#bp-newsletter" className="bp-btn bp-btn-primary">
              Subscribe
            </a>
          </div>
          <div className="bp-rail-card bp-rail-share">
            <div className="bp-rail-label">Share</div>
            <a href={twitterHref} target="_blank" rel="noopener noreferrer">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M22 4L11 15M22 4l-7 18-4-7-7-4z" />
              </svg>
              On the bird site
            </a>
            <a href={mailtoHref}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M3 7l9 6 9-6" />
              </svg>
              Email a friend
            </a>
            <a href="#" onClick={handleCopyLink}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M10 14L21 3" />
                <path d="M21 3h-7M21 3v7" />
                <path d="M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6" />
              </svg>
              Copy link
            </a>
          </div>
        </aside>

        <footer className="bp-foot">
          {tags.length > 0 ? (
            <div className="bp-tags">
              {tags.map((tag) => (
                <span key={tag} className="bp-tag">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          <div className="bp-author">
            <div className="bp-av-lg" aria-hidden="true" />
            <div>
              <div className="bp-author-lab">Written by</div>
              <h4>{authorName}</h4>
              <p>{authorBio}</p>
            </div>
          </div>

          {meta.sources.length > 0 ? (
            <section className="bp-sources">
              <h3>Sources</h3>
              <ol>
                {meta.sources.map((source, index) => (
                  <li key={`${source.url}-${index}`}>
                    <a href={source.url} target="_blank" rel="noopener noreferrer">
                      {source.title}
                    </a>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </footer>
      </article>

      {related.length > 0 ? (
        <section className="bp-related">
          <div className="bp-related-head">
            <h3>Keep reading</h3>
            <Link href="/blog">
              All of the journal
              <ArrowIcon />
            </Link>
          </div>
          <div className="bp-related-grid">
            {related.map((post) => (
              <Link key={post.slug} href={post.href} className="bp-rel-card">
                <div className="bp-rel-thumb" />
                <div className="bp-rel-cat">{post.category}</div>
                <h4 className="bp-rel-title">{post.title}</h4>
                <div className="bp-rel-meta">{post.readingTime} min read</div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="bp-nl" id="bp-newsletter">
        <div className="bp-nl-inner">
          <h3>One letter, one Tuesday a month.</h3>
          <p>
            Patterns we surfaced, methods we changed, a quiet read. Free to start; unsubscribe
            whenever.
          </p>
          <WaitlistForm
            id="bp-newsletter-form"
            source="blog-newsletter"
            variant="band"
            cta="Send it"
          />
          <p className="bp-nl-foot">
            Prefer the app?{" "}
            <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
              Get Glowlytics on iOS
            </a>
            .
          </p>
        </div>
      </section>

      <style>{`
        /* ─── Reading-progress bar ─── */
        .bp-progress {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          z-index: 60;
          pointer-events: none;
        }
        .bp-progress-bar {
          display: block;
          height: 100%;
          width: 0%;
          background: var(--accent);
          transition: width 80ms linear;
        }

        /* ─── Article layout (3-column on desktop) ─── */
        .bp-post {
          --measure: 680px;
          max-width: 1240px;
          margin: 0 auto;
          padding: 56px 32px 32px;
          display: grid;
          grid-template-columns: 220px minmax(0, var(--measure)) 220px;
          grid-template-areas:
            "breadcrumb breadcrumb breadcrumb"
            "header     header     header"
            "hero       hero       hero"
            "toc        body       aside"
            "foot       foot       foot";
          column-gap: 64px;
          row-gap: 0;
          justify-content: center;
          color: var(--ink);
        }

        .bp-breadcrumb {
          grid-area: breadcrumb;
          display: flex;
          gap: 10px;
          align-items: center;
          font-family: ui-monospace, "SF Mono", monospace;
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 28px;
        }
        .bp-breadcrumb a {
          color: var(--muted);
          text-decoration: none;
          transition: color 160ms var(--ease-out);
        }
        .bp-breadcrumb a:hover { color: var(--ink); }
        .bp-breadcrumb .bp-sep { color: var(--accent2); opacity: 0.7; }
        .bp-breadcrumb .bp-cur { color: var(--accent); }

        /* Article header */
        .bp-header {
          grid-area: header;
          max-width: var(--measure);
          margin: 0 auto;
          text-align: left;
          width: 100%;
          padding-bottom: 40px;
        }
        .bp-cat {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-family: var(--font-display);
          font-style: italic;
          font-size: 14px;
          color: var(--accent);
        }
        .bp-cat::before {
          content: "";
          width: 24px;
          height: 1px;
          background: var(--accent);
        }
        .bp-title {
          font-family: var(--font-display);
          font-style: italic;
          font-size: clamp(38px, 5vw, 64px);
          line-height: 1.04;
          color: var(--ink);
          margin: 18px 0 22px;
          letter-spacing: -0.02em;
          text-wrap: balance;
          font-weight: 400;
        }
        .bp-dek {
          font-size: 21px;
          line-height: 1.5;
          color: var(--muted);
          max-width: 620px;
          text-wrap: pretty;
          font-weight: 300;
          margin: 0;
        }
        .bp-meta {
          margin-top: 36px;
          padding-top: 20px;
          border-top: 1px solid var(--hairline);
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 18px;
          font-size: 13px;
          color: var(--muted);
        }
        .bp-av {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--accent2), var(--glow));
          flex-shrink: 0;
        }
        .bp-who { color: var(--ink); font-weight: 500; }
        .bp-role { font-size: 12px; color: var(--muted); }
        .bp-dot {
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: var(--muted);
        }
        .bp-actions {
          margin-left: auto;
          display: flex;
          gap: 8px;
        }
        .bp-iconbtn {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: var(--surface);
          border: 1px solid var(--glow);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--ink);
          cursor: pointer;
          transition: background 160ms var(--ease-out);
        }
        .bp-iconbtn:hover { background: var(--bg); }

        /* Hero placeholder */
        .bp-hero {
          grid-area: hero;
          margin-bottom: 64px;
        }
        .bp-hero-img {
          aspect-ratio: 21/9;
          border-radius: 28px;
          background:
            radial-gradient(ellipse 60% 60% at 30% 40%, color-mix(in oklab, var(--accent) 18%, transparent), transparent 70%),
            radial-gradient(ellipse 60% 60% at 70% 60%, color-mix(in oklab, var(--accent2) 30%, transparent), transparent 70%),
            linear-gradient(160deg, var(--surface), var(--bg));
          border: 1px solid var(--glow);
        }
        .bp-hero-cap {
          margin-top: 12px;
          font-family: ui-monospace, "SF Mono", monospace;
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 0.04em;
          text-align: center;
        }

        /* TOC (left rail) */
        .bp-toc {
          grid-area: toc;
          position: sticky;
          top: 100px;
          align-self: start;
          max-height: calc(100vh - 120px);
          overflow-y: auto;
          font-size: 13px;
          padding-right: 8px;
        }
        .bp-toc-empty { visibility: hidden; }
        .bp-toc-label {
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--muted);
          margin-bottom: 14px;
          font-weight: 500;
        }
        .bp-toc ul { list-style: none; margin: 0; padding: 0; }
        .bp-toc li { padding: 6px 0; }
        .bp-toc li.bp-toc-lvl-3 { padding-left: 14px; }
        .bp-toc a {
          color: var(--muted);
          text-decoration: none;
          line-height: 1.4;
          display: block;
          transition: color 160ms var(--ease-out);
          border-left: 1px solid transparent;
          padding-left: 12px;
          margin-left: -12px;
        }
        .bp-toc a:hover { color: var(--ink); }
        .bp-toc a.bp-toc-active {
          color: var(--accent);
          border-left-color: var(--accent);
        }

        /* Aside rail */
        .bp-rail {
          grid-area: aside;
          position: sticky;
          top: 100px;
          align-self: start;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .bp-rail-card {
          background: var(--surface);
          border: 1px solid var(--glow);
          border-radius: 20px;
          padding: 22px;
        }
        .bp-rail-card h5 {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 19px;
          line-height: 1.2;
          margin: 0 0 8px;
          color: var(--ink);
          font-weight: 400;
        }
        .bp-rail-card p {
          font-size: 13px;
          line-height: 1.55;
          color: var(--muted);
          margin: 0 0 16px;
        }
        .bp-rail-card .bp-btn {
          width: 100%;
          justify-content: center;
          padding: 10px;
          font-size: 13px;
        }
        .bp-rail-share { display: flex; flex-direction: column; gap: 4px; }
        .bp-rail-label {
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--muted);
          margin-bottom: 8px;
        }
        .bp-rail-share a {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 4px;
          font-size: 13px;
          color: var(--ink);
          text-decoration: none;
          opacity: 0.75;
          transition: opacity 160ms var(--ease-out);
        }
        .bp-rail-share a:hover { opacity: 1; }

        /* Buttons (scoped to blog template) */
        .bp-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 11px 20px;
          border-radius: 999px;
          font-family: inherit;
          font-size: 14px;
          font-weight: 600;
          border: none;
          cursor: pointer;
          letter-spacing: 0.01em;
          transition: transform 160ms var(--ease-out);
          text-decoration: none;
        }
        .bp-btn:hover { transform: translateY(-1px); }
        .bp-btn-primary { background: var(--ink); color: var(--surface); }

        /* Article body, editorial typography */
        .bp-body {
          grid-area: body;
          width: 100%;
          max-width: var(--measure);
          color: var(--ink);
          font-size: 18px;
          line-height: 1.7;
        }
        .bp-body > * + * { margin-top: 1.4em; }
        .bp-body p { margin: 0; text-wrap: pretty; }
        .bp-body > p:first-child,
        .bp-body p.lede {
          font-size: 22px;
          line-height: 1.45;
          color: var(--ink);
          font-weight: 400;
        }
        .bp-body > p:first-child::first-letter,
        .bp-body p.lede::first-letter {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 56px;
          float: left;
          line-height: 0.85;
          padding: 8px 10px 0 0;
          color: var(--accent);
        }
        .bp-body h2 {
          font-family: var(--font-display);
          font-style: italic;
          font-size: clamp(28px, 3.4vw, 36px);
          line-height: 1.15;
          margin: 2.4em 0 0.6em;
          color: var(--ink);
          letter-spacing: -0.01em;
          text-wrap: balance;
          font-weight: 400;
          scroll-margin-top: 112px;
        }
        .bp-body h3 {
          font-family: var(--font-body);
          font-size: 22px;
          font-weight: 600;
          line-height: 1.3;
          margin: 2em 0 0.4em;
          color: var(--ink);
          letter-spacing: -0.005em;
          scroll-margin-top: 112px;
        }
        .bp-body h2 + p,
        .bp-body h3 + p { margin-top: 0.6em; }
        .bp-body a {
          color: var(--accent);
          text-decoration: none;
          border-bottom: 1px solid color-mix(in oklab, var(--accent) 40%, transparent);
          padding-bottom: 1px;
          transition: border-bottom-color 160ms var(--ease-out);
        }
        .bp-body a:hover { border-bottom-color: var(--accent); }
        .bp-body strong { color: var(--ink); font-weight: 600; }
        .bp-body em {
          font-family: var(--font-display);
          font-style: italic;
          color: var(--accent);
          font-weight: 400;
        }
        .bp-body ul,
        .bp-body ol {
          padding-left: 22px;
          margin: 1.2em 0;
        }
        .bp-body ul li,
        .bp-body ol li {
          margin: 0.5em 0;
          padding-left: 8px;
        }
        .bp-body ul li::marker { color: var(--accent); }
        .bp-body ol { padding-left: 28px; }
        .bp-body ol li::marker {
          color: var(--accent);
          font-family: var(--font-display);
          font-style: italic;
        }
        .bp-body blockquote {
          margin: 2em -24px;
          padding: 28px 36px;
          background: var(--surface);
          border-left: 3px solid var(--accent);
          border-radius: 0 18px 18px 0;
          font-family: var(--font-display);
          font-style: italic;
          font-size: 24px;
          line-height: 1.35;
          color: var(--ink);
          text-wrap: balance;
        }
        .bp-body blockquote em { color: var(--accent); }
        .bp-body blockquote cite {
          display: block;
          margin-top: 14px;
          font-family: var(--font-body);
          font-style: normal;
          font-size: 13px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .bp-body hr {
          border: none;
          border-top: 1px solid var(--hairline);
          margin: 3em auto;
          width: 60px;
        }
        .bp-body code {
          font-family: ui-monospace, "SF Mono", monospace;
          font-size: 0.88em;
          background: var(--surface);
          border: 1px solid var(--hairline);
          padding: 2px 6px;
          border-radius: 6px;
          color: var(--accent);
        }
        .bp-body pre {
          overflow-x: auto;
          padding: 18px 20px;
          border-radius: 16px;
          background: var(--ink);
          color: var(--bg);
          font-family: ui-monospace, "SF Mono", monospace;
          font-size: 0.86rem;
          line-height: 1.6;
          margin: 2em -24px;
        }
        .bp-body pre code {
          background: transparent;
          border: none;
          color: inherit;
          padding: 0;
        }
        .bp-body figure {
          margin: 2.4em -24px;
        }
        .bp-body figure img {
          width: 100%;
          aspect-ratio: 16/9;
          border-radius: 18px;
          border: 1px solid var(--glow);
          object-fit: cover;
        }
        .bp-body figcaption {
          margin-top: 12px;
          font-family: ui-monospace, "SF Mono", monospace;
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 0.03em;
          text-align: center;
          padding: 0 16px;
        }
        /* Heading autolinks added by rehype-autolink-headings, keep them invisible. */
        .bp-body h2 a,
        .bp-body h3 a {
          border-bottom: none;
          color: inherit;
        }

        /* Optional editorial inline blocks (programmatic) */
        .bp-body .callout {
          margin: 2em -8px;
          padding: 22px 26px;
          background: var(--surface);
          border: 1px solid var(--glow);
          border-radius: 18px;
          display: grid;
          grid-template-columns: 28px 1fr;
          gap: 18px;
          align-items: flex-start;
        }
        .bp-body .callout .ic { color: var(--accent); margin-top: 2px; }
        .bp-body .callout .lab {
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--accent);
          font-weight: 500;
          margin-bottom: 6px;
        }
        .bp-body .callout p { margin: 0; font-size: 16px; line-height: 1.6; }
        .bp-body .callout p + p { margin-top: 10px; }
        .bp-body .stat {
          margin: 2.4em -24px;
          padding: 28px 32px;
          text-align: center;
          border-top: 1px solid var(--hairline);
          border-bottom: 1px solid var(--hairline);
        }
        .bp-body .stat .num {
          font-family: var(--font-body);
          font-size: 64px;
          line-height: 1;
          color: var(--ink);
          letter-spacing: -0.03em;
        }
        .bp-body .stat .lbl {
          margin-top: 10px;
          font-size: 13px;
          color: var(--muted);
          max-width: 360px;
          margin-left: auto;
          margin-right: auto;
          line-height: 1.5;
        }
        .bp-body .inline-cta {
          margin: 3em -24px;
          padding: 32px 36px;
          background: linear-gradient(160deg, var(--surface), var(--bg));
          border: 1px solid var(--glow);
          border-radius: 22px;
          text-align: center;
          position: relative;
          overflow: hidden;
        }
        .bp-body .inline-cta::before {
          content: "";
          position: absolute;
          top: -40px;
          right: -40px;
          width: 180px;
          height: 180px;
          background: radial-gradient(circle, var(--glow) 0%, transparent 65%);
          pointer-events: none;
        }
        .bp-body .inline-cta h4 {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 28px;
          line-height: 1.2;
          margin: 0 0 8px;
          position: relative;
          font-weight: 400;
        }
        .bp-body .inline-cta p {
          color: var(--muted);
          font-size: 15px;
          margin: 0 0 18px;
          position: relative;
        }

        /* Post foot */
        .bp-foot {
          grid-area: foot;
          max-width: var(--measure);
          width: 100%;
          margin: 48px auto 0;
          padding-top: 32px;
          border-top: 1px solid var(--hairline);
        }
        .bp-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 32px;
        }
        .bp-tag {
          font-size: 11px;
          color: var(--accent);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 5px 12px;
          background: var(--surface);
          border: 1px solid var(--glow);
          border-radius: 999px;
        }
        .bp-author {
          background: var(--surface);
          border: 1px solid var(--glow);
          border-radius: 22px;
          padding: 32px;
          display: grid;
          grid-template-columns: 80px 1fr;
          gap: 24px;
          align-items: start;
        }
        .bp-av-lg {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--accent2), var(--glow));
        }
        .bp-author-lab {
          font-size: 11px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--muted);
          margin-bottom: 6px;
        }
        .bp-author h4 {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 24px;
          margin: 0 0 8px;
          color: var(--ink);
          font-weight: 400;
        }
        .bp-author p {
          font-size: 14px;
          color: var(--muted);
          line-height: 1.55;
          margin: 0;
        }

        .bp-sources {
          margin-top: 40px;
          padding-top: 24px;
          border-top: 1px solid var(--hairline);
        }
        .bp-sources h3 {
          margin: 0 0 16px;
          font-family: ui-monospace, "SF Mono", monospace;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .bp-sources ol {
          margin: 0;
          padding-left: 22px;
          list-style: decimal;
          color: var(--muted);
        }
        .bp-sources li { margin: 6px 0; font-size: 13px; }
        .bp-sources a {
          color: var(--ink);
          text-decoration: none;
          border-bottom: 1px solid var(--hairline);
        }
        .bp-sources a:hover { border-bottom-color: var(--accent); color: var(--accent); }

        /* Related posts */
        .bp-related {
          max-width: 1240px;
          margin: 80px auto 0;
          padding: 0 32px;
        }
        .bp-related-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 28px;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--hairline);
        }
        .bp-related-head h3 {
          font-family: var(--font-display);
          font-style: italic;
          font-size: clamp(28px, 3vw, 36px);
          margin: 0;
          color: var(--ink);
          letter-spacing: -0.01em;
          font-weight: 400;
        }
        .bp-related-head a {
          font-size: 13px;
          color: var(--accent);
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .bp-related-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 24px;
        }
        .bp-rel-card {
          text-decoration: none;
          color: inherit;
          display: flex;
          flex-direction: column;
        }
        .bp-rel-thumb {
          aspect-ratio: 4/3;
          border-radius: 18px;
          border: 1px solid var(--glow);
          background: linear-gradient(160deg, var(--surface), var(--bg));
          margin-bottom: 16px;
          position: relative;
          overflow: hidden;
          transition: transform 200ms var(--ease-out);
        }
        .bp-rel-thumb::before {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse 60% 60% at 30% 40%, color-mix(in oklab, var(--accent) 12%, transparent), transparent 70%);
        }
        .bp-rel-card:hover .bp-rel-thumb { transform: translateY(-2px); }
        .bp-rel-cat {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 13px;
          color: var(--accent);
          margin-bottom: 6px;
        }
        .bp-rel-title {
          font-family: var(--font-body);
          font-size: 20px;
          line-height: 1.25;
          color: var(--ink);
          margin: 0 0 10px;
          letter-spacing: -0.005em;
          font-weight: 500;
        }
        .bp-rel-meta {
          margin-top: auto;
          font-size: 12px;
          color: var(--muted);
          letter-spacing: 0.025em;
        }

        /* Newsletter band */
        .bp-nl {
          max-width: 1240px;
          margin: 96px auto 0;
          padding: 64px 56px;
          background: linear-gradient(160deg, var(--surface), var(--bg));
          border: 1px solid var(--glow);
          border-radius: 32px;
          text-align: center;
          position: relative;
          overflow: hidden;
        }
        .bp-nl::before {
          content: "";
          position: absolute;
          top: -180px;
          left: 50%;
          transform: translateX(-50%);
          width: 540px;
          height: 540px;
          background: radial-gradient(circle, var(--glow) 0%, transparent 60%);
          pointer-events: none;
        }
        .bp-nl-inner {
          position: relative;
          max-width: 560px;
          margin: 0 auto;
        }
        .bp-nl h3 {
          font-family: var(--font-display);
          font-style: italic;
          font-size: clamp(30px, 3.6vw, 48px);
          line-height: 1.05;
          margin: 0 0 12px;
          letter-spacing: -0.01em;
          text-wrap: balance;
          font-weight: 400;
        }
        .bp-nl p {
          color: var(--muted);
          font-size: 16px;
          margin: 0 0 28px;
        }
        .bp-nl-form {
          display: flex;
          align-items: center;
          background: var(--surface);
          border: 1px solid var(--glow);
          border-radius: 999px;
          padding: 5px 5px 5px 22px;
          max-width: 440px;
          margin: 0 auto;
        }
        .bp-nl-form input {
          flex: 1;
          border: none;
          outline: none;
          background: transparent;
          font-family: inherit;
          font-size: 15px;
          color: var(--ink);
          padding: 12px 8px;
        }
        .bp-nl-form input::placeholder { color: var(--muted); opacity: 0.7; }
        .bp-nl-foot {
          margin-top: 24px;
          font-size: 12px;
          color: var(--muted);
        }
        .bp-nl-foot a {
          color: var(--accent);
          text-decoration: none;
          border-bottom: 1px solid color-mix(in oklab, var(--accent) 35%, transparent);
        }

        /* Responsive, collapse 3-col → 1-col */
        @media (max-width: 1100px) {
          .bp-post {
            grid-template-columns: minmax(0, var(--measure));
            grid-template-areas:
              "breadcrumb"
              "header"
              "hero"
              "body"
              "foot";
            column-gap: 0;
          }
          .bp-toc, .bp-rail { display: none; }
        }
        @media (max-width: 760px) {
          .bp-post { padding: 32px 20px; }
          .bp-body { font-size: 17px; }
          .bp-body blockquote,
          .bp-body figure,
          .bp-body pre,
          .bp-body .inline-cta,
          .bp-body .stat {
            margin-left: 0;
            margin-right: 0;
          }
          .bp-related-grid { grid-template-columns: 1fr; }
          .bp-nl { padding: 48px 24px; border-radius: 24px; }
          .bp-related { padding: 0 20px; }
          .bp-actions { margin-left: 0; width: 100%; }
          .bp-author { grid-template-columns: 60px 1fr; padding: 24px; }
          .bp-av-lg { width: 60px; height: 60px; }
        }
      `}</style>
    </>
  );
}
