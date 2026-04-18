import Breadcrumbs from "./Breadcrumbs";
import ArticleSchema from "./ArticleSchema";
import RelatedArticles from "./RelatedArticles";
import CTABanner from "./CTABanner";
import type { ContentMeta } from "@/lib/types";

const SIGNAL_MAP: Record<string, string> = {
  acne: "inflammation",
  redness: "inflammation",
  rosacea: "inflammation",
  wrinkles: "elasticity",
  "anti-aging": "elasticity",
  collagen: "elasticity",
  hydration: "hydration",
  "dry skin": "hydration",
  moisturizer: "hydration",
  "sun damage": "sun damage",
  sunscreen: "sun damage",
  spf: "sun damage",
  pores: "structure",
  texture: "structure",
};

function matchSignal(keywords: string[]): string | undefined {
  for (const kw of keywords) {
    const lower = kw.toLowerCase();
    for (const [term, signal] of Object.entries(SIGNAL_MAP)) {
      if (lower.includes(term)) return signal;
    }
  }
  return undefined;
}

export default function ArticleLayout({
  meta,
  children,
}: {
  meta: ContentMeta;
  children: React.ReactNode;
}) {
  const signal = matchSignal(meta.keywords);

  return (
    <article className="max-w-[720px] mx-auto px-6 py-12">
      <Breadcrumbs type={meta.type} title={meta.title} />
      <ArticleSchema meta={meta} />

      <header className="mb-8">
        <span className="text-xs font-semibold text-teal/70 uppercase tracking-wider">
          {meta.type}
        </span>
        <h1 className="text-3xl md:text-4xl font-display font-bold mt-2 leading-tight">
          {meta.title}
        </h1>
        <div className="flex items-center gap-4 mt-4 text-sm text-white/40">
          <time>{meta.dateModified || meta.dateGenerated}</time>
          <span>{meta.readingTime} min read</span>
        </div>
      </header>

      <div className="prose prose-invert prose-teal max-w-none">{children}</div>

      {meta.sources.length > 0 && (
        <section className="mt-12 pt-6 border-t border-white/10">
          <h2 className="text-lg font-display font-bold mb-3">Sources</h2>
          <ol className="list-decimal list-inside text-sm text-white/50 space-y-1">
            {meta.sources.map((source, i) => (
              <li key={i}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal/70 hover:text-teal underline"
                >
                  {source.title}
                </a>
              </li>
            ))}
          </ol>
        </section>
      )}

      <CTABanner signal={signal} />
      <RelatedArticles slugs={meta.relatedSlugs} />
    </article>
  );
}
