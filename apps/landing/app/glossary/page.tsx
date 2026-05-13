import Link from "next/link";
import { getAllContent } from "@/lib/content";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Glossary",
  description: "Plain-language definitions for common skin health terms and ingredient concepts.",
};

export default function GlossaryIndex() {
  const entries = [...getAllContent("glossary", "approved")].sort((a, b) =>
    a.meta.title.localeCompare(b.meta.title)
  );

  const grouped = entries.reduce<Record<string, typeof entries>>((acc, entry) => {
    const letter = entry.meta.title.charAt(0).toUpperCase();
    if (!acc[letter]) acc[letter] = [];
    acc[letter].push(entry);
    return acc;
  }, {});

  return (
    <div className="page-shell">
      <div className="page-kicker">Skin Terms</div>
      <h1 className="page-title">A plain-language glossary for skincare and skin science.</h1>
      <p className="page-intro">
        Quick definitions for the terms, ingredients, and skin concepts that show up across
        Glowlytics reports and evidence-based skincare conversations.
      </p>

      {entries.length === 0 ? (
        <p className="content-empty">No glossary entries are approved yet.</p>
      ) : (
        <div className="glossary-groups">
          {Object.entries(grouped).map(([letter, items]) => (
            <section key={letter} className="glossary-group">
              <h2 className="glossary-letter">{letter}</h2>
              <div className="content-grid columns-2">
                {items.map((item) => (
                  <Link
                    key={item.meta.slug}
                    href={`/glossary/${item.meta.slug}`}
                    className="content-card"
                  >
                    <div className="content-card-meta">Glossary</div>
                    <h3 className="content-card-title">{item.meta.title}</h3>
                    <p className="content-card-description">{item.meta.description}</p>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
