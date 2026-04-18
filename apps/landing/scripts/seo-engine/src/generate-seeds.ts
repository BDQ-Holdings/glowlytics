import "./lib/env.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../../data");
const SEEDS_PATH = path.join(DATA_DIR, "seeds.json");

// ---------------------------------------------------------------------------
// Domain data extracted from the Glowlytics app constants
// ---------------------------------------------------------------------------

const SKIN_SIGNALS = ["structure", "hydration", "inflammation", "sun damage", "elasticity"];

const LESION_TYPES = [
  { name: "acne", subtitle: "blemish" },
  { name: "comedone", subtitle: "clogged pore, blackhead, whitehead" },
  { name: "papule", subtitle: "inflammatory bump" },
  { name: "pustule", subtitle: "pus-filled bump" },
  { name: "nodule", subtitle: "deep cystic acne" },
  { name: "macule", subtitle: "dark spot, post-inflammatory hyperpigmentation" },
  { name: "patch", subtitle: "pigmented area, melasma" },
];

const PRODUCT_CATEGORIES = [
  "cleanser",
  "toner",
  "serum",
  "treatment",
  "moisturizer",
  "sunscreen",
];

const INGREDIENTS = [
  // Retinoids
  "retinol", "retinal", "tretinoin", "bakuchiol",
  // AHA/BHA
  "glycolic acid", "lactic acid", "mandelic acid", "salicylic acid",
  // Vitamin C
  "vitamin c", "ascorbic acid",
  // Other actives
  "niacinamide", "benzoyl peroxide", "azelaic acid", "adapalene",
  // Hydrators
  "hyaluronic acid", "ceramides", "squalane", "peptides", "centella", "snail mucin",
  // SPF filters
  "zinc oxide", "titanium dioxide",
  // Moisturizer ingredients
  "shea butter", "dimethicone",
];

const INGREDIENT_CONFLICTS = [
  "retinol and aha together",
  "vitamin c and benzoyl peroxide",
  "retinol and benzoyl peroxide",
  "niacinamide and vitamin c",
];

// ---------------------------------------------------------------------------
// Build the prompt
// ---------------------------------------------------------------------------

function buildPrompt(): string {
  return `You are an SEO keyword researcher specializing in skincare and dermatology.

I'm building a programmatic SEO content engine for Glowlytics, an AI skin health tracking app. I need you to generate a comprehensive list of seed keywords that real people search for.

## Our Domain Knowledge

**5 Skin Signals we track:** ${SKIN_SIGNALS.join(", ")}

**Lesion types we detect:** ${LESION_TYPES.map((l) => `${l.name} (${l.subtitle})`).join(", ")}

**Product categories:** ${PRODUCT_CATEGORIES.join(", ")}

**Active ingredients we know about:** ${INGREDIENTS.join(", ")}

**Ingredient conflicts we educate on:** ${INGREDIENT_CONFLICTS.join("; ")}

## What I Need

Generate 150-200 seed keywords that real people type into Google about skin health. These seeds will be expanded via Google Autocomplete and People Also Ask scraping, so they should be broad enough to generate hundreds of long-tail variations.

**Include seeds across these categories:**
1. Skin conditions & concerns (acne, rosacea, eczema, dry skin, etc.)
2. Specific symptom queries ("red bumps on forehead", "flaky skin around nose")
3. Ingredient searches ("retinol for beginners", "niacinamide benefits")
4. Routine queries ("skincare routine for oily skin", "morning vs night routine")
5. Product type queries ("best moisturizer for dry skin", "cleanser for acne")
6. Comparison queries ("retinol vs retinoid", "aha vs bha")
7. Age/demographic queries ("skincare in your 30s", "teen acne")
8. Seasonal/environmental ("winter skincare", "sun damage repair")
9. Skin science questions ("what is sebum", "how does collagen work")
10. Tracking/monitoring queries ("how to track skin progress", "skin diary")

**Rules:**
- 2-5 words each (not too broad, not too specific)
- Must be things people actually search (natural language)
- Mix of informational, transactional, and question-based intents
- No brand names
- No duplicate concepts

Return ONLY a JSON array of strings. No markdown, no explanation.`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== SEO Engine: Generate Seeds ===\n");
  console.log("Using Glowlytics domain data + Claude to generate comprehensive seed keywords...\n");

  const client = new Anthropic();

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      { role: "user", content: buildPrompt() },
    ],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "[]";
  let seeds: string[];
  try {
    seeds = JSON.parse(text);
  } catch {
    // Try to extract JSON array from the response if it has surrounding text
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      seeds = JSON.parse(match[0]);
    } else {
      console.error("Failed to parse AI response as JSON array.");
      console.error("Raw response:", text.slice(0, 500));
      process.exit(1);
    }
  }

  // Deduplicate and normalize
  const normalized = [...new Set(seeds.map((s: string) => s.toLowerCase().trim()))];
  console.log(`Generated ${normalized.length} seed keywords.\n`);

  // Merge with existing seeds if any
  let existing: string[] = [];
  if (fs.existsSync(SEEDS_PATH)) {
    existing = JSON.parse(fs.readFileSync(SEEDS_PATH, "utf-8"));
    console.log(`Found ${existing.length} existing seeds.`);
  }

  const merged = [...new Set([...existing, ...normalized])];
  console.log(`Merged total: ${merged.length} seeds.\n`);

  // Preview a sample
  console.log("Sample seeds:");
  merged.slice(0, 20).forEach((s) => console.log(`  - ${s}`));
  if (merged.length > 20) console.log(`  ... and ${merged.length - 20} more\n`);

  // Save
  fs.writeFileSync(SEEDS_PATH, JSON.stringify(merged, null, 2));
  console.log(`Saved to ${SEEDS_PATH}`);
}

main().catch(console.error);
