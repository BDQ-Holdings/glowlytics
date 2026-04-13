# Programmatic SEO Engine — Design Spec

**Date:** 2026-04-13
**Status:** Approved
**Domain:** glowlytics.ai (skin health tracking app)

---

## 1. Goals

Build a semi-autonomous programmatic SEO engine that:

1. Discovers high-opportunity keyword clusters in the skin health space using free search signals
2. Deep-researches each cluster by analyzing top-ranking content and synthesizing with AI
3. Generates well-researched, medically-responsible content formatted into templates (blog posts, FAQs, guides, glossary entries)
4. Presents drafts for human review before publishing
5. Deploys as statically-generated pages on the Glowlytics Next.js site with full SEO infrastructure (structured data, sitemap, internal linking, topic clusters)

**Target scale:** 500+ pages covering skin concerns, ingredients, routines, and conditions.

---

## 2. Architecture Overview

Two components:

### 2.1 SEO Engine (`landing/scripts/seo-engine/`)

A Node.js/TypeScript CLI with four pipeline stages:

```
discover → research → write → review
```

Each stage is a standalone command. Stages are idempotent — re-running does not overwrite existing completed work unless explicitly forced.

### 2.2 Next.js Site (`landing/`)

Replaces the current static HTML landing page. Consumes `content/` directory at build time. Only pages with `status: approved` in frontmatter are built. Deployed to Cloudflare Pages.

---

## 3. Pipeline Stage 1: Keyword Discovery

**Command:** `npm run seo:discover`

### 3.1 Seed Topics

Defined in `data/seeds.json` — a curated list of root terms for the skin health domain:

```json
[
  "acne", "dry skin", "oily skin", "wrinkles", "dark spots",
  "sun damage", "skin barrier", "retinol", "niacinamide",
  "vitamin c skincare", "hyperpigmentation", "rosacea", "eczema",
  "skin hydration", "collagen", "dark circles", "pores",
  "sensitive skin", "anti aging", "moisturizer"
]
```

### 3.2 Data Sources (per seed)

1. **Google Autocomplete** — Query the suggest API with the seed + alphabet prefixes (`acne a`, `acne b`, ..., `acne z`) to surface real search completions.
2. **People Also Ask (PAA)** — Scrape the PAA box from a Google SERP for the seed query. High-intent questions that Google validates.
3. **Related Searches** — Scrape the "related searches" section at the bottom of the SERP.

### 3.3 Clustering & Classification

- Group similar keywords by semantic similarity (e.g., "acne on forehead", "forehead acne causes", "why do I get acne on my forehead" → one cluster)
- Assign each cluster a **content type** based on intent:
  - Informational questions → FAQ or blog post
  - "Best X for Y" → guide
  - "What is X" → glossary entry
- Score clusters by estimated opportunity (number of autocomplete hits + PAA presence = higher signal)

### 3.4 Output

`data/keywords.json` — array of keyword clusters:

```typescript
interface KeywordCluster {
  slug: string;                    // e.g., "forehead-acne-causes"
  primaryKeyword: string;          // e.g., "forehead acne causes"
  relatedKeywords: string[];       // all variants in the cluster
  contentType: "blog" | "faq" | "guide" | "glossary";
  intent: "informational" | "transactional" | "navigational";
  opportunityScore: number;        // higher = more search signals
  paaQuestions: string[];          // People Also Ask questions
  status: "new" | "researched" | "written";
}
```

Manual additions supported — you can add clusters directly to `keywords.json`.

---

## 4. Pipeline Stage 2: Deep Research

**Command:** `npm run seo:research`

Processes all keyword clusters with `status: new`. For each cluster:

### 4.1 SERP Analysis

Fetch the top 10 Google results for the primary keyword. Extract:
- Titles, meta descriptions, URLs
- Content length estimates
- Heading structures (H1/H2/H3 outline)

### 4.2 Content Extraction

For the top 5 results, fetch and extract main body content (strip nav/ads/boilerplate). Parse into structured sections with headings.

### 4.3 AI Synthesis

Send extracted content + keyword cluster to Claude:
- Synthesize key facts, statistics, and claims across sources
- Identify consensus points vs. contradictions
- Flag content gaps — topics top results miss that we could cover
- Extract cited studies, dermatologist quotes, medical references
- Note reading level and tone of top-ranking content

### 4.4 Domain Enrichment

Cross-reference with Glowlytics domain knowledge:
- The 5 skin signals (structure, hydration, inflammation, sun damage, elasticity)
- Ingredient database from the app
- Relevant dermatology research the app references

### 4.5 Output

`data/research/{slug}.json` per cluster:

```typescript
interface ResearchDossier {
  slug: string;
  primaryKeyword: string;
  serpSnapshot: {
    title: string;
    url: string;
    description: string;
    headings: string[];
  }[];
  contentGaps: string[];
  synthesizedFacts: {
    fact: string;
    sources: string[];
    confidence: "high" | "medium" | "low";
  }[];
  medicalReferences: { title: string; url: string }[];
  competitorContentStructure: string[];  // common heading patterns
  recommendedAngle: string;              // our unique take
  recommendedWordCount: number;
  recommendedHeadings: string[];
}
```

### 4.6 Rate Limiting

Built-in 1-2 second delays between SERP fetches. 500 clusters runs over several hours — designed for batch/overnight execution.

---

## 5. Pipeline Stage 3: Content Writing

**Command:** `npm run seo:write`

Processes all clusters with `status: researched`. Generates MDX articles using Claude.

### 5.1 Content Templates

| Type | Structure | Target Length |
|------|-----------|---------------|
| **Blog Post** | Hook → problem → science → practical advice → Glowlytics tie-in → sources | 1500-2500 words |
| **FAQ** | 5-8 Q&A pairs, each with concise answer + expandable detail | 800-1200 words |
| **Guide** | Step-by-step numbered sections, product/ingredient recommendations | 1500-2000 words |
| **Glossary** | Definition → why it matters → relation to skin health → related terms | 400-800 words |

### 5.2 Writing Prompt Includes

- Full research dossier (facts, sources, gaps, competitor analysis)
- Assigned template structure
- **Tone:** Authoritative but approachable, evidence-first, no fear-mongering, naturally reference Glowlytics where relevant (not salesy)
- **SEO directives:** Primary keyword in H1 and first paragraph, related keywords distributed naturally, PAA questions used as H2s where they fit
- **Medical guardrails:** Always include "consult a dermatologist" disclaimers, never claim to diagnose or treat, cite sources for medical claims

### 5.3 MDX Frontmatter

```yaml
---
title: "Why Does Acne Appear on Your Forehead?"
slug: forehead-acne-causes
description: "Concise meta description (~155 chars)"
type: blog
status: draft
keywords:
  - forehead acne
  - forehead breakouts
dateGenerated: 2026-04-13
sources:
  - title: "Source Title"
    url: "https://..."
readingTime: 8
schema: Article          # Article | FAQPage | HowTo
relatedSlugs:
  - acne-types
  - salicylic-acid-guide
---
```

### 5.4 Quality Checks (before saving)

- Word count within target range for the template type
- Primary keyword appears in title and first 100 words
- At least 2 cited sources
- No duplicate slugs in the content directory
- Readability score check (aim for grade 8-10 reading level)

---

## 6. Pipeline Stage 4: Review

**Command:** `npm run seo:review`

Starts a local dev server at `localhost:3001`:

- List of all drafts with title, type, word count, keyword cluster, date
- Click into any draft to preview the rendered article as it will appear on the site
- Approve, reject (with reason), or edit inline
- Bulk approve/reject with filters (by type, date, keyword cluster)
- Approving flips `status: draft` → `status: approved` in the MDX frontmatter

This is a lightweight local-only React app. Not deployed anywhere.

---

## 7. Next.js Site Architecture

### 7.1 Directory Structure

```
landing/
  app/
    page.tsx                        # Existing landing page (ported from index.html)
    layout.tsx                      # Root layout, nav, footer
    blog/
      page.tsx                      # Blog index (paginated grid)
      [slug]/page.tsx               # Individual blog posts
    guides/
      page.tsx                      # Guides index
      [slug]/page.tsx               # Individual guides
    faq/
      page.tsx                      # FAQ index
      [slug]/page.tsx               # Individual FAQ pages
    glossary/
      page.tsx                      # Glossary A-Z index
      [slug]/page.tsx               # Individual glossary entries
    privacy/page.tsx                # Ported from existing
    terms/page.tsx                  # Ported from existing
    sitemap.ts                      # Auto-generated from all approved content
    robots.ts                       # Standard robots.txt
  content/
    blog/*.mdx
    guides/*.mdx
    faq/*.mdx
    glossary/*.mdx
  components/
    ArticleLayout.tsx               # Shared article chrome (TOC, breadcrumbs, related)
    FAQSchema.tsx                   # Injects FAQPage structured data
    ArticleSchema.tsx               # Injects Article structured data
  lib/
    content.ts                      # Reads content/ dir, filters by status: approved
  scripts/
    seo-engine/
      src/
        discover.ts                 # Keyword discovery
        research.ts                 # Deep research
        write.ts                    # Content generation
        review.ts                   # Review dashboard server
        lib/
          autocomplete.ts           # Google Autocomplete client
          serp.ts                   # SERP scraping
          extractor.ts              # Content extraction from URLs
          clustering.ts             # Keyword clustering
          templates/
            blog.ts                 # Blog post prompt template
            faq.ts                  # FAQ prompt template
            guide.ts                # Guide prompt template
            glossary.ts             # Glossary prompt template
      package.json
      tsconfig.json
  data/
    seeds.json
    keywords.json
    research/*.json
  next.config.ts
  package.json
  tsconfig.json
```

### 7.2 SEO Features (every page)

- **Structured data** per content type: `Article`, `FAQPage`, `HowTo` — generated from frontmatter `schema` field
- **Auto-generated sitemap** including all approved content with `lastModified` dates
- **Internal linking** — `relatedSlugs` renders "Related Articles" section; engine cross-links in body text
- **Breadcrumbs** with `BreadcrumbList` schema
- **Canonical URLs** per page
- **OG/Twitter meta** generated from frontmatter
- **robots.ts** allowing all crawlers

### 7.3 Build & Deploy

`next build` statically generates all approved pages. Deploy to Cloudflare Pages via `wrangler pages deploy .next/` using the `@cloudflare/next-on-pages` adapter (same hosting as current site, new build output).

---

## 8. Internal Linking & Topic Clusters

### 8.1 Automatic Internal Linking

During the write stage, the engine scans all existing approved content and identifies linking opportunities — when an article mentions a term that has its own glossary entry or guide, it links to it.

### 8.2 Hub & Spoke Model

The engine identifies hub topics (e.g., "acne") with many related keyword clusters and generates hub pages (`/guides/acne-complete-guide`) linking to all spokes. Spokes link back to the hub. This signals topical authority to search engines.

### 8.3 Category Index Pages

`/blog`, `/guides`, `/faq`, `/glossary` group content with filtering by skin concern, ingredient, and skin type — giving Google clear topical hierarchy.

---

## 9. Content Freshness

**Command:** `npm run seo:refresh`

- Re-runs research on approved content older than 90 days
- Flags articles where the SERP landscape has shifted significantly
- Generates updated drafts for review
- Updated articles keep the same slug/URL, get a `dateModified` field

---

## 10. Glowlytics Tie-ins

Subtle, not salesy:

- **Blog posts and guides** end with a soft CTA: "Track your [relevant signal] daily with Glowlytics" with an app store link
- **Glossary entries** include a "How Glowlytics measures this" blurb when the term maps to one of the 5 skin signals
- **Goal:** Convert organic traffic into app downloads without feeling like an ad

---

## 11. Technology Choices

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Site framework | Next.js 15 (App Router) | SSG, metadata API, existing React/TS expertise |
| Content format | MDX | Frontmatter for metadata, components in content |
| MDX processing | `@next/mdx` + `gray-matter` | Standard Next.js MDX pipeline |
| Hosting | Cloudflare Pages | Already in use, `@cloudflare/next-on-pages` adapter |
| AI (research & writing) | Claude API (`@anthropic-ai/sdk`) | Best writing quality, already used in backend |
| SERP scraping | Lightweight fetch + cheerio | No headless browser needed for autocomplete/PAA |
| Review dashboard | Vite + React (local only) | Fast dev server, reads filesystem directly |
| Keyword clustering | Simple TF-IDF + Levenshtein | No ML dependencies, good enough for keyword grouping |

---

## 12. CLI Commands Summary

```bash
# Pipeline stages
npm run seo:discover          # Discover keyword clusters from seeds
npm run seo:research          # Deep research each cluster
npm run seo:write             # Generate MDX content from research
npm run seo:review            # Launch local review dashboard

# Maintenance
npm run seo:refresh           # Re-research stale content (>90 days)

# Site
npm run dev                   # Next.js dev server
npm run build                 # Build static site
npm run deploy                # Build + deploy to Cloudflare Pages
```

---

## 13. What This Design Does NOT Include

- Paid SEO tool integrations (Ahrefs, SEMrush) — can be added later as an enrichment source in the discover stage
- A/B testing of content variants — premature at this scale
- Automated publishing without review — intentionally excluded for quality control
- Multi-language support — English only for now
- Comment system — not needed for programmatic content
