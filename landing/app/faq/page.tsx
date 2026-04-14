import Link from "next/link";
import { getAllContent } from "@/lib/content";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Frequently asked questions about skin health, skincare ingredients, and routines.",
};

export default function FAQIndex() {
  const faqs = getAllContent("faq", "approved");

  return (
    <div className="max-w-[1000px] mx-auto px-6 py-12">
      <h1 className="text-3xl font-display font-bold mb-2">FAQ</h1>
      <p className="text-white/50 mb-10">Answers to common skin health questions.</p>
      {faqs.length === 0 ? (
        <p className="text-white/30">No FAQs yet. Check back soon.</p>
      ) : (
        <div className="grid gap-4">
          {faqs.map((faq) => (
            <Link
              key={faq.meta.slug}
              href={`/faq/${faq.meta.slug}`}
              className="p-5 rounded-xl bg-bg-card border border-white/5 hover:border-teal/20 transition-colors"
            >
              <h2 className="text-base font-semibold">{faq.meta.title}</h2>
              <p className="text-sm text-white/40 mt-1">{faq.meta.description}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
