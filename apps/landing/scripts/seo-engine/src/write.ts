import "./lib/env.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import readingTime from "reading-time";
import { aiExpandDraft, aiRepairDraft, aiWrite } from "./lib/ai.js";
import { checkQuality } from "./lib/quality.js";
import { filterKeywords, isAllowedKeyword } from "./lib/keyword-filter.js";
import { filterByTargetSlugs, getCurrentDateString } from "./lib/pipeline.js";
import { blogTemplate } from "./lib/templates/blog.js";
import { faqTemplate } from "./lib/templates/faq.js";
import { guideTemplate } from "./lib/templates/guide.js";
import { glossaryTemplate } from "./lib/templates/glossary.js";
import type { KeywordCluster, ResearchDossier, ContentFrontmatter, ContentType } from "./lib/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../../data");
const CONTENT_DIR = path.resolve(__dirname, "../../../content");
const KEYWORDS_PATH = path.join(DATA_DIR, "keywords.json");
const RESEARCH_DIR = path.join(DATA_DIR, "research");
const OVERWRITE_EXISTING = process.env.OVERWRITE_EXISTING === "1";
const ALLOW_LOW_QUALITY = process.env.ALLOW_LOW_QUALITY === "1";

function hasResearchDossier(slug: string): boolean {
  return fs.existsSync(path.join(RESEARCH_DIR, `${slug}.json`));
}

function getTemplate(type: ContentType, dossier: ResearchDossier): string {
  switch (type) {
    case "blog": return blogTemplate(dossier);
    case "faq": return faqTemplate(dossier);
    case "guide": return guideTemplate(dossier);
    case "glossary": return glossaryTemplate(dossier);
  }
}

function getContentDir(type: ContentType): string {
  const dirName = type === "guide" ? "guides" : type;
  return path.join(CONTENT_DIR, dirName);
}

function contentFileExists(cluster: KeywordCluster): boolean {
  return fs.existsSync(path.join(getContentDir(cluster.contentType), `${cluster.slug}.mdx`));
}

function getSchemaType(type: ContentType): "Article" | "FAQPage" | "HowTo" {
  switch (type) {
    case "blog": return "Article";
    case "faq": return "FAQPage";
    case "guide": return "HowTo";
    case "glossary": return "Article";
  }
}

function findRelatedSlugs(cluster: KeywordCluster, allClusters: KeywordCluster[]): string[] {
  const keywords = new Set([
    ...cluster.relatedKeywords.map((k) => k.toLowerCase()),
    cluster.primaryKeyword.toLowerCase(),
  ]);

  return allClusters
    .filter((c) => c.slug !== cluster.slug)
    .filter((c) => isAllowedKeyword(c.primaryKeyword))
    .filter((c) => contentFileExists(c))
    .filter((c) => {
      const otherKws = [c.primaryKeyword, ...c.relatedKeywords].map((k) => k.toLowerCase());
      return otherKws.some((k) => {
        for (const myKw of keywords) {
          if (k.includes(myKw) || myKw.includes(k)) return true;
        }
        return false;
      });
    })
    .slice(0, 5)
    .map((c) => c.slug);
}

function canOverwriteContent(contentPath: string): boolean {
  if (!fs.existsSync(contentPath)) return true;
  return OVERWRITE_EXISTING;
}

function titleCase(text: string): string {
  return text.replace(/\b\w+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}

function buildTitle(cluster: KeywordCluster, dossier: ResearchDossier): string {
  const suggested = dossier.recommendedHeadings[0]?.trim();
  if (suggested && suggested.toLowerCase().includes(cluster.primaryKeyword.toLowerCase())) {
    return suggested;
  }

  return titleCase(cluster.primaryKeyword);
}

function buildSources(dossier: ResearchDossier): { title: string; url: string }[] {
  const merged = new Map<string, { title: string; url: string }>();

  for (const source of dossier.medicalReferences) {
    merged.set(source.url, source);
  }

  for (const result of dossier.serpSnapshot) {
    if (!merged.has(result.url)) {
      merged.set(result.url, { title: result.title || result.url, url: result.url });
    }
  }

  return [...merged.values()].slice(0, 5);
}

function buildDescription(content: string, fallback: string): string {
  const candidate = content
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 50 && !line.startsWith("#"));

  return (candidate || fallback).slice(0, 155);
}

function getTargetWordCount(
  type: ContentType,
  dossier: ResearchDossier
): number {
  const minimums: Record<ContentType, number> = {
    blog: 1800,
    faq: 1000,
    guide: 1800,
    glossary: 650,
  };

  return Math.max(dossier.recommendedWordCount || 0, minimums[type]);
}

async function main() {
  console.log("=== SEO Engine: Content Writing ===\n");

  const clusters: KeywordCluster[] = JSON.parse(fs.readFileSync(KEYWORDS_PATH, "utf-8"));
  const toWrite = filterByTargetSlugs(
    clusters.filter((c) => c.status === "researched" || hasResearchDossier(c.slug))
  );
  console.log(`Found ${toWrite.length} clusters to write (out of ${clusters.length} total).\n`);

  if (toWrite.length === 0) {
    console.log("Nothing to write. Run seo:research first.");
    return;
  }

  const batchSize = parseInt(process.env.BATCH_SIZE || "10", 10);
  const batch = toWrite.slice(0, batchSize);
  console.log(`Processing batch of ${batch.length} clusters...\n`);
  let failedCount = 0;

  for (const cluster of batch) {
    try {
      console.log(`\n--- Writing: "${cluster.primaryKeyword}" (${cluster.contentType}) ---`);

      const dossierPath = path.join(RESEARCH_DIR, `${cluster.slug}.json`);
      if (!fs.existsSync(dossierPath)) {
        failedCount += 1;
        console.warn(`  No dossier found at ${dossierPath}, skipping.`);
        continue;
      }
      const dossier: ResearchDossier = JSON.parse(fs.readFileSync(dossierPath, "utf-8"));

      const contentDir = getContentDir(cluster.contentType);
      const contentPath = path.join(contentDir, `${cluster.slug}.mdx`);
      if (!canOverwriteContent(contentPath)) {
        failedCount += 1;
        console.log(`  Content already exists at ${contentPath}, skipping. Use OVERWRITE_EXISTING=1 to replace it.`);
        continue;
      }

      const template = getTemplate(cluster.contentType, dossier);
      const targetWordCount = getTargetWordCount(cluster.contentType, dossier);

      console.log("  Generating content with AI...");
      let articleContent = await aiWrite(
        template,
        JSON.stringify(dossier, null, 2),
        cluster.primaryKeyword,
        targetWordCount
      );

      const relatedSlugs = findRelatedSlugs(cluster, clusters);
      const buildFrontmatter = (content: string): ContentFrontmatter => {
        const rt = readingTime(content);
        return {
        title: buildTitle(cluster, dossier),
        slug: cluster.slug,
        description: buildDescription(content, cluster.primaryKeyword),
        type: cluster.contentType,
        status: "draft",
        keywords: filterKeywords([cluster.primaryKeyword, ...cluster.relatedKeywords]).slice(0, 6),
        dateGenerated: getCurrentDateString(),
        sources: buildSources(dossier),
        readingTime: Math.ceil(rt.minutes),
        schema: getSchemaType(cluster.contentType),
        relatedSlugs,
      };
      };

      let frontmatter = buildFrontmatter(articleContent);
      let quality = checkQuality(articleContent, frontmatter);

      let revisionAttempts = 0;
      while (!quality.pass && revisionAttempts < 2) {
        revisionAttempts += 1;
        console.log(
          `  Revising draft after quality failure (attempt ${revisionAttempts}): ${quality.issues.join("; ")}`
        );
        articleContent = await aiRepairDraft(
          articleContent,
          JSON.stringify(dossier, null, 2),
          cluster.primaryKeyword,
          quality.issues,
          targetWordCount
        );
        frontmatter = buildFrontmatter(articleContent);
        quality = checkQuality(articleContent, frontmatter);
      }

      let expansionAttempts = 0;
      while (
        !quality.pass &&
        expansionAttempts < 2 &&
        quality.issues.every((issue) => issue.startsWith("Word count too low"))
      ) {
        expansionAttempts += 1;
        console.log(
          `  Expanding draft to reach target length (attempt ${expansionAttempts}): ${quality.issues.join("; ")}`
        );
        const expansion = await aiExpandDraft(
          articleContent,
          JSON.stringify(dossier, null, 2),
          cluster.primaryKeyword,
          targetWordCount
        );
        articleContent = `${articleContent.trim()}\n\n${expansion.trim()}`;
        frontmatter = buildFrontmatter(articleContent);
        quality = checkQuality(articleContent, frontmatter);
      }

      if (!quality.pass && !ALLOW_LOW_QUALITY) {
        throw new Error(`Quality gate failed after revision: ${quality.issues.join("; ")}`);
      }
      if (!quality.pass && ALLOW_LOW_QUALITY) {
        console.warn(`  Quality issues: ${quality.issues.join("; ")}`);
        console.log("  Saving because ALLOW_LOW_QUALITY=1 is set.");
      }

      const mdxContent = `---
title: "${frontmatter.title.replace(/"/g, '\\"')}"
slug: ${frontmatter.slug}
description: "${frontmatter.description.replace(/"/g, '\\"')}"
type: ${frontmatter.type}
status: draft
keywords:
${frontmatter.keywords.map((k) => `  - "${k}"`).join("\n")}
dateGenerated: ${frontmatter.dateGenerated}
sources:
${frontmatter.sources.map((s) => `  - title: "${s.title.replace(/"/g, '\\"')}"\n    url: "${s.url}"`).join("\n")}
readingTime: ${frontmatter.readingTime}
schema: ${frontmatter.schema}
relatedSlugs:
${frontmatter.relatedSlugs.map((s) => `  - ${s}`).join("\n")}
---

${articleContent}
`;

      fs.mkdirSync(contentDir, { recursive: true });
      fs.writeFileSync(contentPath, mdxContent);
      console.log(`  Saved: ${contentPath}`);

      cluster.status = "written";
      fs.writeFileSync(KEYWORDS_PATH, JSON.stringify(clusters, null, 2));
    } catch (err) {
      failedCount += 1;
      console.error(`  Error writing "${cluster.primaryKeyword}":`, err);
    }
  }

  const written = clusters.filter((c) => c.status === "written").length;
  console.log(`\nDone! ${written}/${clusters.length} clusters written.`);

  if (failedCount > 0) {
    throw new Error(`Writing failed for ${failedCount} cluster(s) in this batch.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
