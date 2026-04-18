import type { MetadataRoute } from "next";
import { getAllContent } from "@/lib/content";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://glowlytics.ai";
  const approved = getAllContent(undefined, "approved");

  const contentPages = approved.map((item) => {
    const basePath = item.meta.type === "guide" ? "guides" : item.meta.type;
    return {
      url: `${baseUrl}/${basePath}/${item.meta.slug}`,
      lastModified: new Date(item.meta.dateModified || item.meta.dateGenerated),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    };
  });

  return [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "weekly", priority: 1.0 },
    { url: `${baseUrl}/blog`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/guides`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/faq`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/glossary`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${baseUrl}/terms`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    ...contentPages,
  ];
}
