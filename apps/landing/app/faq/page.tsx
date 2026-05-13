import Link from "next/link";
import { getAllContent } from "@/lib/content";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Short answers to common questions about Glowlytics, skin tracking, and skincare topics.",
};

export default function FAQIndex() {
  const faqs = getAllContent("faq", "approved");

  return (
    <div className="page-shell">
      <div className="page-kicker">Frequently Asked</div>
      <h1 className="page-title">Fast answers for common skin tracking questions.</h1>
      <p className="page-intro">
        Practical explanations of what Glowlytics does, what the signals mean, and where
        app-based tracking fits relative to professional care.
      </p>

      {faqs.length === 0 ? (
        <p className="content-empty">No FAQs are approved yet.</p>
      ) : (
        <div className="content-grid">
          {faqs.map((faq) => (
            <Link key={faq.meta.slug} href={`/faq/${faq.meta.slug}`} className="content-card">
              <div className="content-card-meta">FAQ</div>
              <h2 className="content-card-title">{faq.meta.title}</h2>
              <p className="content-card-description">{faq.meta.description}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
