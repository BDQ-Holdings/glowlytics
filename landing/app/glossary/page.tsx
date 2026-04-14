import Link from "next/link";
import { getAllContent } from "@/lib/content";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Skin Health Glossary",
  description: "Definitions and explanations of common skin health terms, ingredients, and conditions.",
};

export default function GlossaryIndex() {
  const entries = getAllContent("glossary", "approved");
  const sorted = entries.sort((a, b) => a.meta.title.localeCompare(b.meta.title));

  const grouped: Record<string, typeof entries> = {};
  for (const entry of sorted) {
    const letter = entry.meta.title[0].toUpperCase();
    if (!grouped[letter]) grouped[letter] = [];
    grouped[letter].push(entry);
  }

  return (
    <div className="max-w-[1000px] mx-auto px-6 py-12">
      <h1 className="text-3xl font-display font-bold mb-2">Glossary</h1>
      <p className="text-white/50 mb-10">Skin health terms explained simply.</p>
      {sorted.length === 0 ? (
        <p className="text-white/30">No entries yet. Check back soon.</p>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([letter, items]) => (
            <div key={letter}>
              <h2 className="text-xl font-display font-bold text-teal/70 mb-3">{letter}</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {items.map((item) => (
                  <Link
                    key={item.meta.slug}
                    href={`/glossary/${item.meta.slug}`}
                    className="p-4 rounded-xl bg-bg-card border border-white/5 hover:border-teal/20 transition-colors"
                  >
                    <h3 className="text-sm font-semibold">{item.meta.title}</h3>
                    <p className="text-xs text-white/40 mt-1 line-clamp-2">{item.meta.description}</p>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
