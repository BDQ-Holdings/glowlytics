import Link from "next/link";
import { getAllContent } from "@/lib/content";

export default function RelatedArticles({ slugs }: { slugs: string[] }) {
  if (slugs.length === 0) return null;

  const allContent = getAllContent(undefined, "approved");
  const related = slugs
    .map((slug) => allContent.find((item) => item.meta.slug === slug))
    .filter(Boolean)
    .slice(0, 3);

  if (related.length === 0) return null;

  return (
    <section className="mt-16 pt-8 border-t border-white/10">
      <h2 className="text-xl font-display font-bold mb-6">Related Articles</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {related.map((item) => {
          const meta = item!.meta;
          const basePath = meta.type === "guide" ? "guides" : meta.type;
          return (
            <Link
              key={meta.slug}
              href={`/${basePath}/${meta.slug}`}
              className="p-4 rounded-xl bg-bg-card border border-white/5 hover:border-teal/20 transition-colors"
            >
              <span className="text-xs font-medium text-teal/70 uppercase tracking-wider">
                {meta.type}
              </span>
              <h3 className="text-sm font-semibold mt-1 text-white/90">{meta.title}</h3>
              <p className="text-xs text-white/40 mt-2 line-clamp-2">{meta.description}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
