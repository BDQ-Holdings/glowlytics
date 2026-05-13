import { getFetchTimeoutMs } from "./pipeline.js";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getAutocompleteSuggestions(seed: string): Promise<string[]> {
  const suggestions: Set<string> = new Set();

  const baseSuggestions = await fetchSuggestions(seed);
  baseSuggestions.forEach((s) => suggestions.add(s));

  for (const letter of ALPHABET) {
    await sleep(200);
    const expanded = await fetchSuggestions(`${seed} ${letter}`);
    expanded.forEach((s) => suggestions.add(s));
  }

  return Array.from(suggestions);
}

async function fetchSuggestions(query: string): Promise<string[]> {
  const encoded = encodeURIComponent(query);
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encoded}`;

  try {
    const timeoutMs = getFetchTimeoutMs();
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) return [];

    const data = await res.json();
    if (Array.isArray(data) && Array.isArray(data[1])) {
      return data[1].filter((s: unknown): s is string => typeof s === "string");
    }
    return [];
  } catch {
    return [];
  }
}
