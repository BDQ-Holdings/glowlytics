import { notFound } from "next/navigation";
import {
  extractHeadings,
  getAllSlugs,
  getContentBySlug,
  getContentUrl,
  getRelatedContent,
  getTypeLabel,
} from "@/lib/content";
import { renderMdx } from "@/lib/mdx";
import ArticleSchema from "@/components/ArticleSchema";
import BlogArticleLayout from "@/components/BlogArticleLayout";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams() {
  return getAllSlugs("blog").map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const item = getContentBySlug("blog", slug);
  if (!item) return {};
  return {
    title: item.meta.title,
    description: item.meta.description,
    openGraph: {
      title: item.meta.title,
      description: item.meta.description,
      type: "article",
      publishedTime: item.meta.dateGenerated,
      modifiedTime: item.meta.dateModified,
    },
  };
}

export default async function BlogPost({ params }: Props) {
  const { slug } = await params;
  const item = getContentBySlug("blog", slug);
  if (!item) notFound();

  const content = await renderMdx(item.content);
  const headings = extractHeadings(item.content);
  const related = getRelatedContent(item.meta.relatedSlugs, 3).map((entry) => ({
    slug: entry.meta.slug,
    title: entry.meta.title,
    category: getTypeLabel(entry.meta.type),
    readingTime: entry.meta.readingTime,
    href: getContentUrl(entry.meta),
  }));

  return (
    <>
      <ArticleSchema meta={item.meta} />
      <BlogArticleLayout
        meta={item.meta}
        headings={headings}
        related={related}
      >
        {content}
      </BlogArticleLayout>
    </>
  );
}
