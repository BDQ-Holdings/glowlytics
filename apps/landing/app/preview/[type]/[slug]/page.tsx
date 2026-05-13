import { notFound } from "next/navigation";
import {
  getAllContent,
  getContentBySlugWithStatus,
  getTypeFromPath,
  getTypeLabel,
  getTypePath,
} from "@/lib/content";
import { renderMdx } from "@/lib/mdx";
import ArticleLayout from "@/components/ArticleLayout";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ type: string; slug: string }>;
}

export async function generateStaticParams() {
  return getAllContent().map((item) => ({
    type: getTypePath(item.meta.type),
    slug: item.meta.slug,
  }));
}

function previewEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_CONTENT_PREVIEW === "1";
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { type, slug } = await params;
  const contentType = getTypeFromPath(type);

  if (!previewEnabled() || !contentType) {
    return {
      title: "Preview",
      robots: { index: false, follow: false },
    };
  }

  const item = getContentBySlugWithStatus(contentType, slug, "any");
  if (!item) {
    return {
      title: "Preview Not Found",
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `${item.meta.title} (Preview)`,
    description: item.meta.description,
    robots: { index: false, follow: false },
  };
}

export default async function PreviewContentPage({ params }: Props) {
  if (!previewEnabled()) notFound();

  const { type, slug } = await params;
  const contentType = getTypeFromPath(type);
  if (!contentType) notFound();

  const item = getContentBySlugWithStatus(contentType, slug, "any");
  if (!item) notFound();

  const content = await renderMdx(item.content);

  return (
    <>
      <section className="mx-auto max-w-6xl px-6 pt-8">
        <div className="rounded-2xl border border-amber-300/30 bg-amber-400/10 px-5 py-4 text-sm text-amber-50">
          <strong>{statusLabel(item.meta.status)} preview.</strong>{" "}
          This page is rendering through the real site layout, but it is not part of the public
          content index.
          <span className="ml-2 text-amber-100/70">
            {getTypeLabel(item.meta.type)} / {item.meta.slug}
          </span>
        </div>
      </section>

      <ArticleLayout meta={item.meta} markdown={item.content}>
        {content}
      </ArticleLayout>
    </>
  );
}
