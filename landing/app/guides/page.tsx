import Link from "next/link";
import { getAllContent } from "@/lib/content";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Skincare Guides",
  description: "Step-by-step skincare guides for every skin type and concern.",
};

export default function GuidesIndex() {
  const guides = getAllContent("guide", "approved");

  return (
    <div className="max-w-[1000px] mx-auto px-6 py-12">
      <h1 className="text-3xl font-display font-bold mb-2">Guides</h1>
      <p className="text-white/50 mb-10">Step-by-step skincare guides backed by science.</p>
      {guides.length === 0 ? (
        <p className="text-white/30">No guides yet. Check back soon.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {guides.map((guide) => (
            <Link
              key={guide.meta.slug}
              href={`/guides/${guide.meta.slug}`}
              className="p-5 rounded-2xl bg-bg-card border border-white/5 hover:border-teal/20 transition-colors"
            >
              <span className="text-xs text-teal/60 font-medium">{guide.meta.readingTime} min read</span>
              <h2 className="text-lg font-semibold mt-2 leading-snug">{guide.meta.title}</h2>
              <p className="text-sm text-white/40 mt-2 line-clamp-3">{guide.meta.description}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
