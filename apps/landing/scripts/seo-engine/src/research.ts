import "./lib/env.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { scrapeSERP } from "./lib/serp.js";
import { extractMultiple } from "./lib/extractor.js";
import { aiResearch } from "./lib/ai.js";
import { filterByTargetSlugs, sleep } from "./lib/pipeline.js";
import type { KeywordCluster, ResearchDossier } from "./lib/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../../data");
const KEYWORDS_PATH = path.join(DATA_DIR, "keywords.json");
const RESEARCH_DIR = path.join(DATA_DIR, "research");

async function researchCluster(cluster: KeywordCluster): Promise<ResearchDossier> {
  console.log(`\n--- Researching: "${cluster.primaryKeyword}" ---`);

  console.log("  Fetching SERP data...");
  const serpData = await scrapeSERP(cluster.primaryKeyword);
  if (serpData.organicResults.length < 2) {
    throw new Error("Insufficient SERP results to research this cluster.");
  }
  await sleep(1500);

  console.log(`  Extracting content from top ${Math.min(5, serpData.organicResults.length)} results...`);
  const urls = serpData.organicResults.slice(0, 5).map((r) => r.url);
  const extracted = await extractMultiple(urls);
  if (extracted.length < 2) {
    throw new Error("Insufficient extracted source content to produce a dossier.");
  }

  const serpContent = extracted
    .map(
      (e, i) =>
        `### Source ${i + 1}: ${e.title}\nURL: ${e.url}\nWord count: ${e.wordCount}\n\n${e.bodyText.slice(0, 3000)}`
    )
    .join("\n\n---\n\n");

  const competitorHeadings = extracted
    .map((e) => `${e.title}:\n${e.headings.map((h) => `  - ${h}`).join("\n")}`)
    .join("\n\n");

  console.log("  Synthesizing with AI...");
  const aiResult = await aiResearch(cluster.primaryKeyword, serpContent, competitorHeadings);
  if (aiResult.synthesizedFacts.length === 0 || aiResult.recommendedHeadings.length === 0) {
    throw new Error("AI dossier is incomplete.");
  }

  const dossier: ResearchDossier = {
    slug: cluster.slug,
    primaryKeyword: cluster.primaryKeyword,
    serpSnapshot: serpData.organicResults.slice(0, 10).map((r) => ({
      title: r.title,
      url: r.url,
      description: r.description,
      headings: extracted.find((e) => e.url === r.url)?.headings || [],
    })),
    contentGaps: aiResult.contentGaps,
    synthesizedFacts: aiResult.synthesizedFacts,
    medicalReferences: aiResult.medicalReferences,
    competitorContentStructure: extracted.flatMap((e) => e.headings),
    recommendedAngle: aiResult.recommendedAngle,
    recommendedWordCount: aiResult.recommendedWordCount,
    recommendedHeadings: aiResult.recommendedHeadings,
  };

  return dossier;
}

async function main() {
  console.log("=== SEO Engine: Deep Research ===\n");

  const clusters: KeywordCluster[] = JSON.parse(fs.readFileSync(KEYWORDS_PATH, "utf-8"));
  const toResearch = filterByTargetSlugs(clusters.filter((c) => c.status === "new"));
  console.log(`Found ${toResearch.length} clusters to research (out of ${clusters.length} total).\n`);

  if (toResearch.length === 0) {
    console.log("Nothing to research. Run seo:discover first.");
    return;
  }

  const batchSize = parseInt(process.env.BATCH_SIZE || "10", 10);
  const batch = toResearch.slice(0, batchSize);
  console.log(`Processing batch of ${batch.length} clusters...\n`);
  let failedCount = 0;

  for (const cluster of batch) {
    try {
      const dossier = await researchCluster(cluster);

      const dossierPath = path.join(RESEARCH_DIR, `${cluster.slug}.json`);
      fs.mkdirSync(RESEARCH_DIR, { recursive: true });
      fs.writeFileSync(dossierPath, JSON.stringify(dossier, null, 2));
      console.log(`  Saved dossier: ${dossierPath}`);

      cluster.status = "researched";
      fs.writeFileSync(KEYWORDS_PATH, JSON.stringify(clusters, null, 2));

      await sleep(2000);
    } catch (err) {
      failedCount += 1;
      console.error(`  Error researching "${cluster.primaryKeyword}":`, err);
    }
  }

  const researched = clusters.filter((c) => c.status === "researched").length;
  console.log(`\nDone! ${researched}/${clusters.length} clusters researched.`);

  if (failedCount > 0) {
    throw new Error(`Research failed for ${failedCount} cluster(s) in this batch.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
