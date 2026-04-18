import Link from "next/link";
import { getAllContent } from "@/lib/content";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog",
  description: "Evidence-based skin health articles backed by dermatology research.",
};

export default function BlogIndex() {
  const posts = getAllContent("blog", "approved");

  return (
    <div className="max-w-[1000px] mx-auto px-6 py-12">
      <h1 className="text-3xl font-display font-bold mb-2">Blog</h1>
      <p className="text-white/50 mb-10">Evidence-based skin health insights.</p>
      {posts.length === 0 ? (
        <p className="text-white/30">No articles yet. Check back soon.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <Link
              key={post.meta.slug}
              href={`/blog/${post.meta.slug}`}
              className="p-5 rounded-2xl bg-bg-card border border-white/5 hover:border-teal/20 transition-colors"
            >
              <span className="text-xs text-teal/60 font-medium">{post.meta.readingTime} min read</span>
              <h2 className="text-lg font-semibold mt-2 leading-snug">{post.meta.title}</h2>
              <p className="text-sm text-white/40 mt-2 line-clamp-3">{post.meta.description}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
