export type ContentType = "blog" | "faq" | "guide" | "glossary";

export type ContentStatus = "draft" | "approved" | "rejected";

export type SchemaType = "Article" | "FAQPage" | "HowTo";

export interface ContentSource {
  title: string;
  url: string;
}

export interface ContentMeta {
  title: string;
  slug: string;
  description: string;
  type: ContentType;
  status: ContentStatus;
  keywords: string[];
  dateGenerated: string;
  dateModified?: string;
  sources: ContentSource[];
  readingTime: number;
  schema: SchemaType;
  relatedSlugs: string[];
}

export interface ContentItem {
  meta: ContentMeta;
  content: string;
  filePath: string;
}
