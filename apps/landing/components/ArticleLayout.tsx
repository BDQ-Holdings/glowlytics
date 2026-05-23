import ArticleSchema from "./ArticleSchema";
import Breadcrumbs from "./Breadcrumbs";
import CTABanner from "./CTABanner";
import FAQSchema from "./FAQSchema";
import HowToSchema from "./HowToSchema";
import RelatedArticles from "./RelatedArticles";
import {
  extractFaqItems,
  extractHeadings,
  extractHowToSteps,
  getTypeLabel,
} from "@/lib/content";
import type { ContentMeta } from "@/lib/types";

const SIGNAL_MAP: Record<string, string> = {
  acne: "inflammation",
  redness: "inflammation",
  rosacea: "inflammation",
  wrinkles: "elasticity",
  aging: "elasticity",
  collagen: "elasticity",
  hydration: "hydration",
  "dry skin": "hydration",
  moisturizer: "hydration",
  "sun damage": "sun damage",
  sunscreen: "sun damage",
  spf: "sun damage",
  pores: "structure",
  texture: "structure",
  sebum: "structure",
};

function matchSignal(keywords: string[]): string | undefined {
  for (const keyword of keywords) {
    const lower = keyword.toLowerCase();
    for (const [term, signal] of Object.entries(SIGNAL_MAP)) {
      if (lower.includes(term)) return signal;
    }
  }
  return undefined;
}

export default function ArticleLayout({
  meta,
  markdown,
  children,
}: {
  meta: ContentMeta;
  markdown: string;
  children: React.ReactNode;
}) {
  const signal = matchSignal(meta.keywords);
  const headings = extractHeadings(markdown);
  const faqItems = meta.schema === "FAQPage" ? extractFaqItems(markdown) : [];
  const howToSteps = meta.schema === "HowTo" ? extractHowToSteps(markdown) : [];

  return (
    <article className="article-shell">
      <Breadcrumbs type={meta.type} title={meta.title} />
      <ArticleSchema meta={meta} />
      {faqItems.length > 0 ? <FAQSchema items={faqItems} /> : null}
      {howToSteps.length > 0 ? <HowToSchema meta={meta} steps={howToSteps} /> : null}

      <div className="article-layout">
        <div className="article-main">
          <header className="article-header">
            <div className="page-kicker">{getTypeLabel(meta.type)}</div>
            <h1>{meta.title}</h1>
            <p className="article-description">{meta.description}</p>
            <div className="article-meta">
              <time dateTime={String(meta.dateModified || meta.dateGenerated)}>
                {String(meta.dateModified || meta.dateGenerated)}
              </time>
              <span>{meta.readingTime} min read</span>
              <span>{meta.sources.length} source{meta.sources.length === 1 ? "" : "s"}</span>
            </div>
          </header>

          <div className="article-prose">{children}</div>

          {meta.sources.length > 0 ? (
            <section className="article-panel" style={{ marginTop: 56 }}>
              <h2>Sources</h2>
              <ol className="article-source-list">
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

          <CTABanner signal={signal} />
          <RelatedArticles slugs={meta.relatedSlugs} />
        </div>

        <aside className="article-sidebar">
          {headings.length > 0 ? (
            <section className="article-panel">
              <h2>On this page</h2>
              <div className="article-toc-list">
                {headings.map((heading) => (
                  <a
                    key={`${heading.id}-${heading.level}`}
                    href={`#${heading.id}`}
                    className={`article-toc-link level-${heading.level}`}
                  >
                    {heading.text}
                  </a>
                ))}
              </div>
            </section>
          ) : null}

          <section className="article-panel">
            <h2>Medical note</h2>
            <p style={{ marginTop: 12, fontSize: 13, lineHeight: 1.6, color: "var(--muted)" }}>
              Glowlytics content is educational. It does not diagnose or treat skin
              conditions, and it should not replace a dermatologist.
            </p>
          </section>
        </aside>
      </div>
    </article>
  );
}
