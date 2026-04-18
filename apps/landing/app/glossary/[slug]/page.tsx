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
  return getAllSlugs("glossary").map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const item = getContentBySlug("glossary", slug);
  if (!item) return {};
  return { title: item.meta.title, description: item.meta.description };
}

export default async function GlossaryEntry({ params }: Props) {
  const { slug } = await params;
  const item = getContentBySlug("glossary", slug);
  if (!item) notFound();
  const content = await renderMdx(item.content);
  return <ArticleLayout meta={item.meta}>{content}</ArticleLayout>;
}
