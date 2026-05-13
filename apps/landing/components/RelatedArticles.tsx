import Link from "next/link";
import { getContentUrl, getRelatedContent, getTypeLabel } from "@/lib/content";

export default function RelatedArticles({ slugs }: { slugs: string[] }) {
  const related = getRelatedContent(slugs, 3);

  if (related.length === 0) return null;

  return (
    <section className="mt-12 border-t border-white/8 pt-8">
      <div className="page-kicker">Keep Reading</div>
      <h2 className="text-2xl font-bold tracking-tight">Related articles</h2>
      <div className="content-grid columns-3">
        {related.map((item) => (
          <Link key={item.meta.slug} href={getContentUrl(item.meta)} className="content-card">
            <div className="content-card-meta">{getTypeLabel(item.meta.type)}</div>
            <h3 className="content-card-title">{item.meta.title}</h3>
            <p className="content-card-description">{item.meta.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
