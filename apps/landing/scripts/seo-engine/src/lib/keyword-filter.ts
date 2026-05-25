/**
 * Keyword normalization + banned-pattern filtering.
 *
 * The pattern list lives in `data/banned-keywords.json` so non-engineers
 * (and future engineers spotting noise in a discovery run) can update it
 * without touching code.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BANNED_KEYWORDS_PATH = path.resolve(__dirname, "../../../../data/banned-keywords.json");

interface BannedKeywordsFile {
  patterns: string[];
}

let cachedPatterns: RegExp[] | null = null;

function loadBannedPatterns(): RegExp[] {
  if (cachedPatterns) return cachedPatterns;

  const patterns: RegExp[] = [];

  if (fs.existsSync(BANNED_KEYWORDS_PATH)) {
    try {
      const raw = fs.readFileSync(BANNED_KEYWORDS_PATH, "utf-8");
      const parsed = JSON.parse(raw) as BannedKeywordsFile;
      for (const source of parsed.patterns || []) {
        try {
          patterns.push(new RegExp(source, "i"));
        } catch (err) {
          console.warn(`[keyword-filter] Skipping invalid pattern ${JSON.stringify(source)}: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      console.warn(`[keyword-filter] Failed to load ${BANNED_KEYWORDS_PATH}: ${(err as Error).message}`);
    }
  }

  cachedPatterns = patterns;
  return patterns;
}

export function normalizeKeyword(keyword: string): string {
  return keyword
    .toLowerCase()
    // Fold smart quotes to ASCII apostrophe so "What\u2019s" matches "what's".
    .replace(/[\u2018\u2019]/g, "'")
    // Strip combining diacritics so "acné" → "acne", "café" → "cafe".
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Drop any remaining non-ASCII (other scripts, exotic symbols).
    .replace(/[^\x00-\x7f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isAllowedKeyword(keyword: string): boolean {
  const normalized = normalizeKeyword(keyword);

  if (!normalized) return false;
  if (!/[a-z]/.test(normalized)) return false;
  if (normalized.length < 3 || normalized.length > 80) return false;

  const words = normalized.split(/\s+/);
  if (words.length > 8) return false;

  for (const pattern of loadBannedPatterns()) {
    if (pattern.test(normalized)) return false;
  }

  return true;
}

export function filterKeywords(keywords: string[]): string[] {
  return [...new Set(keywords.map(normalizeKeyword).filter(isAllowedKeyword))];
}

/** Force a re-read of `data/banned-keywords.json` (used by tests). */
export function _resetBannedPatternsCache(): void {
  cachedPatterns = null;
}
