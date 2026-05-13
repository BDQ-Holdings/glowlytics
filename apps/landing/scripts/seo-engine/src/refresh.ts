import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import matter from "gray-matter";
import { filterByTargetSlugs } from "./lib/pipeline.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(__dirname, "../../../content");
const KEYWORDS_PATH = path.resolve(__dirname, "../../../data/keywords.json");
const RESEARCH_DIR = path.resolve(__dirname, "../../../data/research");

const STALE_DAYS = parseInt(process.env.STALE_DAYS || "90", 10);

function main() {
  console.log("=== SEO Engine: Content Freshness Check ===\n");
  console.log(`Checking for content older than ${STALE_DAYS} days...\n`);

  const now = Date.now();
  const staleCutoff = now - STALE_DAYS * 24 * 60 * 60 * 1000;
  const dirs = ["blog", "faq", "guides", "glossary"];
  const staleItems: { slug: string; type: string; age: number; filePath: string }[] = [];

  for (const dir of dirs) {
    const fullDir = path.join(CONTENT_DIR, dir);
    if (!fs.existsSync(fullDir)) continue;

    const files = fs.readdirSync(fullDir).filter((f) => f.endsWith(".mdx"));
    for (const file of files) {
      const filePath = path.join(fullDir, file);
      const raw = fs.readFileSync(filePath, "utf-8");
      const { data } = matter(raw);

      if (data.status !== "approved") continue;

      const dateStr = data.dateModified || data.dateGenerated;
      if (!dateStr) continue;

      const date = new Date(dateStr).getTime();
      if (date < staleCutoff) {
        const ageDays = Math.floor((now - date) / (24 * 60 * 60 * 1000));
        staleItems.push({
          slug: data.slug || file.replace(".mdx", ""),
          type: data.type || dir,
          age: ageDays,
          filePath,
        });
      }
    }
  }

  const filteredStaleItems = filterByTargetSlugs(staleItems);

  if (filteredStaleItems.length === 0) {
    console.log("No stale content found. Everything is fresh!");
    return;
  }

  console.log(`Found ${filteredStaleItems.length} stale articles:\n`);
  filteredStaleItems
    .sort((a, b) => b.age - a.age)
    .forEach((item) => {
      console.log(`  [${item.age}d old] ${item.type}/${item.slug}`);
    });

  const clusters = JSON.parse(fs.readFileSync(KEYWORDS_PATH, "utf-8"));
  let resetCount = 0;
  for (const item of filteredStaleItems) {
    const cluster = clusters.find((c: { slug: string }) => c.slug === item.slug);
    if (cluster) {
      const dossierPath = path.join(RESEARCH_DIR, `${item.slug}.json`);
      cluster.status = fs.existsSync(dossierPath) ? "researched" : "new";
      resetCount++;
    }
  }

  if (resetCount > 0) {
    fs.writeFileSync(KEYWORDS_PATH, JSON.stringify(clusters, null, 2));
    console.log(`\nPrepared ${resetCount} keyword clusters for refresh.`);
    console.log("If a research dossier exists, the cluster is now marked \"researched\".");
    console.log("Run TARGET_SLUGS=<comma-separated-slugs> npm run seo:research for items without dossiers.");
    console.log("Then run OVERWRITE_EXISTING=1 TARGET_SLUGS=<same slugs> npm run seo:write to generate replacement drafts.");
  }
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exitCode = 1;
}
