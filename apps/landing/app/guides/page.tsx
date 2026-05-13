import Link from "next/link";
import { getAllContent } from "@/lib/content";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Guides",
  description: "Step-by-step skincare guides for tracking progress and making better routine decisions.",
};

export default function GuidesIndex() {
  const guides = getAllContent("guide", "approved");

  return (
    <div className="page-shell">
      <div className="page-kicker">Step By Step</div>
      <h1 className="page-title">Guides for building a smarter skin routine.</h1>
      <p className="page-intro">
        Clear walkthroughs for tracking acne, reading signal trends, and using Glowlytics
        alongside evidence-based skincare decisions.
      </p>

      {guides.length === 0 ? (
        <p className="content-empty">No guides are approved yet.</p>
      ) : (
        <div className="content-grid columns-2">
          {guides.map((guide) => (
            <Link
              key={guide.meta.slug}
              href={`/guides/${guide.meta.slug}`}
              className="content-card"
            >
              <div className="content-card-meta">{guide.meta.readingTime} min read</div>
              <h2 className="content-card-title">{guide.meta.title}</h2>
              <p className="content-card-description">{guide.meta.description}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
