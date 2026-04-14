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

  if (words < min * 0.8) {
    issues.push(`Word count too low: ${words} (target: ${min}-${max})`);
  }
  if (words > max * 1.2) {
    issues.push(`Word count too high: ${words} (target: ${min}-${max})`);
  }

  const primaryKw = frontmatter.keywords[0]?.toLowerCase() || "";
  if (primaryKw && !frontmatter.title.toLowerCase().includes(primaryKw)) {
    issues.push(`Primary keyword "${primaryKw}" not found in title`);
  }

  const first100 = content.split(/\s+/).slice(0, 100).join(" ").toLowerCase();
  if (primaryKw && !first100.includes(primaryKw)) {
    issues.push(`Primary keyword "${primaryKw}" not found in first 100 words`);
  }

  if (frontmatter.sources.length < 2) {
    issues.push(`Only ${frontmatter.sources.length} sources (minimum 2)`);
  }

  return {
    pass: issues.length === 0,
    issues,
  };
}
