const BANNED_PATTERNS = [
  /\breddit\b/i,
  /\bquora\b/i,
  /\bnear me\b/i,
  /\bmeme\b/i,
  /\bemoji\b/i,
  /\bgif\b/i,
  /\bdraw(?:ing)?\b/i,
  /\bquote(?:s)?\b/i,
  /\bimage(?:s)?\b/i,
  /\bvideo\b/i,
  /\byoutube\b/i,
  /\btiktok\b/i,
  /\bzoom(?:ed)?\b/i,
  /\bolive young\b/i,
  /\bin spanish\b/i,
  /\bke liye\b/i,
  /\ber jonno\b/i,
  /\bgharelu\b/i,
  /\bkya\b/i,
  /\bkaren\b/i,
  /\bdog(?:s)?\b/i,
  /\bcat(?:s)?\b/i,
  /\bpet(?:s)?\b/i,
  /\bicd[-\s]?10\b/i,
  /\bcode\b/i,
  /\busa meme\b/i,
  /\bnano brows\b/i,
  /\besthetician\b/i,
  /\bdoctor near me\b/i,
  /\bclinic near me\b/i,
  /\bprice\b/i,
  /\bcost\b/i,
  /\bpakistan\b/i,
  /\bknee\b/i,
  /\binjection(?:s)?\b/i,
  /\bweathering\b/i,
  /\baddison'?s\b/i,
  /\bjan aushadhi\b/i,
  /\bsymptom of\b/i,
  /\bla roche posay\b/i,
  /\bcerave\b/i,
  /\bcetaphil\b/i,
  /\bthe ordinary\b/i,
  /\bgood molecules\b/i,
  /\bzoryve\b/i,
];

export function normalizeKeyword(keyword: string): string {
  return keyword
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
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

  for (const pattern of BANNED_PATTERNS) {
    if (pattern.test(normalized)) return false;
  }

  return true;
}

export function filterKeywords(keywords: string[]): string[] {
  return [...new Set(keywords.map(normalizeKeyword).filter(isAllowedKeyword))];
}
