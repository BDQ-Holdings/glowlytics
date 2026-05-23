import Link from "next/link";
import { getContentUrl, getRelatedContent, getTypeLabel } from "@/lib/content";

export default function RelatedArticles({ slugs }: { slugs: string[] }) {
  const related = getRelatedContent(slugs, 3);

  if (related.length === 0) return null;

  return (
    <section className="related-articles">
      <div className="page-kicker">Keep reading</div>
      <h2 className="related-articles-title">Related, quietly chosen.</h2>
      <div className="content-grid columns-3">
        {related.map((item) => (
          <Link key={item.meta.slug} href={getContentUrl(item.meta)} className="content-card">
            <div className="content-card-meta">{getTypeLabel(item.meta.type)}</div>
            <h3 className="content-card-title">{item.meta.title}</h3>
            <p className="content-card-description">{item.meta.description}</p>
          </Link>
        ))}
      </div>

      <style>{`
        .related-articles {
          margin-top: 80px;
          padding-top: 56px;
          border-top: 1px solid var(--hairline);
        }
        .related-articles-title {
          margin: 12px 0 0;
          font-family: var(--font-display);
          font-style: italic;
          font-size: clamp(1.7rem, 3vw, 2.2rem);
          line-height: 1.1;
          letter-spacing: -0.01em;
          color: var(--ink);
          font-weight: 400;
        }
        .related-articles .content-grid {
          margin-top: 32px;
        }
      `}</style>
    </section>
  );
}
