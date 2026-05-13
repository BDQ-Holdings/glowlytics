import fs from "fs";
import path from "path";
import matter from "gray-matter";
import type {
  ContentItem,
  ContentMeta,
  ContentType,
  ContentStatus,
  FAQItem,
  HowToStep,
  MarkdownHeading,
} from "./types";

const CONTENT_DIR = path.join(process.cwd(), "content");
const TYPE_LABELS: Record<ContentType, string> = {
  blog: "Blog",
  faq: "FAQ",
  guide: "Guides",
  glossary: "Glossary",
};
const TYPE_PATHS: Record<ContentType, string> = {
  blog: "blog",
  faq: "faq",
  guide: "guides",
  glossary: "glossary",
};

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
  return getContentBySlugWithStatus(type, slug, "approved");
}

export function getContentBySlugWithStatus(
  type: ContentType,
  slug: string,
  status: ContentStatus | "any"
): ContentItem | null {
  const dir = path.join(CONTENT_DIR, getDirName(type));
  const filePath = path.join(dir, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return null;
  const item = readMdxFile(filePath);
  if (!item) return null;
  if (status !== "any" && item.meta.status !== status) return null;
  return item;
}

export function getAllSlugs(type: ContentType): string[] {
  const items = getAllContent(type, "approved");
  return items.map((item) => item.meta.slug);
}

export function getRelatedContent(slugs: string[], limit: number = 3): ContentItem[] {
  if (slugs.length === 0) return [];

  const bySlug = new Map(getAllContent(undefined, "approved").map((item) => [item.meta.slug, item]));

  return slugs
    .map((slug) => bySlug.get(slug))
    .filter((item): item is ContentItem => Boolean(item))
    .slice(0, limit);
}

export function getTypeLabel(type: ContentType): string {
  return TYPE_LABELS[type];
}

export function getTypePath(type: ContentType): string {
  return TYPE_PATHS[type];
}

export function getTypeFromPath(pathSegment: string): ContentType | null {
  for (const [type, segment] of Object.entries(TYPE_PATHS) as [ContentType, string][]) {
    if (segment === pathSegment) return type;
  }

  return null;
}

export function getContentUrl(meta: ContentMeta): string {
  return `/${getTypePath(meta.type)}/${meta.slug}`;
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[\u2019']/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function extractHeadings(source: string): MarkdownHeading[] {
  return source
    .split("\n")
    .map((line) => line.trim())
    .map((line) => {
      const match = line.match(/^(##|###)\s+(.+)$/);
      if (!match) return null;

      const level = match[1] === "##" ? 2 : 3;
      const text = match[2].trim();
      if (!text) return null;

      return {
        level: level as 2 | 3,
        text,
        id: slugifyHeading(text),
      };
    })
    .filter((heading): heading is MarkdownHeading => Boolean(heading));
}

export function extractFaqItems(source: string): FAQItem[] {
  const lines = source.split("\n");
  const items: FAQItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("## ")) continue;

    const question = line.slice(3).trim();
    if (!question) continue;

    const body: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j];
      if (/^##\s+/.test(next.trim())) break;
      if (next.trim()) body.push(next.trim());
    }

    if (body.length > 0) {
      items.push({
        question,
        answer: body.join(" ").replace(/\s+/g, " "),
      });
    }
  }

  return items;
}

export function extractHowToSteps(source: string): HowToStep[] {
  const steps = extractHeadings(source)
    .filter((heading) => heading.level === 2)
    .filter((heading) => /^step\b/i.test(heading.text));

  if (steps.length === 0) return [];

  const lines = source.split("\n");

  return steps.map((step) => {
    const stepLine = `## ${step.text}`;
    const startIndex = lines.findIndex((line) => line.trim() === stepLine);
    const body: string[] = [];

    for (let i = startIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (/^##\s+/.test(line)) break;
      if (line) body.push(line);
    }

    return {
      name: step.text,
      text: body.join(" ").replace(/\s+/g, " "),
    };
  });
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
