import Link from "next/link";
import { getAllContent } from "@/lib/content";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog",
  description: "Evidence-based skin health articles grounded in dermatology research.",
};

export default function BlogIndex() {
  const posts = getAllContent("blog", "approved");

  return (
    <div className="page-shell">
      <div className="page-kicker">Glowlytics Library</div>
      <h1 className="page-title">Skin health articles built for real questions.</h1>
      <p className="page-intro">
        Evidence-first explainers on acne, ingredients, hydration, sun damage, and the
        habits that actually move skin health in the right direction.
      </p>

      {posts.length === 0 ? (
        <p className="content-empty">No articles are approved yet.</p>
      ) : (
        <div className="content-grid columns-3">
          {posts.map((post) => (
            <Link key={post.meta.slug} href={`/blog/${post.meta.slug}`} className="content-card">
              <div className="content-card-meta">{post.meta.readingTime} min read</div>
              <h2 className="content-card-title">{post.meta.title}</h2>
              <p className="content-card-description">{post.meta.description}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
