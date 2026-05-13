import { notFound } from "next/navigation";
import { getContentBySlug, getAllSlugs } from "@/lib/content";
import { renderMdx } from "@/lib/mdx";
import ArticleLayout from "@/components/ArticleLayout";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams() {
  return getAllSlugs("guide").map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const item = getContentBySlug("guide", slug);
  if (!item) return {};
  return {
    title: item.meta.title,
    description: item.meta.description,
    openGraph: { title: item.meta.title, description: item.meta.description, type: "article" },
  };
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params;
  const item = getContentBySlug("guide", slug);
  if (!item) notFound();
  const content = await renderMdx(item.content);
  return (
    <ArticleLayout meta={item.meta} markdown={item.content}>
      {content}
    </ArticleLayout>
  );
}
