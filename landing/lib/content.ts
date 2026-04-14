import fs from "fs";
import path from "path";
import matter from "gray-matter";
import type { ContentItem, ContentMeta, ContentType, ContentStatus } from "./types";

const CONTENT_DIR = path.join(process.cwd(), "content");

function readMdxFile(filePath: string): ContentItem | null {
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);
  const meta = data as ContentMeta;

  if (!meta.title || !meta.slug || !meta.type) {
    return null;
  }

  return { meta, content, filePath };
}

export function getAllContent(type?: ContentType, status?: ContentStatus): ContentItem[] {
  const types: ContentType[] = type ? [type] : ["blog", "faq", "guide", "glossary"];
  const items: ContentItem[] = [];

  for (const t of types) {
    const actualDir = path.join(CONTENT_DIR, getDirName(t));
    if (!fs.existsSync(actualDir)) continue;

    const files = fs.readdirSync(actualDir).filter((f) => f.endsWith(".mdx"));
    for (const file of files) {
      const item = readMdxFile(path.join(actualDir, file));
      if (item && (!status || item.meta.status === status)) {
        items.push(item);
      }
    }
  }

  return items.sort(
    (a, b) => new Date(b.meta.dateGenerated).getTime() - new Date(a.meta.dateGenerated).getTime()
  );
}

export function getContentBySlug(type: ContentType, slug: string): ContentItem | null {
  const dir = path.join(CONTENT_DIR, getDirName(type));
  const filePath = path.join(dir, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return null;
  const item = readMdxFile(filePath);
  if (!item || item.meta.status !== "approved") return null;
  return item;
}

export function getAllSlugs(type: ContentType): string[] {
  const items = getAllContent(type, "approved");
  return items.map((item) => item.meta.slug);
}

function getDirName(type: ContentType): string {
  switch (type) {
    case "blog":
      return "blog";
    case "faq":
      return "faq";
    case "guide":
      return "guides";
    case "glossary":
      return "glossary";
  }
}
