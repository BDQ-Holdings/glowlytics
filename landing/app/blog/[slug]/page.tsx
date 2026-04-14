import { notFound } from "next/navigation";
import { getContentBySlug, getAllSlugs } from "@/lib/content";
import { renderMdx } from "@/lib/mdx";
import ArticleLayout from "@/components/ArticleLayout";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string }>;
}

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

  return <ArticleLayout meta={item.meta}>{content}</ArticleLayout>;
}
