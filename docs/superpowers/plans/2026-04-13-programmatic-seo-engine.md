# Programmatic SEO Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a semi-autonomous programmatic SEO engine that discovers keywords, researches them, generates templated content, and deploys as statically-generated pages on the Glowlytics Next.js site.

**Architecture:** A Node.js/TypeScript CLI pipeline (discover → research → write → review) outputs MDX files consumed by a Next.js 15 App Router site. Content is gated by frontmatter `status: approved`. The site replaces the current static HTML landing page on Cloudflare Pages.

**Tech Stack:** Next.js 15, TypeScript, MDX, Anthropic SDK, cheerio, gray-matter, Vite (review dashboard), Cloudflare Pages

---

## File Structure

```
landing/
  package.json                          # Next.js + MDX deps
  next.config.ts                        # MDX plugin, static export config
  tsconfig.json                         # Strict TS
  tailwind.config.ts                    # Tailwind (matching landing design tokens)
  postcss.config.mjs                    # PostCSS for Tailwind
  app/
    globals.css                         # Tailwind directives + custom vars from index.html
    layout.tsx                          # Root layout, nav, footer, fonts
    page.tsx                            # Landing page (ported from index.html)
    privacy/page.tsx                    # Ported from privacy/index.html
    terms/page.tsx                      # Ported from terms/index.html
    blog/
      page.tsx                          # Blog index (paginated grid)
      [slug]/page.tsx                   # Blog post page
    guides/
      page.tsx                          # Guides index
      [slug]/page.tsx                   # Guide page
    faq/
      page.tsx                          # FAQ index
      [slug]/page.tsx                   # FAQ page
    glossary/
      page.tsx                          # Glossary A-Z index
      [slug]/page.tsx                   # Glossary entry page
    sitemap.ts                          # Dynamic sitemap generation
    robots.ts                           # robots.txt
  components/
    Nav.tsx                             # Shared nav bar
    Footer.tsx                          # Shared footer
    ArticleLayout.tsx                   # Article chrome: TOC, breadcrumbs, related
    Breadcrumbs.tsx                     # Breadcrumb trail + schema
    ArticleSchema.tsx                   # Article structured data
    FAQSchema.tsx                       # FAQPage structured data
    HowToSchema.tsx                     # HowTo structured data
    RelatedArticles.tsx                 # Related articles section
    CTABanner.tsx                       # Glowlytics app download CTA
  lib/
    content.ts                          # Read MDX content dir, parse frontmatter, filter
    mdx.ts                              # MDX compilation (serialize + components)
    types.ts                            # Shared types (ContentMeta, Article, etc.)
  content/
    blog/.gitkeep
    guides/.gitkeep
    faq/.gitkeep
    glossary/.gitkeep
  data/
    seeds.json                          # Seed keywords for discovery
    keywords.json                       # Generated keyword clusters (initially empty array)
    research/.gitkeep                   # Research dossiers go here
  scripts/
    seo-engine/
      package.json                      # Engine deps (anthropic, cheerio, etc.)
      tsconfig.json                     # TS config for engine scripts
      src/
        discover.ts                     # Keyword discovery CLI command
        research.ts                     # Deep research CLI command
        write.ts                        # Content writing CLI command
        review.ts                       # Review dashboard CLI command
        refresh.ts                      # Content freshness CLI command
        lib/
          autocomplete.ts               # Google Autocomplete API client
          serp.ts                       # SERP scraping (results + PAA + related)
          extractor.ts                  # Article content extraction from URLs
          clustering.ts                 # Keyword clustering (TF-IDF + Levenshtein)
          ai.ts                         # Claude API wrapper for research & writing
          quality.ts                    # Quality checks (word count, keyword density, etc.)
          types.ts                      # KeywordCluster, ResearchDossier, etc.
          templates/
            blog.ts                     # Blog post writing prompt
            faq.ts                      # FAQ writing prompt
            guide.ts                    # Guide writing prompt
            glossary.ts                 # Glossary writing prompt
      review-ui/
        index.html                      # Review dashboard SPA entry
        src/
          App.tsx                       # Dashboard main component
          api.ts                        # Fetch drafts/approve/reject from local server
```

---

## Task 1: Initialize Next.js Project

**Files:**
- Create: `landing/package.json`
- Create: `landing/next.config.ts`
- Create: `landing/tsconfig.json`
- Create: `landing/tailwind.config.ts`
- Create: `landing/postcss.config.mjs`
- Create: `landing/app/globals.css`

- [ ] **Step 1: Initialize package.json**

```bash
cd landing
npm init -y
```

- [ ] **Step 2: Install Next.js and core dependencies**

```bash
cd landing
npm install next@latest react@latest react-dom@latest typescript @types/react @types/react-dom
npm install tailwindcss @tailwindcss/postcss postcss
npm install @next/mdx @mdx-js/loader @mdx-js/react gray-matter reading-time
npm install next-mdx-remote remark-gfm rehype-slug rehype-autolink-headings
npm install @types/mdx
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", "**/*.mdx"],
  "exclude": ["node_modules", "scripts"]
}
```

- [ ] **Step 4: Create next.config.ts**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  pageExtensions: ["ts", "tsx", "mdx"],
};

export default nextConfig;
```

- [ ] **Step 5: Create postcss.config.mjs**

```javascript
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

- [ ] **Step 6: Create tailwind.config.ts**

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx,mdx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./content/**/*.mdx",
  ],
  theme: {
    extend: {
      colors: {
        "bg-deep": "#050a12",
        "bg-dark": "#080e1a",
        "bg-card": "#0c1424",
        teal: "#7DE7E1",
        "teal-dark": "#1BA8A0",
        purple: "#8A6FE8",
        coral: "#FF7A78",
        amber: "#F2B56A",
        blue: "#4DA6FF",
        cream: "#f8f6f1",
        "cream-2": "#f2efe8",
        "warm-white": "#fdfcfa",
        "dark-text": "#0e1e2e",
        "mid-text": "#5a6a78",
        "light-text": "#94a3b3",
      },
      fontFamily: {
        display: ["'Bricolage Grotesque'", "serif"],
        body: ["'Plus Jakarta Sans'", "-apple-system", "sans-serif"],
      },
      borderRadius: {
        xl: "20px",
        "2xl": "28px",
        "3xl": "36px",
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 7: Create app/globals.css**

```css
@import "tailwindcss";

:root {
  --bg-deep: #050a12;
  --bg-dark: #080e1a;
  --bg-card: #0c1424;
  --teal: #7DE7E1;
  --teal-dark: #1BA8A0;
  --purple: #8A6FE8;
  --coral: #FF7A78;
  --amber: #F2B56A;
  --blue: #4DA6FF;
  --cream: #f8f6f1;
  --warm-white: #fdfcfa;
  --font-display: 'Bricolage Grotesque', serif;
  --font-body: 'Plus Jakarta Sans', -apple-system, sans-serif;
}
```

- [ ] **Step 8: Add npm scripts to package.json**

Add these scripts to `landing/package.json`:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "seo:discover": "npx tsx scripts/seo-engine/src/discover.ts",
    "seo:research": "npx tsx scripts/seo-engine/src/research.ts",
    "seo:write": "npx tsx scripts/seo-engine/src/write.ts",
    "seo:review": "npx tsx scripts/seo-engine/src/review.ts",
    "seo:refresh": "npx tsx scripts/seo-engine/src/refresh.ts"
  }
}
```

- [ ] **Step 9: Create content and data directories**

```bash
cd landing
mkdir -p content/blog content/guides content/faq content/glossary
mkdir -p data/research
touch content/blog/.gitkeep content/guides/.gitkeep content/faq/.gitkeep content/glossary/.gitkeep
touch data/research/.gitkeep
```

- [ ] **Step 10: Verify Next.js starts**

```bash
cd landing && npm run dev
```

Expected: Next.js dev server starts on localhost:3000 (404 page since no app/page.tsx yet).

- [ ] **Step 11: Commit**

```bash
git add landing/package.json landing/package-lock.json landing/next.config.ts landing/tsconfig.json landing/tailwind.config.ts landing/postcss.config.mjs landing/app/globals.css landing/content/ landing/data/
git commit -m "feat(landing): initialize Next.js 15 project with Tailwind and MDX"
```

---

## Task 2: Shared Types and Content Library

**Files:**
- Create: `landing/lib/types.ts`
- Create: `landing/lib/content.ts`

- [ ] **Step 1: Create shared types**

Create `landing/lib/types.ts`:

```typescript
export type ContentType = "blog" | "faq" | "guide" | "glossary";

export type ContentStatus = "draft" | "approved" | "rejected";

export type SchemaType = "Article" | "FAQPage" | "HowTo";

export interface ContentSource {
  title: string;
  url: string;
}

export interface ContentMeta {
  title: string;
  slug: string;
  description: string;
  type: ContentType;
  status: ContentStatus;
  keywords: string[];
  dateGenerated: string;
  dateModified?: string;
  sources: ContentSource[];
  readingTime: number;
  schema: SchemaType;
  relatedSlugs: string[];
}

export interface ContentItem {
  meta: ContentMeta;
  content: string;
  filePath: string;
}
```

- [ ] **Step 2: Create content library**

Create `landing/lib/content.ts`:

```typescript
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
    const dir = path.join(CONTENT_DIR, t === "guide" ? "guides" : `${t}s`);

    // Handle the directory name: blog→blog, faq→faq, guide→guides, glossary→glossary
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
```

- [ ] **Step 3: Commit**

```bash
git add landing/lib/
git commit -m "feat(landing): add content types and MDX content library"
```

---

## Task 3: Root Layout, Nav, and Footer

**Files:**
- Create: `landing/app/layout.tsx`
- Create: `landing/components/Nav.tsx`
- Create: `landing/components/Footer.tsx`

- [ ] **Step 1: Create Nav component**

Create `landing/components/Nav.tsx`:

```tsx
import Link from "next/link";

export default function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 px-[clamp(20px,4vw,48px)] bg-bg-deep/80 backdrop-blur-xl border-b border-white/5">
      <div className="max-w-[1200px] mx-auto flex items-center justify-between h-[72px]">
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/logo-emblem.webp" alt="" width={32} height={32} />
          <span className="font-display text-lg font-bold tracking-tight bg-gradient-to-br from-teal to-purple bg-clip-text text-transparent">
            Glowlytics
          </span>
        </Link>
        <div className="flex items-center gap-8">
          <Link href="/blog" className="text-sm font-medium text-white/55 hover:text-white/90 transition-colors">
            Blog
          </Link>
          <Link href="/guides" className="text-sm font-medium text-white/55 hover:text-white/90 transition-colors">
            Guides
          </Link>
          <Link href="/faq" className="text-sm font-medium text-white/55 hover:text-white/90 transition-colors">
            FAQ
          </Link>
          <Link href="/glossary" className="text-sm font-medium text-white/55 hover:text-white/90 transition-colors">
            Glossary
          </Link>
          <a
            href="https://apps.apple.com/app/glowlytics/id6760600635"
            className="text-sm font-semibold px-5 py-2 rounded-full bg-teal/10 text-teal border border-teal/20 hover:bg-teal/20 transition-colors"
          >
            Download
          </a>
        </div>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Create Footer component**

Create `landing/components/Footer.tsx`:

```tsx
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-white/5 py-12 px-[clamp(20px,4vw,48px)]">
      <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row justify-between gap-8">
        <div>
          <span className="font-display text-lg font-bold bg-gradient-to-br from-teal to-purple bg-clip-text text-transparent">
            Glowlytics
          </span>
          <p className="text-sm text-white/40 mt-2">AI skin health tracking built by doctors.</p>
          <p className="text-xs text-white/25 mt-4">&copy; {new Date().getFullYear()} BDQ Holdings LLC</p>
        </div>
        <div className="flex gap-12">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-white/30 uppercase tracking-wider">Learn</span>
            <Link href="/blog" className="text-sm text-white/50 hover:text-white/80">Blog</Link>
            <Link href="/guides" className="text-sm text-white/50 hover:text-white/80">Guides</Link>
            <Link href="/faq" className="text-sm text-white/50 hover:text-white/80">FAQ</Link>
            <Link href="/glossary" className="text-sm text-white/50 hover:text-white/80">Glossary</Link>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-white/30 uppercase tracking-wider">Legal</span>
            <Link href="/privacy" className="text-sm text-white/50 hover:text-white/80">Privacy</Link>
            <Link href="/terms" className="text-sm text-white/50 hover:text-white/80">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 3: Create root layout**

Create `landing/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://glowlytics.ai"),
  title: {
    default: "Glowlytics | AI Skin Health Tracking Built by Doctors",
    template: "%s | Glowlytics",
  },
  description:
    "Track your skin health daily with AI built by doctors. Understand acne, hydration, sun damage, and aging. Backed by dermatology research.",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://glowlytics.ai",
    siteName: "Glowlytics",
    images: [{ url: "/logo-full.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/png" href="/logo-emblem.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body bg-bg-deep text-white antialiased overflow-x-hidden">
        <Nav />
        <main className="pt-[72px]">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Verify layout renders**

```bash
cd landing && npm run dev
```

Visit `http://localhost:3000`. Expected: 404 page with nav and footer rendering.

- [ ] **Step 5: Commit**

```bash
git add landing/app/layout.tsx landing/components/Nav.tsx landing/components/Footer.tsx
git commit -m "feat(landing): add root layout with nav and footer"
```

---

## Task 4: Port Landing Page

**Files:**
- Create: `landing/app/page.tsx`
- Move: `landing/app-screenshot.webp` → `landing/public/app-screenshot.webp`
- Move: logos → `landing/public/`

The existing `index.html` is 2745 lines of hand-coded HTML/CSS/JS. Port the content and structure to a React component. Keep the existing inline styles as a `<style>` tag or migrate key sections to Tailwind. The landing page is a one-off marketing page — pixel-perfect parity matters more than clean abstraction.

- [ ] **Step 1: Move static assets to public/**

```bash
cd landing
mkdir -p public
cp app-screenshot.webp app-screenshot.png logo-emblem.png logo-emblem.webp logo-full.png logo-app.png public/
```

- [ ] **Step 2: Create landing page component**

Create `landing/app/page.tsx`. This is a large file — port the full HTML from `index.html` into a React component. The approach:

1. Copy the HTML body content into JSX (fix `class` → `className`, self-close tags, etc.)
2. Move the `<style>` block into a colocated CSS module or keep as a `<style>` tag in the component
3. Move the `<script>` blocks into `useEffect` hooks with `"use client"` directive
4. Keep the structured data JSON-LD in a `<script>` tag via `next/head` or metadata API

Since this is a direct port of a 2745-line file, the implementation should:
- Use `"use client"` since the page has scroll animations and interactivity
- Keep the CSS as-is in a `<style jsx>` block or separate CSS file `landing-page.css`
- Port the JS scroll handlers into React `useEffect`

```tsx
"use client";

import { useEffect } from "react";

export default function LandingPage() {
  useEffect(() => {
    document.documentElement.classList.add("loaded");

    // Nav scroll handler
    const nav = document.querySelector(".landing-nav");
    if (nav) {
      window.addEventListener("scroll", () => {
        nav.classList.toggle("scrolled", window.scrollY > 20);
      }, { passive: true });
    }
  }, []);

  return (
    <>
      {/* Port the full HTML body content from index.html here */}
      {/* Keep existing class names and styles */}
    </>
  );
}
```

**Note to implementer:** The full landing page is 2745 lines. Read `landing/index.html` completely and port section by section. The existing CSS variables in `globals.css` already match. Focus on:
1. Converting HTML attributes (`class` → `className`, `for` → `htmlFor`)
2. Self-closing void elements (`<img>`, `<br>`, `<hr>`, `<input>`)
3. Moving `<script>` logic into `useEffect`
4. Keeping the structured JSON-LD via a `<script dangerouslySetInnerHTML>` tag

- [ ] **Step 3: Verify landing page matches original**

```bash
cd landing && npm run dev
```

Visit `http://localhost:3000`. Compare visually with the original `index.html` (open it directly in browser). All sections, animations, and interactions should match.

- [ ] **Step 4: Commit**

```bash
git add landing/public/ landing/app/page.tsx
git commit -m "feat(landing): port landing page from static HTML to Next.js"
```

---

## Task 5: Port Privacy and Terms Pages

**Files:**
- Create: `landing/app/privacy/page.tsx`
- Create: `landing/app/terms/page.tsx`

- [ ] **Step 1: Port privacy page**

Read `landing/privacy/index.html` and port to `landing/app/privacy/page.tsx`:

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Glowlytics Privacy Policy. Learn how BDQ Holdings LLC handles your data.",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-[680px] mx-auto px-6 py-10 text-[#1a2b3c] bg-[#EDF5F6] min-h-screen">
      {/* Port the full body content from privacy/index.html */}
      {/* Keep the existing styles inline or as Tailwind classes */}
    </div>
  );
}
```

**Note to implementer:** Read `landing/privacy/index.html` fully and port all content. The privacy page has its own light color scheme (`background: #EDF5F6`) — it should keep that, not inherit the dark landing page theme. Override the body background for this route.

- [ ] **Step 2: Port terms page**

Read `landing/terms/index.html` and port to `landing/app/terms/page.tsx`:

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Glowlytics Terms of Service.",
};

export default function TermsPage() {
  return (
    <div className="max-w-[680px] mx-auto px-6 py-10 leading-relaxed">
      <h1 className="text-[28px] mb-2">Terms of Service</h1>
      <p className="text-[#7a8f9e] mb-8 text-sm">Last updated: March 22, 2026</p>
      {/* Port all sections from terms/index.html */}
    </div>
  );
}
```

- [ ] **Step 3: Verify both pages render**

```bash
cd landing && npm run dev
```

Visit `http://localhost:3000/privacy` and `http://localhost:3000/terms`. Compare with originals.

- [ ] **Step 4: Commit**

```bash
git add landing/app/privacy/ landing/app/terms/
git commit -m "feat(landing): port privacy and terms pages to Next.js"
```

---

## Task 6: SEO Components (Structured Data, Breadcrumbs, Article Layout)

**Files:**
- Create: `landing/components/Breadcrumbs.tsx`
- Create: `landing/components/ArticleSchema.tsx`
- Create: `landing/components/FAQSchema.tsx`
- Create: `landing/components/HowToSchema.tsx`
- Create: `landing/components/RelatedArticles.tsx`
- Create: `landing/components/CTABanner.tsx`
- Create: `landing/components/ArticleLayout.tsx`

- [ ] **Step 1: Create Breadcrumbs component**

Create `landing/components/Breadcrumbs.tsx`:

```tsx
import Link from "next/link";
import type { ContentType } from "@/lib/types";

interface BreadcrumbItem {
  label: string;
  href: string;
}

const TYPE_LABELS: Record<ContentType, { label: string; href: string }> = {
  blog: { label: "Blog", href: "/blog" },
  guide: { label: "Guides", href: "/guides" },
  faq: { label: "FAQ", href: "/faq" },
  glossary: { label: "Glossary", href: "/glossary" },
};

export default function Breadcrumbs({ type, title }: { type: ContentType; title: string }) {
  const parent = TYPE_LABELS[type];
  const items: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    { label: parent.label, href: parent.href },
    { label: title, href: "#" },
  ];

  const schemaData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.label,
      item: item.href !== "#" ? `https://glowlytics.ai${item.href}` : undefined,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }}
      />
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-white/40 mb-6">
        {items.map((item, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && <span>/</span>}
            {item.href !== "#" ? (
              <Link href={item.href} className="hover:text-white/70 transition-colors">
                {item.label}
              </Link>
            ) : (
              <span className="text-white/60">{item.label}</span>
            )}
          </span>
        ))}
      </nav>
    </>
  );
}
```

- [ ] **Step 2: Create ArticleSchema component**

Create `landing/components/ArticleSchema.tsx`:

```tsx
import type { ContentMeta } from "@/lib/types";

export default function ArticleSchema({ meta }: { meta: ContentMeta }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: meta.title,
    description: meta.description,
    datePublished: meta.dateGenerated,
    dateModified: meta.dateModified || meta.dateGenerated,
    author: {
      "@type": "Organization",
      name: "Glowlytics",
      url: "https://glowlytics.ai",
    },
    publisher: {
      "@type": "Organization",
      name: "Glowlytics",
      logo: {
        "@type": "ImageObject",
        url: "https://glowlytics.ai/logo-full.png",
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://glowlytics.ai/${meta.type === "guide" ? "guides" : meta.type}/${meta.slug}`,
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
```

- [ ] **Step 3: Create FAQSchema component**

Create `landing/components/FAQSchema.tsx`:

```tsx
interface FAQItem {
  question: string;
  answer: string;
}

export default function FAQSchema({ items }: { items: FAQItem[] }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
```

- [ ] **Step 4: Create HowToSchema component**

Create `landing/components/HowToSchema.tsx`:

```tsx
import type { ContentMeta } from "@/lib/types";

interface HowToStep {
  name: string;
  text: string;
}

export default function HowToSchema({ meta, steps }: { meta: ContentMeta; steps: HowToStep[] }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: meta.title,
    description: meta.description,
    step: steps.map((step, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: step.name,
      text: step.text,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
```

- [ ] **Step 5: Create RelatedArticles component**

Create `landing/components/RelatedArticles.tsx`:

```tsx
import Link from "next/link";
import { getAllContent } from "@/lib/content";
import type { ContentMeta } from "@/lib/types";

export default function RelatedArticles({ slugs }: { slugs: string[] }) {
  if (slugs.length === 0) return null;

  const allContent = getAllContent(undefined, "approved");
  const related = slugs
    .map((slug) => allContent.find((item) => item.meta.slug === slug))
    .filter(Boolean)
    .slice(0, 3);

  if (related.length === 0) return null;

  return (
    <section className="mt-16 pt-8 border-t border-white/10">
      <h2 className="text-xl font-display font-bold mb-6">Related Articles</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {related.map((item) => {
          const meta = item!.meta;
          const basePath = meta.type === "guide" ? "guides" : meta.type;
          return (
            <Link
              key={meta.slug}
              href={`/${basePath}/${meta.slug}`}
              className="p-4 rounded-xl bg-bg-card border border-white/5 hover:border-teal/20 transition-colors"
            >
              <span className="text-xs font-medium text-teal/70 uppercase tracking-wider">
                {meta.type}
              </span>
              <h3 className="text-sm font-semibold mt-1 text-white/90">{meta.title}</h3>
              <p className="text-xs text-white/40 mt-2 line-clamp-2">{meta.description}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Create CTABanner component**

Create `landing/components/CTABanner.tsx`:

```tsx
export default function CTABanner({ signal }: { signal?: string }) {
  const text = signal
    ? `Track your ${signal} daily with Glowlytics`
    : "Track your skin health daily with Glowlytics";

  return (
    <div className="mt-12 p-6 rounded-2xl bg-gradient-to-r from-teal/10 to-purple/10 border border-teal/15 text-center">
      <p className="text-white/80 font-medium">{text}</p>
      <a
        href="https://apps.apple.com/app/glowlytics/id6760600635"
        className="inline-block mt-3 px-6 py-2.5 rounded-full bg-teal/15 text-teal font-semibold text-sm border border-teal/25 hover:bg-teal/25 transition-colors"
      >
        Download for iOS
      </a>
    </div>
  );
}
```

- [ ] **Step 7: Create ArticleLayout component**

Create `landing/components/ArticleLayout.tsx`:

```tsx
import Breadcrumbs from "./Breadcrumbs";
import ArticleSchema from "./ArticleSchema";
import RelatedArticles from "./RelatedArticles";
import CTABanner from "./CTABanner";
import type { ContentMeta } from "@/lib/types";

const SIGNAL_MAP: Record<string, string> = {
  acne: "inflammation",
  redness: "inflammation",
  rosacea: "inflammation",
  wrinkles: "elasticity",
  "anti-aging": "elasticity",
  collagen: "elasticity",
  hydration: "hydration",
  "dry skin": "hydration",
  moisturizer: "hydration",
  "sun damage": "sun damage",
  sunscreen: "sun damage",
  spf: "sun damage",
  pores: "structure",
  texture: "structure",
};

function matchSignal(keywords: string[]): string | undefined {
  for (const kw of keywords) {
    const lower = kw.toLowerCase();
    for (const [term, signal] of Object.entries(SIGNAL_MAP)) {
      if (lower.includes(term)) return signal;
    }
  }
  return undefined;
}

export default function ArticleLayout({
  meta,
  children,
}: {
  meta: ContentMeta;
  children: React.ReactNode;
}) {
  const signal = matchSignal(meta.keywords);

  return (
    <article className="max-w-[720px] mx-auto px-6 py-12">
      <Breadcrumbs type={meta.type} title={meta.title} />
      <ArticleSchema meta={meta} />

      <header className="mb-8">
        <span className="text-xs font-semibold text-teal/70 uppercase tracking-wider">
          {meta.type}
        </span>
        <h1 className="text-3xl md:text-4xl font-display font-bold mt-2 leading-tight">
          {meta.title}
        </h1>
        <div className="flex items-center gap-4 mt-4 text-sm text-white/40">
          <time>{meta.dateModified || meta.dateGenerated}</time>
          <span>{meta.readingTime} min read</span>
        </div>
      </header>

      <div className="prose prose-invert prose-teal max-w-none">{children}</div>

      {meta.sources.length > 0 && (
        <section className="mt-12 pt-6 border-t border-white/10">
          <h2 className="text-lg font-display font-bold mb-3">Sources</h2>
          <ol className="list-decimal list-inside text-sm text-white/50 space-y-1">
            {meta.sources.map((source, i) => (
              <li key={i}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal/70 hover:text-teal underline"
                >
                  {source.title}
                </a>
              </li>
            ))}
          </ol>
        </section>
      )}

      <CTABanner signal={signal} />
      <RelatedArticles slugs={meta.relatedSlugs} />
    </article>
  );
}
```

- [ ] **Step 8: Commit**

```bash
git add landing/components/
git commit -m "feat(landing): add SEO components — schemas, breadcrumbs, article layout, CTA"
```

---

## Task 7: Content Route Pages (Blog, Guides, FAQ, Glossary)

**Files:**
- Create: `landing/lib/mdx.ts`
- Create: `landing/app/blog/page.tsx`
- Create: `landing/app/blog/[slug]/page.tsx`
- Create: `landing/app/guides/page.tsx`
- Create: `landing/app/guides/[slug]/page.tsx`
- Create: `landing/app/faq/page.tsx`
- Create: `landing/app/faq/[slug]/page.tsx`
- Create: `landing/app/glossary/page.tsx`
- Create: `landing/app/glossary/[slug]/page.tsx`

- [ ] **Step 1: Create MDX compilation helper**

Create `landing/lib/mdx.ts`:

```typescript
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";

export async function renderMdx(source: string) {
  const { content } = await compileMDX({
    source,
    options: {
      mdxOptions: {
        remarkPlugins: [remarkGfm],
        rehypePlugins: [rehypeSlug, rehypeAutolinkHeadings],
      },
    },
  });
  return content;
}
```

- [ ] **Step 2: Create blog index page**

Create `landing/app/blog/page.tsx`:

```tsx
import Link from "next/link";
import { getAllContent } from "@/lib/content";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog",
  description: "Evidence-based skin health articles backed by dermatology research.",
};

export default function BlogIndex() {
  const posts = getAllContent("blog", "approved");

  return (
    <div className="max-w-[1000px] mx-auto px-6 py-12">
      <h1 className="text-3xl font-display font-bold mb-2">Blog</h1>
      <p className="text-white/50 mb-10">Evidence-based skin health insights.</p>
      {posts.length === 0 ? (
        <p className="text-white/30">No articles yet. Check back soon.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <Link
              key={post.meta.slug}
              href={`/blog/${post.meta.slug}`}
              className="p-5 rounded-2xl bg-bg-card border border-white/5 hover:border-teal/20 transition-colors"
            >
              <span className="text-xs text-teal/60 font-medium">{post.meta.readingTime} min read</span>
              <h2 className="text-lg font-semibold mt-2 leading-snug">{post.meta.title}</h2>
              <p className="text-sm text-white/40 mt-2 line-clamp-3">{post.meta.description}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create blog slug page**

Create `landing/app/blog/[slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getContentBySlug, getAllSlugs } from "@/lib/content";
import { renderMdx } from "@/lib/mdx";
import ArticleLayout from "@/components/ArticleLayout";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getAllSlugs("blog").map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const item = getContentBySlug("blog", slug);
  if (!item) return {};
  return {
    title: item.meta.title,
    description: item.meta.description,
    openGraph: {
      title: item.meta.title,
      description: item.meta.description,
      type: "article",
      publishedTime: item.meta.dateGenerated,
      modifiedTime: item.meta.dateModified,
    },
  };
}

export default async function BlogPost({ params }: Props) {
  const { slug } = await params;
  const item = getContentBySlug("blog", slug);
  if (!item) notFound();

  const content = await renderMdx(item.content);

  return <ArticleLayout meta={item.meta}>{content}</ArticleLayout>;
}
```

- [ ] **Step 4: Create guides index page**

Create `landing/app/guides/page.tsx`:

```tsx
import Link from "next/link";
import { getAllContent } from "@/lib/content";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Skincare Guides",
  description: "Step-by-step skincare guides for every skin type and concern.",
};

export default function GuidesIndex() {
  const guides = getAllContent("guide", "approved");

  return (
    <div className="max-w-[1000px] mx-auto px-6 py-12">
      <h1 className="text-3xl font-display font-bold mb-2">Guides</h1>
      <p className="text-white/50 mb-10">Step-by-step skincare guides backed by science.</p>
      {guides.length === 0 ? (
        <p className="text-white/30">No guides yet. Check back soon.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {guides.map((guide) => (
            <Link
              key={guide.meta.slug}
              href={`/guides/${guide.meta.slug}`}
              className="p-5 rounded-2xl bg-bg-card border border-white/5 hover:border-teal/20 transition-colors"
            >
              <span className="text-xs text-teal/60 font-medium">{guide.meta.readingTime} min read</span>
              <h2 className="text-lg font-semibold mt-2 leading-snug">{guide.meta.title}</h2>
              <p className="text-sm text-white/40 mt-2 line-clamp-3">{guide.meta.description}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create guides slug page**

Create `landing/app/guides/[slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getContentBySlug, getAllSlugs } from "@/lib/content";
import { renderMdx } from "@/lib/mdx";
import ArticleLayout from "@/components/ArticleLayout";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getAllSlugs("guide").map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const item = getContentBySlug("guide", slug);
  if (!item) return {};
  return {
    title: item.meta.title,
    description: item.meta.description,
    openGraph: {
      title: item.meta.title,
      description: item.meta.description,
      type: "article",
    },
  };
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params;
  const item = getContentBySlug("guide", slug);
  if (!item) notFound();

  const content = await renderMdx(item.content);

  return <ArticleLayout meta={item.meta}>{content}</ArticleLayout>;
}
```

- [ ] **Step 6: Create FAQ index page**

Create `landing/app/faq/page.tsx`:

```tsx
import Link from "next/link";
import { getAllContent } from "@/lib/content";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Frequently asked questions about skin health, skincare ingredients, and routines.",
};

export default function FAQIndex() {
  const faqs = getAllContent("faq", "approved");

  return (
    <div className="max-w-[1000px] mx-auto px-6 py-12">
      <h1 className="text-3xl font-display font-bold mb-2">FAQ</h1>
      <p className="text-white/50 mb-10">Answers to common skin health questions.</p>
      {faqs.length === 0 ? (
        <p className="text-white/30">No FAQs yet. Check back soon.</p>
      ) : (
        <div className="grid gap-4">
          {faqs.map((faq) => (
            <Link
              key={faq.meta.slug}
              href={`/faq/${faq.meta.slug}`}
              className="p-5 rounded-xl bg-bg-card border border-white/5 hover:border-teal/20 transition-colors"
            >
              <h2 className="text-base font-semibold">{faq.meta.title}</h2>
              <p className="text-sm text-white/40 mt-1">{faq.meta.description}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Create FAQ slug page**

Create `landing/app/faq/[slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getContentBySlug, getAllSlugs } from "@/lib/content";
import { renderMdx } from "@/lib/mdx";
import ArticleLayout from "@/components/ArticleLayout";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getAllSlugs("faq").map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const item = getContentBySlug("faq", slug);
  if (!item) return {};
  return {
    title: item.meta.title,
    description: item.meta.description,
  };
}

export default async function FAQPage({ params }: Props) {
  const { slug } = await params;
  const item = getContentBySlug("faq", slug);
  if (!item) notFound();

  const content = await renderMdx(item.content);

  return <ArticleLayout meta={item.meta}>{content}</ArticleLayout>;
}
```

- [ ] **Step 8: Create glossary index page**

Create `landing/app/glossary/page.tsx`:

```tsx
import Link from "next/link";
import { getAllContent } from "@/lib/content";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Skin Health Glossary",
  description: "Definitions and explanations of common skin health terms, ingredients, and conditions.",
};

export default function GlossaryIndex() {
  const entries = getAllContent("glossary", "approved");
  const sorted = entries.sort((a, b) => a.meta.title.localeCompare(b.meta.title));

  // Group by first letter
  const grouped: Record<string, typeof entries> = {};
  for (const entry of sorted) {
    const letter = entry.meta.title[0].toUpperCase();
    if (!grouped[letter]) grouped[letter] = [];
    grouped[letter].push(entry);
  }

  return (
    <div className="max-w-[1000px] mx-auto px-6 py-12">
      <h1 className="text-3xl font-display font-bold mb-2">Glossary</h1>
      <p className="text-white/50 mb-10">Skin health terms explained simply.</p>
      {sorted.length === 0 ? (
        <p className="text-white/30">No entries yet. Check back soon.</p>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([letter, items]) => (
            <div key={letter}>
              <h2 className="text-xl font-display font-bold text-teal/70 mb-3">{letter}</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {items.map((item) => (
                  <Link
                    key={item.meta.slug}
                    href={`/glossary/${item.meta.slug}`}
                    className="p-4 rounded-xl bg-bg-card border border-white/5 hover:border-teal/20 transition-colors"
                  >
                    <h3 className="text-sm font-semibold">{item.meta.title}</h3>
                    <p className="text-xs text-white/40 mt-1 line-clamp-2">{item.meta.description}</p>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 9: Create glossary slug page**

Create `landing/app/glossary/[slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getContentBySlug, getAllSlugs } from "@/lib/content";
import { renderMdx } from "@/lib/mdx";
import ArticleLayout from "@/components/ArticleLayout";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getAllSlugs("glossary").map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const item = getContentBySlug("glossary", slug);
  if (!item) return {};
  return {
    title: item.meta.title,
    description: item.meta.description,
  };
}

export default async function GlossaryEntry({ params }: Props) {
  const { slug } = await params;
  const item = getContentBySlug("glossary", slug);
  if (!item) notFound();

  const content = await renderMdx(item.content);

  return <ArticleLayout meta={item.meta}>{content}</ArticleLayout>;
}
```

- [ ] **Step 10: Commit**

```bash
git add landing/lib/mdx.ts landing/app/blog/ landing/app/guides/ landing/app/faq/ landing/app/glossary/
git commit -m "feat(landing): add content route pages — blog, guides, FAQ, glossary"
```

---

## Task 8: Sitemap and Robots

**Files:**
- Create: `landing/app/sitemap.ts`
- Create: `landing/app/robots.ts`

- [ ] **Step 1: Create sitemap generator**

Create `landing/app/sitemap.ts`:

```typescript
import type { MetadataRoute } from "next";
import { getAllContent } from "@/lib/content";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://glowlytics.ai";
  const approved = getAllContent(undefined, "approved");

  const contentPages = approved.map((item) => {
    const basePath = item.meta.type === "guide" ? "guides" : item.meta.type;
    return {
      url: `${baseUrl}/${basePath}/${item.meta.slug}`,
      lastModified: new Date(item.meta.dateModified || item.meta.dateGenerated),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    };
  });

  return [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "weekly", priority: 1.0 },
    { url: `${baseUrl}/blog`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/guides`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/faq`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/glossary`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${baseUrl}/terms`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    ...contentPages,
  ];
}
```

- [ ] **Step 2: Create robots.txt**

Create `landing/app/robots.ts`:

```typescript
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
      },
    ],
    sitemap: "https://glowlytics.ai/sitemap.xml",
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add landing/app/sitemap.ts landing/app/robots.ts
git commit -m "feat(landing): add sitemap and robots.txt generation"
```

---

## Task 9: SEO Engine Scaffolding

**Files:**
- Create: `landing/scripts/seo-engine/package.json`
- Create: `landing/scripts/seo-engine/tsconfig.json`
- Create: `landing/scripts/seo-engine/src/lib/types.ts`
- Create: `landing/data/seeds.json`
- Create: `landing/data/keywords.json`

- [ ] **Step 1: Create engine package.json**

Create `landing/scripts/seo-engine/package.json`:

```json
{
  "name": "glowlytics-seo-engine",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "cheerio": "^1.0.0",
    "gray-matter": "^4.0.3",
    "reading-time": "^1.5.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0"
  }
}
```

- [ ] **Step 2: Install engine dependencies**

```bash
cd landing/scripts/seo-engine && npm install
```

- [ ] **Step 3: Create engine tsconfig.json**

Create `landing/scripts/seo-engine/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 4: Create engine types**

Create `landing/scripts/seo-engine/src/lib/types.ts`:

```typescript
export type ContentType = "blog" | "faq" | "guide" | "glossary";
export type SearchIntent = "informational" | "transactional" | "navigational";
export type ClusterStatus = "new" | "researched" | "written";
export type Confidence = "high" | "medium" | "low";

export interface KeywordCluster {
  slug: string;
  primaryKeyword: string;
  relatedKeywords: string[];
  contentType: ContentType;
  intent: SearchIntent;
  opportunityScore: number;
  paaQuestions: string[];
  status: ClusterStatus;
}

export interface SerpResult {
  title: string;
  url: string;
  description: string;
  headings: string[];
}

export interface SynthesizedFact {
  fact: string;
  sources: string[];
  confidence: Confidence;
}

export interface ResearchDossier {
  slug: string;
  primaryKeyword: string;
  serpSnapshot: SerpResult[];
  contentGaps: string[];
  synthesizedFacts: SynthesizedFact[];
  medicalReferences: { title: string; url: string }[];
  competitorContentStructure: string[];
  recommendedAngle: string;
  recommendedWordCount: number;
  recommendedHeadings: string[];
}

export interface ContentFrontmatter {
  title: string;
  slug: string;
  description: string;
  type: ContentType;
  status: "draft" | "approved" | "rejected";
  keywords: string[];
  dateGenerated: string;
  dateModified?: string;
  sources: { title: string; url: string }[];
  readingTime: number;
  schema: "Article" | "FAQPage" | "HowTo";
  relatedSlugs: string[];
}
```

- [ ] **Step 5: Create seeds.json**

Create `landing/data/seeds.json`:

```json
[
  "acne",
  "dry skin",
  "oily skin",
  "wrinkles",
  "dark spots",
  "sun damage",
  "skin barrier",
  "retinol",
  "niacinamide",
  "vitamin c skincare",
  "hyperpigmentation",
  "rosacea",
  "eczema",
  "skin hydration",
  "collagen",
  "dark circles",
  "pores",
  "sensitive skin",
  "anti aging",
  "moisturizer",
  "salicylic acid",
  "hyaluronic acid",
  "ceramides",
  "skin texture",
  "hormonal acne",
  "sunscreen",
  "skin redness",
  "fine lines",
  "skin elasticity",
  "exfoliation"
]
```

- [ ] **Step 6: Create empty keywords.json**

Create `landing/data/keywords.json`:

```json
[]
```

- [ ] **Step 7: Commit**

```bash
git add landing/scripts/seo-engine/ landing/data/seeds.json landing/data/keywords.json
git commit -m "feat(seo-engine): scaffold engine with types, seeds, and config"
```

---

## Task 10: Google Autocomplete and SERP Scraping

**Files:**
- Create: `landing/scripts/seo-engine/src/lib/autocomplete.ts`
- Create: `landing/scripts/seo-engine/src/lib/serp.ts`

- [ ] **Step 1: Create autocomplete client**

Create `landing/scripts/seo-engine/src/lib/autocomplete.ts`:

```typescript
const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getAutocompleteSuggestions(seed: string): Promise<string[]> {
  const suggestions: Set<string> = new Set();

  // Base query
  const baseSuggestions = await fetchSuggestions(seed);
  baseSuggestions.forEach((s) => suggestions.add(s));

  // Alphabet expansion: "seed a", "seed b", ...
  for (const letter of ALPHABET) {
    await sleep(200); // Rate limit
    const expanded = await fetchSuggestions(`${seed} ${letter}`);
    expanded.forEach((s) => suggestions.add(s));
  }

  return Array.from(suggestions);
}

async function fetchSuggestions(query: string): Promise<string[]> {
  const encoded = encodeURIComponent(query);
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encoded}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) return [];

    const data = await res.json();
    // Response format: [query, [suggestions]]
    if (Array.isArray(data) && Array.isArray(data[1])) {
      return data[1].filter((s: unknown): s is string => typeof s === "string");
    }
    return [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Create SERP scraper**

Create `landing/scripts/seo-engine/src/lib/serp.ts`:

```typescript
import * as cheerio from "cheerio";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SerpData {
  organicResults: { title: string; url: string; description: string }[];
  paaQuestions: string[];
  relatedSearches: string[];
}

export async function scrapeSERP(query: string): Promise<SerpData> {
  const encoded = encodeURIComponent(query);
  const url = `https://www.google.com/search?q=${encoded}&hl=en&gl=us`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) {
      console.warn(`SERP fetch failed for "${query}": ${res.status}`);
      return { organicResults: [], paaQuestions: [], relatedSearches: [] };
    }

    const html = await res.text();
    return parseSERP(html);
  } catch (err) {
    console.warn(`SERP fetch error for "${query}":`, err);
    return { organicResults: [], paaQuestions: [], relatedSearches: [] };
  }
}

function parseSERP(html: string): SerpData {
  const $ = cheerio.load(html);

  // Organic results
  const organicResults: SerpData["organicResults"] = [];
  $("div.g").each((_, el) => {
    const title = $(el).find("h3").first().text().trim();
    const url = $(el).find("a").first().attr("href") || "";
    const description = $(el).find(".VwiC3b, .s3v9rd").first().text().trim();
    if (title && url.startsWith("http")) {
      organicResults.push({ title, url, description });
    }
  });

  // People Also Ask
  const paaQuestions: string[] = [];
  $("div.related-question-pair, div[data-q]").each((_, el) => {
    const question = $(el).attr("data-q") || $(el).find("span").first().text().trim();
    if (question) paaQuestions.push(question);
  });

  // Also try the jsname-based PAA selectors
  $("div[jsname] span.CSkcDe").each((_, el) => {
    const question = $(el).text().trim();
    if (question && !paaQuestions.includes(question)) {
      paaQuestions.push(question);
    }
  });

  // Related searches
  const relatedSearches: string[] = [];
  $("div.s75CSd a, a.k8XOCe").each((_, el) => {
    const text = $(el).text().trim();
    if (text) relatedSearches.push(text);
  });

  return {
    organicResults: organicResults.slice(0, 10),
    paaQuestions,
    relatedSearches,
  };
}

export async function batchScrapeSERP(
  queries: string[],
  delayMs: number = 1500
): Promise<Map<string, SerpData>> {
  const results = new Map<string, SerpData>();
  for (const query of queries) {
    console.log(`  Scraping SERP: "${query}"`);
    const data = await scrapeSERP(query);
    results.set(query, data);
    await sleep(delayMs);
  }
  return results;
}
```

- [ ] **Step 3: Commit**

```bash
git add landing/scripts/seo-engine/src/lib/autocomplete.ts landing/scripts/seo-engine/src/lib/serp.ts
git commit -m "feat(seo-engine): add Google Autocomplete and SERP scraping clients"
```

---

## Task 11: Content Extractor and Keyword Clustering

**Files:**
- Create: `landing/scripts/seo-engine/src/lib/extractor.ts`
- Create: `landing/scripts/seo-engine/src/lib/clustering.ts`

- [ ] **Step 1: Create content extractor**

Create `landing/scripts/seo-engine/src/lib/extractor.ts`:

```typescript
import * as cheerio from "cheerio";

export interface ExtractedContent {
  title: string;
  url: string;
  headings: string[];
  bodyText: string;
  wordCount: number;
}

export async function extractContent(url: string): Promise<ExtractedContent | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    // Remove nav, footer, ads, scripts, styles
    $("nav, footer, header, script, style, noscript, iframe, .ad, .ads, .sidebar, .comments").remove();

    const title = $("h1").first().text().trim() || $("title").text().trim();

    const headings: string[] = [];
    $("h1, h2, h3").each((_, el) => {
      const text = $(el).text().trim();
      if (text) headings.push(text);
    });

    // Get main content area
    const mainSelectors = ["article", "main", "[role='main']", ".post-content", ".article-body", ".entry-content"];
    let bodyText = "";
    for (const sel of mainSelectors) {
      const el = $(sel).first();
      if (el.length) {
        bodyText = el.text().trim();
        break;
      }
    }
    if (!bodyText) {
      bodyText = $("body").text().trim();
    }

    // Clean up whitespace
    bodyText = bodyText.replace(/\s+/g, " ").trim();

    return {
      title,
      url,
      headings,
      bodyText: bodyText.slice(0, 15000), // Cap at ~15k chars
      wordCount: bodyText.split(/\s+/).length,
    };
  } catch {
    return null;
  }
}

export async function extractMultiple(
  urls: string[],
  delayMs: number = 1000
): Promise<ExtractedContent[]> {
  const results: ExtractedContent[] = [];
  for (const url of urls.slice(0, 5)) {
    console.log(`  Extracting: ${url}`);
    const content = await extractContent(url);
    if (content) results.push(content);
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return results;
}
```

- [ ] **Step 2: Create keyword clustering**

Create `landing/scripts/seo-engine/src/lib/clustering.ts`:

```typescript
import type { ContentType, SearchIntent, KeywordCluster } from "./types.js";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) matrix[i] = [i];
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

function normalizedSimilarity(a: string, b: string): number {
  const aNorm = a.toLowerCase().trim();
  const bNorm = b.toLowerCase().trim();
  const maxLen = Math.max(aNorm.length, bNorm.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(aNorm, bNorm) / maxLen;
}

function wordOverlap(a: string, b: string): number {
  const aWords = new Set(a.toLowerCase().split(/\s+/));
  const bWords = new Set(b.toLowerCase().split(/\s+/));
  let overlap = 0;
  for (const w of aWords) {
    if (bWords.has(w)) overlap++;
  }
  return overlap / Math.max(aWords.size, bWords.size);
}

function classifyIntent(keyword: string): SearchIntent {
  const lower = keyword.toLowerCase();
  if (lower.match(/\b(buy|best|top|review|price|cheap|vs)\b/)) return "transactional";
  if (lower.match(/\b(what|why|how|does|can|is|are|when|should)\b/)) return "informational";
  return "informational";
}

function classifyContentType(keyword: string, paaQuestions: string[]): ContentType {
  const lower = keyword.toLowerCase();
  if (lower.match(/\b(what is|what are|define|meaning|definition)\b/)) return "glossary";
  if (lower.match(/\b(how to|routine|steps|guide|tutorial)\b/)) return "guide";
  if (paaQuestions.length >= 3) return "faq";
  return "blog";
}

export function clusterKeywords(
  keywords: string[],
  paaMap: Map<string, string[]>,
  similarityThreshold: number = 0.45
): KeywordCluster[] {
  const clusters: KeywordCluster[] = [];
  const assigned = new Set<string>();

  // Sort by length descending — longer phrases are more specific and make better cluster centers
  const sorted = [...keywords].sort((a, b) => b.length - a.length);

  for (const keyword of sorted) {
    if (assigned.has(keyword)) continue;

    const related: string[] = [];
    for (const other of sorted) {
      if (other === keyword || assigned.has(other)) continue;
      const sim = Math.max(normalizedSimilarity(keyword, other), wordOverlap(keyword, other));
      if (sim >= similarityThreshold) {
        related.push(other);
        assigned.add(other);
      }
    }

    assigned.add(keyword);

    const paaQuestions = paaMap.get(keyword) || [];
    const allPaa = [
      ...paaQuestions,
      ...related.flatMap((r) => paaMap.get(r) || []),
    ];
    const uniquePaa = [...new Set(allPaa)];

    const slug = slugify(keyword);
    const opportunityScore = 1 + related.length + uniquePaa.length * 0.5;

    clusters.push({
      slug,
      primaryKeyword: keyword,
      relatedKeywords: related,
      contentType: classifyContentType(keyword, uniquePaa),
      intent: classifyIntent(keyword),
      opportunityScore,
      paaQuestions: uniquePaa,
      status: "new",
    });
  }

  // Sort by opportunity score descending
  return clusters.sort((a, b) => b.opportunityScore - a.opportunityScore);
}
```

- [ ] **Step 3: Commit**

```bash
git add landing/scripts/seo-engine/src/lib/extractor.ts landing/scripts/seo-engine/src/lib/clustering.ts
git commit -m "feat(seo-engine): add content extractor and keyword clustering"
```

---

## Task 12: Discover Command

**Files:**
- Create: `landing/scripts/seo-engine/src/discover.ts`

- [ ] **Step 1: Create discover command**

Create `landing/scripts/seo-engine/src/discover.ts`:

```typescript
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getAutocompleteSuggestions } from "./lib/autocomplete.js";
import { scrapeSERP } from "./lib/serp.js";
import { clusterKeywords } from "./lib/clustering.js";
import type { KeywordCluster } from "./lib/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../../data");
const SEEDS_PATH = path.join(DATA_DIR, "seeds.json");
const KEYWORDS_PATH = path.join(DATA_DIR, "keywords.json");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("=== SEO Engine: Keyword Discovery ===\n");

  // Load seeds
  const seeds: string[] = JSON.parse(fs.readFileSync(SEEDS_PATH, "utf-8"));
  console.log(`Loaded ${seeds.length} seed keywords.\n`);

  // Load existing clusters to preserve their status
  const existing: KeywordCluster[] = JSON.parse(fs.readFileSync(KEYWORDS_PATH, "utf-8"));
  const existingSlugs = new Set(existing.map((c) => c.slug));
  console.log(`Found ${existing.length} existing clusters.\n`);

  const allSuggestions: string[] = [];
  const paaMap = new Map<string, string[]>();

  for (const seed of seeds) {
    console.log(`\n--- Processing seed: "${seed}" ---`);

    // 1. Get autocomplete suggestions
    console.log("  Fetching autocomplete suggestions...");
    const suggestions = await getAutocompleteSuggestions(seed);
    console.log(`  Found ${suggestions.length} suggestions.`);
    allSuggestions.push(...suggestions);

    // 2. Scrape SERP for PAA and related searches
    console.log("  Scraping SERP...");
    await sleep(1500);
    const serpData = await scrapeSERP(seed);
    console.log(`  Found ${serpData.paaQuestions.length} PAA questions, ${serpData.relatedSearches.length} related searches.`);

    // Store PAA questions
    paaMap.set(seed, serpData.paaQuestions);

    // Add related searches to suggestions pool
    allSuggestions.push(...serpData.relatedSearches);

    // Add PAA questions as suggestions too
    allSuggestions.push(...serpData.paaQuestions);

    await sleep(1000);
  }

  // Deduplicate all suggestions
  const uniqueSuggestions = [...new Set(allSuggestions.map((s) => s.toLowerCase().trim()))];
  console.log(`\n\nTotal unique suggestions: ${uniqueSuggestions.length}`);

  // Cluster keywords
  console.log("Clustering keywords...");
  const newClusters = clusterKeywords(uniqueSuggestions, paaMap);
  console.log(`Created ${newClusters.length} clusters.`);

  // Merge with existing — preserve status of existing clusters
  const merged: KeywordCluster[] = [...existing];
  let addedCount = 0;
  for (const cluster of newClusters) {
    if (!existingSlugs.has(cluster.slug)) {
      merged.push(cluster);
      addedCount++;
    }
  }

  console.log(`\nAdded ${addedCount} new clusters. Total: ${merged.length}`);

  // Save
  fs.writeFileSync(KEYWORDS_PATH, JSON.stringify(merged, null, 2));
  console.log(`\nSaved to ${KEYWORDS_PATH}`);
  console.log("Done!");
}

main().catch(console.error);
```

- [ ] **Step 2: Test discover command (dry run with 1-2 seeds)**

Temporarily edit `seeds.json` to have just 2 seeds for a quick test:

```bash
cd landing && npm run seo:discover
```

Expected: Console output showing autocomplete suggestions and SERP data being fetched, clusters being created, `keywords.json` populated.

- [ ] **Step 3: Restore full seeds.json and commit**

```bash
git add landing/scripts/seo-engine/src/discover.ts
git commit -m "feat(seo-engine): add keyword discovery command"
```

---

## Task 13: AI Client Wrapper

**Files:**
- Create: `landing/scripts/seo-engine/src/lib/ai.ts`

- [ ] **Step 1: Create AI client**

Create `landing/scripts/seo-engine/src/lib/ai.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function aiResearch(
  keyword: string,
  serpContent: string,
  competitorHeadings: string
): Promise<{
  synthesizedFacts: { fact: string; sources: string[]; confidence: "high" | "medium" | "low" }[];
  contentGaps: string[];
  medicalReferences: { title: string; url: string }[];
  recommendedAngle: string;
  recommendedHeadings: string[];
  recommendedWordCount: number;
}> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are a dermatology content researcher. Analyze the following SERP content for the keyword "${keyword}" and produce a research dossier.

## Top-Ranking Content
${serpContent}

## Competitor Heading Structures
${competitorHeadings}

## Your Task
Analyze the content and produce a JSON object with these fields:
1. "synthesizedFacts": Array of {fact, sources: [urls], confidence: "high"|"medium"|"low"} — key medical/scientific facts across sources
2. "contentGaps": Array of strings — topics the top results miss that a comprehensive article should cover
3. "medicalReferences": Array of {title, url} — any cited studies or medical sources
4. "recommendedAngle": String — what unique angle would make our article stand out (we are Glowlytics, an AI skin health tracking app)
5. "recommendedHeadings": Array of strings — recommended H2 headings for our article
6. "recommendedWordCount": Number — target word count based on competitor analysis

Respond with ONLY the JSON object, no markdown formatting.`,
      },
    ],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  return JSON.parse(text);
}

export async function aiWrite(
  template: string,
  dossier: string,
  keyword: string
): Promise<string> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: `You are an expert health content writer for Glowlytics, an AI-powered skin health tracking app. Write content based on the following template and research.

## Template
${template}

## Research Dossier
${dossier}

## Primary Keyword
${keyword}

## Guidelines
- Authoritative but approachable tone
- Evidence-first: cite sources for medical claims
- Include "consult a dermatologist" disclaimers where appropriate
- Never claim to diagnose or treat conditions
- Naturally reference Glowlytics where relevant (not salesy)
- Primary keyword should appear in the first paragraph
- Use PAA questions as H2 headings where they fit naturally
- Target reading level: grade 8-10
- Use markdown formatting (## for H2, ### for H3, etc.)

Write the full article content in markdown. Do NOT include frontmatter — just the body content starting with the first paragraph.`,
      },
    ],
  });

  return message.content[0].type === "text" ? message.content[0].text : "";
}
```

- [ ] **Step 2: Commit**

```bash
git add landing/scripts/seo-engine/src/lib/ai.ts
git commit -m "feat(seo-engine): add Claude AI client for research and writing"
```

---

## Task 14: Research Command

**Files:**
- Create: `landing/scripts/seo-engine/src/research.ts`

- [ ] **Step 1: Create research command**

Create `landing/scripts/seo-engine/src/research.ts`:

```typescript
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { scrapeSERP } from "./lib/serp.js";
import { extractMultiple } from "./lib/extractor.js";
import { aiResearch } from "./lib/ai.js";
import type { KeywordCluster, ResearchDossier } from "./lib/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../../data");
const KEYWORDS_PATH = path.join(DATA_DIR, "keywords.json");
const RESEARCH_DIR = path.join(DATA_DIR, "research");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function researchCluster(cluster: KeywordCluster): Promise<ResearchDossier> {
  console.log(`\n--- Researching: "${cluster.primaryKeyword}" ---`);

  // 1. SERP analysis
  console.log("  Fetching SERP data...");
  const serpData = await scrapeSERP(cluster.primaryKeyword);
  await sleep(1500);

  // 2. Extract content from top results
  console.log(`  Extracting content from top ${Math.min(5, serpData.organicResults.length)} results...`);
  const urls = serpData.organicResults.slice(0, 5).map((r) => r.url);
  const extracted = await extractMultiple(urls);

  // 3. Prepare content for AI synthesis
  const serpContent = extracted
    .map(
      (e, i) =>
        `### Source ${i + 1}: ${e.title}\nURL: ${e.url}\nWord count: ${e.wordCount}\n\n${e.bodyText.slice(0, 3000)}`
    )
    .join("\n\n---\n\n");

  const competitorHeadings = extracted
    .map((e) => `${e.title}:\n${e.headings.map((h) => `  - ${h}`).join("\n")}`)
    .join("\n\n");

  // 4. AI synthesis
  console.log("  Synthesizing with AI...");
  const aiResult = await aiResearch(cluster.primaryKeyword, serpContent, competitorHeadings);

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
  const toResearch = clusters.filter((c) => c.status === "new");
  console.log(`Found ${toResearch.length} clusters to research (out of ${clusters.length} total).\n`);

  if (toResearch.length === 0) {
    console.log("Nothing to research. Run seo:discover first.");
    return;
  }

  // Process in batches to be gentle on rate limits
  const batchSize = parseInt(process.env.BATCH_SIZE || "10", 10);
  const batch = toResearch.slice(0, batchSize);
  console.log(`Processing batch of ${batch.length} clusters...\n`);

  for (const cluster of batch) {
    try {
      const dossier = await researchCluster(cluster);

      // Save dossier
      const dossierPath = path.join(RESEARCH_DIR, `${cluster.slug}.json`);
      fs.mkdirSync(RESEARCH_DIR, { recursive: true });
      fs.writeFileSync(dossierPath, JSON.stringify(dossier, null, 2));
      console.log(`  Saved dossier: ${dossierPath}`);

      // Update cluster status
      cluster.status = "researched";

      // Save updated keywords
      fs.writeFileSync(KEYWORDS_PATH, JSON.stringify(clusters, null, 2));

      await sleep(2000); // Pause between clusters
    } catch (err) {
      console.error(`  Error researching "${cluster.primaryKeyword}":`, err);
    }
  }

  const researched = clusters.filter((c) => c.status === "researched").length;
  console.log(`\nDone! ${researched}/${clusters.length} clusters researched.`);
}

main().catch(console.error);
```

- [ ] **Step 2: Commit**

```bash
git add landing/scripts/seo-engine/src/research.ts
git commit -m "feat(seo-engine): add deep research command"
```

---

## Task 15: Writing Templates

**Files:**
- Create: `landing/scripts/seo-engine/src/lib/templates/blog.ts`
- Create: `landing/scripts/seo-engine/src/lib/templates/faq.ts`
- Create: `landing/scripts/seo-engine/src/lib/templates/guide.ts`
- Create: `landing/scripts/seo-engine/src/lib/templates/glossary.ts`

- [ ] **Step 1: Create blog template**

Create `landing/scripts/seo-engine/src/lib/templates/blog.ts`:

```typescript
import type { ResearchDossier } from "../types.js";

export function blogTemplate(dossier: ResearchDossier): string {
  const facts = dossier.synthesizedFacts
    .slice(0, 10)
    .map((f) => `- ${f.fact} (confidence: ${f.confidence}, sources: ${f.sources.join(", ")})`)
    .join("\n");

  const gaps = dossier.contentGaps.map((g) => `- ${g}`).join("\n");
  const headings = dossier.recommendedHeadings.map((h) => `- ${h}`).join("\n");
  const refs = dossier.medicalReferences.map((r) => `- ${r.title}: ${r.url}`).join("\n");

  return `Write a blog post about "${dossier.primaryKeyword}".

## Structure
1. **Hook** (1-2 sentences) — open with a relatable scenario or surprising fact
2. **The Problem** — what people struggle with regarding ${dossier.primaryKeyword}
3. **The Science** — evidence-based explanation using the research below
4. **Practical Advice** — actionable steps the reader can take today
5. **How Glowlytics Helps** (1-2 sentences) — brief, natural tie-in to our app's skin tracking
6. **Sources** — reference the medical sources naturally in-text

## Target
- 1500-2500 words
- H2 headings for each section, H3 for subsections
- Recommended angle: ${dossier.recommendedAngle}

## Recommended Headings
${headings}

## Key Facts From Research
${facts}

## Content Gaps to Fill (competitors miss these)
${gaps}

## Medical References
${refs}`;
}
```

- [ ] **Step 2: Create FAQ template**

Create `landing/scripts/seo-engine/src/lib/templates/faq.ts`:

```typescript
import type { ResearchDossier } from "../types.js";

export function faqTemplate(dossier: ResearchDossier): string {
  const questions = dossier.serpSnapshot
    .flatMap((s) => s.headings.filter((h) => h.includes("?")))
    .concat(
      dossier.synthesizedFacts
        .filter((f) => f.confidence === "high")
        .map((f) => f.fact)
    );

  const facts = dossier.synthesizedFacts
    .map((f) => `- ${f.fact} (${f.confidence})`)
    .join("\n");

  return `Write an FAQ article about "${dossier.primaryKeyword}".

## Structure
Write 5-8 question-answer pairs. Each answer should:
1. Start with a concise 1-2 sentence direct answer
2. Follow with a paragraph of expanded detail with evidence
3. Include a source citation where applicable

## Format
Use ## for each question (as an H2), followed by the answer as body text.

## Questions to Cover
Use People Also Ask questions as your primary source:
${dossier.synthesizedFacts.length > 0 ? "Adapt and expand based on the research below." : ""}

## Key Facts
${facts}

## Target
- 800-1200 words total
- 5-8 Q&A pairs
- Each answer: 80-150 words
- Medical disclaimer at the end`;
}
```

- [ ] **Step 3: Create guide template**

Create `landing/scripts/seo-engine/src/lib/templates/guide.ts`:

```typescript
import type { ResearchDossier } from "../types.js";

export function guideTemplate(dossier: ResearchDossier): string {
  const facts = dossier.synthesizedFacts
    .map((f) => `- ${f.fact} (${f.confidence})`)
    .join("\n");

  const headings = dossier.recommendedHeadings.map((h) => `- ${h}`).join("\n");
  const refs = dossier.medicalReferences.map((r) => `- ${r.title}: ${r.url}`).join("\n");

  return `Write a step-by-step guide about "${dossier.primaryKeyword}".

## Structure
1. **Introduction** — what this guide covers and who it's for
2. **Steps** — numbered steps (## Step 1: ..., ## Step 2: ..., etc.)
   - Each step has a clear action, why it matters, and specific product/ingredient recommendations where relevant
3. **Pro Tips** — 2-3 advanced tips for better results
4. **Common Mistakes** — 2-3 things to avoid
5. **When to See a Dermatologist** — clear criteria for professional help

## Target
- 1500-2000 words
- 4-7 numbered steps
- Recommended angle: ${dossier.recommendedAngle}

## Recommended Headings
${headings}

## Key Facts
${facts}

## Medical References
${refs}`;
}
```

- [ ] **Step 4: Create glossary template**

Create `landing/scripts/seo-engine/src/lib/templates/glossary.ts`:

```typescript
import type { ResearchDossier } from "../types.js";

export function glossaryTemplate(dossier: ResearchDossier): string {
  const facts = dossier.synthesizedFacts
    .filter((f) => f.confidence !== "low")
    .slice(0, 5)
    .map((f) => `- ${f.fact}`)
    .join("\n");

  return `Write a glossary entry for "${dossier.primaryKeyword}".

## Structure
1. **Definition** (1-2 sentences) — clear, accessible definition
2. **Why It Matters for Skin Health** — explain the relevance in plain language
3. **How It Works** — the science behind it, simplified
4. **How Glowlytics Measures This** (if applicable) — brief mention if it maps to one of our 5 skin signals: structure, hydration, inflammation, sun damage, elasticity
5. **Related Terms** — 3-5 related glossary terms (just list them, they'll be auto-linked)

## Target
- 400-800 words
- Grade 8 reading level
- No jargon without explanation

## Key Facts
${facts}`;
}
```

- [ ] **Step 5: Commit**

```bash
git add landing/scripts/seo-engine/src/lib/templates/
git commit -m "feat(seo-engine): add content writing templates — blog, FAQ, guide, glossary"
```

---

## Task 16: Quality Checks and Write Command

**Files:**
- Create: `landing/scripts/seo-engine/src/lib/quality.ts`
- Create: `landing/scripts/seo-engine/src/write.ts`

- [ ] **Step 1: Create quality checks**

Create `landing/scripts/seo-engine/src/lib/quality.ts`:

```typescript
import type { ContentType, ContentFrontmatter } from "./types.js";

interface QualityResult {
  pass: boolean;
  issues: string[];
}

const WORD_COUNT_RANGES: Record<ContentType, [number, number]> = {
  blog: [1500, 2500],
  faq: [800, 1200],
  guide: [1500, 2000],
  glossary: [400, 800],
};

export function checkQuality(
  content: string,
  frontmatter: ContentFrontmatter
): QualityResult {
  const issues: string[] = [];
  const words = content.split(/\s+/).length;
  const [min, max] = WORD_COUNT_RANGES[frontmatter.type];

  // Word count check (allow 20% tolerance)
  if (words < min * 0.8) {
    issues.push(`Word count too low: ${words} (target: ${min}-${max})`);
  }
  if (words > max * 1.2) {
    issues.push(`Word count too high: ${words} (target: ${min}-${max})`);
  }

  // Primary keyword in title
  const primaryKw = frontmatter.keywords[0]?.toLowerCase() || "";
  if (primaryKw && !frontmatter.title.toLowerCase().includes(primaryKw)) {
    issues.push(`Primary keyword "${primaryKw}" not found in title`);
  }

  // Primary keyword in first 100 words
  const first100 = content.split(/\s+/).slice(0, 100).join(" ").toLowerCase();
  if (primaryKw && !first100.includes(primaryKw)) {
    issues.push(`Primary keyword "${primaryKw}" not found in first 100 words`);
  }

  // At least 2 sources
  if (frontmatter.sources.length < 2) {
    issues.push(`Only ${frontmatter.sources.length} sources (minimum 2)`);
  }

  return {
    pass: issues.length === 0,
    issues,
  };
}
```

- [ ] **Step 2: Create write command**

Create `landing/scripts/seo-engine/src/write.ts`:

```typescript
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

      // Load research dossier
      const dossierPath = path.join(RESEARCH_DIR, `${cluster.slug}.json`);
      if (!fs.existsSync(dossierPath)) {
        console.warn(`  No dossier found at ${dossierPath}, skipping.`);
        continue;
      }
      const dossier: ResearchDossier = JSON.parse(fs.readFileSync(dossierPath, "utf-8"));

      // Check if content already exists
      const contentDir = getContentDir(cluster.contentType);
      const contentPath = path.join(contentDir, `${cluster.slug}.mdx`);
      if (fs.existsSync(contentPath)) {
        console.log(`  Content already exists at ${contentPath}, skipping.`);
        continue;
      }

      // Generate template
      const template = getTemplate(cluster.contentType, dossier);

      // Write with AI
      console.log("  Generating content with AI...");
      const articleContent = await aiWrite(
        template,
        JSON.stringify(dossier, null, 2),
        cluster.primaryKeyword
      );

      // Build frontmatter
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

      // Quality check
      const quality = checkQuality(articleContent, frontmatter);
      if (!quality.pass) {
        console.warn(`  Quality issues: ${quality.issues.join("; ")}`);
        console.log("  Saving anyway as draft (issues noted).");
      }

      // Build MDX file
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

      // Save
      fs.mkdirSync(contentDir, { recursive: true });
      fs.writeFileSync(contentPath, mdxContent);
      console.log(`  Saved: ${contentPath}`);

      // Update cluster status
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
```

- [ ] **Step 3: Commit**

```bash
git add landing/scripts/seo-engine/src/lib/quality.ts landing/scripts/seo-engine/src/write.ts
git commit -m "feat(seo-engine): add content writing command with quality checks"
```

---

## Task 17: Review Dashboard

**Files:**
- Create: `landing/scripts/seo-engine/src/review.ts`
- Create: `landing/scripts/seo-engine/review-ui/index.html`
- Create: `landing/scripts/seo-engine/review-ui/src/App.tsx`
- Create: `landing/scripts/seo-engine/review-ui/src/api.ts`

- [ ] **Step 1: Create review server**

Create `landing/scripts/seo-engine/src/review.ts`:

```typescript
import fs from "fs";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
import matter from "gray-matter";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(__dirname, "../../../content");
const UI_DIR = path.resolve(__dirname, "../review-ui");

interface DraftInfo {
  slug: string;
  title: string;
  type: string;
  status: string;
  wordCount: number;
  dateGenerated: string;
  keywords: string[];
  filePath: string;
  content: string;
}

function getAllDrafts(): DraftInfo[] {
  const drafts: DraftInfo[] = [];
  const dirs = ["blog", "faq", "guides", "glossary"];

  for (const dir of dirs) {
    const fullDir = path.join(CONTENT_DIR, dir);
    if (!fs.existsSync(fullDir)) continue;

    const files = fs.readdirSync(fullDir).filter((f) => f.endsWith(".mdx"));
    for (const file of files) {
      const filePath = path.join(fullDir, file);
      const raw = fs.readFileSync(filePath, "utf-8");
      const { data, content } = matter(raw);

      drafts.push({
        slug: data.slug || file.replace(".mdx", ""),
        title: data.title || "Untitled",
        type: data.type || dir,
        status: data.status || "draft",
        wordCount: content.split(/\s+/).length,
        dateGenerated: data.dateGenerated || "",
        keywords: data.keywords || [],
        filePath,
        content,
      });
    }
  }

  return drafts;
}

function updateStatus(filePath: string, newStatus: string): void {
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);
  data.status = newStatus;
  if (newStatus === "approved") {
    data.dateModified = new Date().toISOString().split("T")[0];
  }
  const updated = matter.stringify(content, data);
  fs.writeFileSync(filePath, updated);
}

function handleAPI(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const url = new URL(req.url || "/", `http://localhost`);

  if (url.pathname === "/api/drafts" && req.method === "GET") {
    const filter = url.searchParams.get("status") || undefined;
    let drafts = getAllDrafts();
    if (filter) drafts = drafts.filter((d) => d.status === filter);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(drafts.map(({ content, filePath, ...rest }) => rest)));
    return true;
  }

  if (url.pathname === "/api/draft" && req.method === "GET") {
    const slug = url.searchParams.get("slug");
    const drafts = getAllDrafts();
    const draft = drafts.find((d) => d.slug === slug);
    if (!draft) {
      res.writeHead(404);
      res.end("Not found");
      return true;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(draft));
    return true;
  }

  if (url.pathname === "/api/approve" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const { slug } = JSON.parse(body);
      const drafts = getAllDrafts();
      const draft = drafts.find((d) => d.slug === slug);
      if (draft) {
        updateStatus(draft.filePath, "approved");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });
    return true;
  }

  if (url.pathname === "/api/reject" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const { slug } = JSON.parse(body);
      const drafts = getAllDrafts();
      const draft = drafts.find((d) => d.slug === slug);
      if (draft) {
        updateStatus(draft.filePath, "rejected");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });
    return true;
  }

  return false;
}

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Glowlytics SEO — Review Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, sans-serif; background: #0a0f1a; color: #e0e0e0; padding: 24px; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .subtitle { color: #7a8a9a; margin-bottom: 24px; font-size: 14px; }
    .filters { display: flex; gap: 8px; margin-bottom: 20px; }
    .filters button { padding: 6px 14px; border-radius: 8px; border: 1px solid #2a3a4a; background: transparent; color: #a0b0c0; cursor: pointer; font-size: 13px; }
    .filters button.active { background: #1a3a4a; color: #7DE7E1; border-color: #7DE7E1; }
    .grid { display: grid; gap: 12px; }
    .card { background: #111a2a; border: 1px solid #1a2a3a; border-radius: 12px; padding: 16px; cursor: pointer; transition: border-color 0.2s; }
    .card:hover { border-color: #3a5a6a; }
    .card-header { display: flex; justify-content: space-between; align-items: center; }
    .card-type { font-size: 11px; text-transform: uppercase; color: #7DE7E1; font-weight: 600; letter-spacing: 0.5px; }
    .card-status { font-size: 11px; padding: 2px 8px; border-radius: 6px; }
    .card-status.draft { background: #2a2a1a; color: #e8c84c; }
    .card-status.approved { background: #1a2a1a; color: #4ce84c; }
    .card-status.rejected { background: #2a1a1a; color: #e84c4c; }
    .card h3 { font-size: 15px; margin: 8px 0 4px; }
    .card-meta { font-size: 12px; color: #5a6a7a; }
    .detail { position: fixed; top: 0; right: 0; bottom: 0; width: 60%; background: #0d1520; border-left: 1px solid #1a2a3a; padding: 24px; overflow-y: auto; display: none; }
    .detail.open { display: block; }
    .detail h2 { font-size: 20px; margin-bottom: 12px; }
    .detail-actions { display: flex; gap: 8px; margin-bottom: 20px; }
    .detail-actions button { padding: 8px 20px; border-radius: 8px; border: none; cursor: pointer; font-weight: 600; font-size: 13px; }
    .btn-approve { background: #1a3a2a; color: #4ce84c; }
    .btn-reject { background: #3a1a1a; color: #e84c4c; }
    .btn-close { background: #1a2a3a; color: #a0b0c0; }
    .content-preview { background: #080e18; border-radius: 8px; padding: 16px; font-size: 14px; line-height: 1.7; white-space: pre-wrap; max-height: 70vh; overflow-y: auto; }
    .empty { text-align: center; padding: 60px; color: #4a5a6a; }
  </style>
</head>
<body>
  <h1>SEO Review Dashboard</h1>
  <p class="subtitle">Review generated content before publishing</p>
  <div class="filters" id="filters"></div>
  <div class="grid" id="grid"></div>
  <div class="detail" id="detail"></div>
  <script>
    let currentFilter = 'all';
    let drafts = [];

    async function loadDrafts() {
      const statusParam = currentFilter === 'all' ? '' : '?status=' + currentFilter;
      const res = await fetch('/api/drafts' + statusParam);
      drafts = await res.json();
      renderGrid();
    }

    function renderFilters() {
      const f = document.getElementById('filters');
      ['all', 'draft', 'approved', 'rejected'].forEach(s => {
        const btn = document.createElement('button');
        btn.textContent = s.charAt(0).toUpperCase() + s.slice(1);
        btn.className = s === currentFilter ? 'active' : '';
        btn.onclick = () => { currentFilter = s; loadDrafts(); renderFilters(); };
        f.appendChild(btn);
      });
    }

    function renderGrid() {
      const g = document.getElementById('grid');
      g.innerHTML = '';
      if (drafts.length === 0) {
        g.innerHTML = '<div class="empty">No content found. Run the SEO pipeline first.</div>';
        return;
      }
      drafts.forEach(d => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = '<div class="card-header"><span class="card-type">' + d.type + '</span><span class="card-status ' + d.status + '">' + d.status + '</span></div><h3>' + d.title + '</h3><div class="card-meta">' + d.wordCount + ' words &middot; ' + d.dateGenerated + ' &middot; ' + (d.keywords || []).slice(0, 3).join(', ') + '</div>';
        card.onclick = () => openDetail(d.slug);
        g.appendChild(card);
      });
    }

    async function openDetail(slug) {
      const res = await fetch('/api/draft?slug=' + slug);
      const d = await res.json();
      const det = document.getElementById('detail');
      det.className = 'detail open';
      det.innerHTML = '<div class="detail-actions"><button class="btn-approve" onclick="approve(\\'' + slug + '\\')">Approve</button><button class="btn-reject" onclick="reject(\\'' + slug + '\\')">Reject</button><button class="btn-close" onclick="closeDetail()">Close</button></div><h2>' + d.title + '</h2><div class="content-preview">' + d.content.replace(/</g, '&lt;') + '</div>';
    }

    function closeDetail() { document.getElementById('detail').className = 'detail'; }

    async function approve(slug) {
      await fetch('/api/approve', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({slug}) });
      closeDetail();
      loadDrafts();
    }

    async function reject(slug) {
      await fetch('/api/reject', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({slug}) });
      closeDetail();
      loadDrafts();
    }

    renderFilters();
    loadDrafts();
  </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // API routes
  if (handleAPI(req, res)) return;

  // Serve dashboard
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(DASHBOARD_HTML);
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`\n  Review dashboard running at http://localhost:${PORT}\n`);
  console.log("  Open in your browser to review content drafts.\n");
});
```

- [ ] **Step 2: Verify review dashboard starts**

```bash
cd landing && npm run seo:review
```

Expected: Server starts on `localhost:3001`. Opening in browser shows empty dashboard with "No content found" message.

- [ ] **Step 3: Commit**

```bash
git add landing/scripts/seo-engine/src/review.ts
git commit -m "feat(seo-engine): add review dashboard with approve/reject workflow"
```

---

## Task 18: Refresh Command

**Files:**
- Create: `landing/scripts/seo-engine/src/refresh.ts`

- [ ] **Step 1: Create refresh command**

Create `landing/scripts/seo-engine/src/refresh.ts`:

```typescript
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import matter from "gray-matter";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(__dirname, "../../../content");
const KEYWORDS_PATH = path.resolve(__dirname, "../../../data/keywords.json");

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

  if (staleItems.length === 0) {
    console.log("No stale content found. Everything is fresh!");
    return;
  }

  console.log(`Found ${staleItems.length} stale articles:\n`);
  staleItems
    .sort((a, b) => b.age - a.age)
    .forEach((item) => {
      console.log(`  [${item.age}d old] ${item.type}/${item.slug}`);
    });

  // Reset their keyword cluster status to "new" so they get re-researched
  const clusters = JSON.parse(fs.readFileSync(KEYWORDS_PATH, "utf-8"));
  let resetCount = 0;
  for (const item of staleItems) {
    const cluster = clusters.find((c: { slug: string }) => c.slug === item.slug);
    if (cluster) {
      cluster.status = "new";
      resetCount++;
    }
  }

  if (resetCount > 0) {
    fs.writeFileSync(KEYWORDS_PATH, JSON.stringify(clusters, null, 2));
    console.log(`\nReset ${resetCount} keyword clusters to "new" status.`);
    console.log("Run seo:research then seo:write to regenerate fresh content.");
  }
}

main();
```

- [ ] **Step 2: Commit**

```bash
git add landing/scripts/seo-engine/src/refresh.ts
git commit -m "feat(seo-engine): add content freshness check and refresh command"
```

---

## Task 19: End-to-End Integration Test

**Files:**
- Create: `landing/content/blog/test-article.mdx` (temporary, for build verification)

- [ ] **Step 1: Create a test article to verify the full build pipeline**

Create `landing/content/blog/test-article.mdx`:

```mdx
---
title: "What Causes Acne on Your Forehead?"
slug: test-article
description: "Learn about the common causes of forehead acne and evidence-based ways to treat and prevent breakouts."
type: blog
status: approved
keywords:
  - "forehead acne"
  - "forehead breakouts"
dateGenerated: "2026-04-13"
sources:
  - title: "American Academy of Dermatology — Acne"
    url: "https://www.aad.org/public/diseases/acne"
  - title: "Journal of Clinical and Aesthetic Dermatology"
    url: "https://jcadonline.com"
readingTime: 5
schema: Article
relatedSlugs: []
---

Forehead acne is one of the most common skin concerns, affecting people of all ages. Understanding what triggers those stubborn breakouts can help you take control of your skin health.

## Why Does Acne Appear on the Forehead?

The forehead is part of the T-zone, an area with a higher concentration of oil glands. When these glands overproduce sebum, pores can become clogged, leading to breakouts.

## Common Triggers

Several factors contribute to forehead acne:

- **Hair products**: Pomades, gels, and oils can migrate to the forehead
- **Hats and headbands**: Friction and trapped sweat create a breeding ground for bacteria
- **Hormonal changes**: Fluctuations in androgens increase oil production
- **Stress**: Cortisol spikes can trigger excess sebum production

## Evidence-Based Treatments

According to the American Academy of Dermatology, effective treatments include salicylic acid cleansers, benzoyl peroxide spot treatments, and retinoids for persistent acne.

Always consult a dermatologist if your acne is severe or not responding to over-the-counter treatments.

Track your inflammation levels daily with Glowlytics to spot patterns and triggers before breakouts happen.
```

- [ ] **Step 2: Run the Next.js build**

```bash
cd landing && npm run build
```

Expected: Build succeeds, generates static pages including `/blog/test-article`.

- [ ] **Step 3: Start dev server and verify**

```bash
cd landing && npm run dev
```

Visit these URLs and verify:
- `http://localhost:3000` — landing page
- `http://localhost:3000/blog` — blog index shows the test article
- `http://localhost:3000/blog/test-article` — full article with breadcrumbs, structured data, sources, CTA
- `http://localhost:3000/sitemap.xml` — includes the test article URL
- `http://localhost:3000/robots.txt` — allows all crawlers

- [ ] **Step 4: Verify structured data**

View page source on `/blog/test-article`. Confirm presence of:
- `application/ld+json` with `@type: "Article"`
- `application/ld+json` with `@type: "BreadcrumbList"`

- [ ] **Step 5: Remove test article and commit**

```bash
rm landing/content/blog/test-article.mdx
git add -A landing/
git commit -m "feat(landing): verify full build pipeline — site builds with content routes"
```

---

## Task 20: Deploy Configuration

**Files:**
- Modify: `landing/next.config.ts` (if changes needed)

- [ ] **Step 1: Verify static export works**

```bash
cd landing && npm run build
ls -la landing/out/
```

Expected: `out/` directory contains static HTML files for all routes.

- [ ] **Step 2: Test deploy to Cloudflare Pages (preview)**

```bash
cd landing && npx wrangler pages deploy out --project-name=glowlytics
```

Expected: Preview URL deployed. Verify the site works at the preview URL.

- [ ] **Step 3: Commit any config adjustments**

```bash
git add landing/
git commit -m "chore(landing): finalize Cloudflare Pages deploy config"
```
