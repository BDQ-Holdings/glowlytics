import type { ContentMeta } from "@/lib/types";
import { safeJsonLd } from "@/lib/jsonld";

export default function ArticleSchema({ meta }: { meta: ContentMeta }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: meta.title,
    description: meta.description,
    datePublished: meta.dateGenerated,
    dateModified: meta.dateModified || meta.dateGenerated,
    author: {
      "@type": "Organization",
      name: "Glowlytics",
      url: "https://glowlytics.ai",
    },
    publisher: {
      "@type": "Organization",
      name: "Glowlytics",
      logo: {
        "@type": "ImageObject",
        url: "https://glowlytics.ai/logo-full.png",
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://glowlytics.ai/${meta.type === "guide" ? "guides" : meta.type}/${meta.slug}`,
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLd(schema) }}
    />
  );
}
