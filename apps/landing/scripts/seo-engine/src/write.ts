import "./lib/env.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import readingTime from "reading-time";
import { aiWrite } from "./lib/ai.js";
import { checkQuality } from "./lib/quality.js";
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

async function main() {
  console.log("=== SEO Engine: Content Writing ===\n");

  const clusters: KeywordCluster[] = JSON.parse(fs.readFileSync(KEYWORDS_PATH, "utf-8"));
  const toWrite = clusters.filter((c) => c.status === "researched");
  console.log(`Found ${toWrite.length} clusters to write (out of ${clusters.length} total).\n`);

  if (toWrite.length === 0) {
    console.log("Nothing to write. Run seo:research first.");
    return;
  }

  const batchSize = parseInt(process.env.BATCH_SIZE || "10", 10);
  const batch = toWrite.slice(0, batchSize);
  console.log(`Processing batch of ${batch.length} clusters...\n`);

  for (const cluster of batch) {
    try {
      console.log(`\n--- Writing: "${cluster.primaryKeyword}" (${cluster.contentType}) ---`);

      const dossierPath = path.join(RESEARCH_DIR, `${cluster.slug}.json`);
      if (!fs.existsSync(dossierPath)) {
        console.warn(`  No dossier found at ${dossierPath}, skipping.`);
        continue;
      }
      const dossier: ResearchDossier = JSON.parse(fs.readFileSync(dossierPath, "utf-8"));

      const contentDir = getContentDir(cluster.contentType);
      const contentPath = path.join(contentDir, `${cluster.slug}.mdx`);
      if (fs.existsSync(contentPath)) {
        console.log(`  Content already exists at ${contentPath}, skipping.`);
        continue;
      }

      const template = getTemplate(cluster.contentType, dossier);

      console.log("  Generating content with AI...");
      const articleContent = await aiWrite(
        template,
        JSON.stringify(dossier, null, 2),
        cluster.primaryKeyword
      );

      const rt = readingTime(articleContent);
      const relatedSlugs = findRelatedSlugs(cluster, clusters);

      const frontmatter: ContentFrontmatter = {
        title: dossier.recommendedHeadings[0] || cluster.primaryKeyword,
        slug: cluster.slug,
        description: articleContent.split("\n").find((l) => l.trim().length > 50)?.trim().slice(0, 155) || cluster.primaryKeyword,
        type: cluster.contentType,
        status: "draft",
        keywords: [cluster.primaryKeyword, ...cluster.relatedKeywords.slice(0, 5)],
        dateGenerated: new Date().toISOString().split("T")[0],
        sources: dossier.medicalReferences.slice(0, 5),
        readingTime: Math.ceil(rt.minutes),
        schema: getSchemaType(cluster.contentType),
        relatedSlugs,
      };

      const quality = checkQuality(articleContent, frontmatter);
      if (!quality.pass) {
        console.warn(`  Quality issues: ${quality.issues.join("; ")}`);
        console.log("  Saving anyway as draft (issues noted).");
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
      console.error(`  Error writing "${cluster.primaryKeyword}":`, err);
    }
  }

  const written = clusters.filter((c) => c.status === "written").length;
  console.log(`\nDone! ${written}/${clusters.length} clusters written.`);
}

main().catch(console.error);
