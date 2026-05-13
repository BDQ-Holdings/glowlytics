export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePositiveEnvInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getFetchTimeoutMs(): number {
  return parsePositiveEnvInt(process.env.SEO_FETCH_TIMEOUT_MS, 15000);
}

export function getAiTimeoutMs(): number {
  return parsePositiveEnvInt(process.env.SEO_AI_TIMEOUT_MS, 90000);
}

function getFormatterOptions(timeZone?: string): Intl.DateTimeFormatOptions {
  return timeZone
    ? { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }
    : { year: "numeric", month: "2-digit", day: "2-digit" };
}

export function getCurrentDateString(date: Date = new Date()): string {
  const timeZone = process.env.SEO_TIMEZONE?.trim();
  const formatter = new Intl.DateTimeFormat("en-CA", getFormatterOptions(timeZone || undefined));
  return formatter.format(date);
}

export function getCurrentDateTimeParts(date: Date = new Date()): {
  date: string;
  time: string;
} {
  const timeZone = process.env.SEO_TIMEZONE?.trim();
  const dateFormatter = new Intl.DateTimeFormat("en-CA", getFormatterOptions(timeZone || undefined));
  const timeFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timeZone || undefined,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return {
    date: dateFormatter.format(date),
    time: timeFormatter.format(date).replace(/:/g, ""),
  };
}

export function getTargetSlugSet(): Set<string> | null {
  const raw = process.env.TARGET_SLUGS?.trim();
  if (!raw) return null;

  const slugs = raw
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean);

  return slugs.length > 0 ? new Set(slugs) : null;
}

export function filterByTargetSlugs<T extends { slug: string }>(items: T[]): T[] {
  const targetSlugs = getTargetSlugSet();
  if (!targetSlugs) return items;
  return items.filter((item) => targetSlugs.has(item.slug));
}

export function parseJsonResponse<T>(text: string): T {
  const trimmed = text.trim();
  const attempts = [trimmed];

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) attempts.push(fencedMatch[1].trim());

  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) attempts.push(objectMatch[0]);

  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrayMatch?.[0]) attempts.push(arrayMatch[0]);

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Try the next extraction.
    }
  }

  throw new Error(`Failed to parse JSON response: ${trimmed.slice(0, 400)}`);
}
