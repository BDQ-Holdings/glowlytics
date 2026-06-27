/**
 * Write-time sanitization for LLM-generated article bodies.
 *
 * The bodies are persisted as `.mdx` and compiled at build time, so a raw
 * `<script>`/`<iframe>` tag or an MDX `{expression}` in the body would be
 * executed/evaluated during `next build` (XSS / build-time RCE). This is the
 * primary defense; rehype-sanitize in `lib/mdx.ts` is the render-time backstop.
 *
 * Strategy: only standard prose can carry these vectors — inside fenced
 * (```...```) and inline (`...`) code, MDX treats `<>` and `{}` as literal
 * text, so we tokenize the markdown and sanitize only the non-code segments.
 * This kills the vectors while leaving code samples intact.
 */

const DANGEROUS_BLOCK_TAGS = "script|style|iframe|object|embed|svg|math";

function sanitizeProse(text: string): string {
  let out = text;

  // 1. Remove dangerous elements together with their contents.
  out = out.replace(
    new RegExp(`<(${DANGEROUS_BLOCK_TAGS})\\b[^>]*>[\\s\\S]*?<\\/\\1>`, "gi"),
    "",
  );
  // 2. Remove any stray openers/closers of those tags left unbalanced.
  out = out.replace(new RegExp(`<\\/?(${DANGEROUS_BLOCK_TAGS})\\b[^>]*>`, "gi"), "");

  // 3. Strip every remaining raw HTML/JSX tag. Markdown needs none (links use
  //    [text](url)); angle-bracket autolinks <https://...> are exempted so they
  //    keep working.
  out = out.replace(/<(?!https?:\/\/)[a-zA-Z!/][^>]*>/g, "");

  // 4. Defensive scrub of inline event handlers and javascript: URIs in case a
  //    malformed/split tag slipped past the structural strip.
  out = out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  out = out.replace(/javascript:/gi, "");

  // 5. Neutralize MDX expression syntax: `{...}` is a JS expression at compile
  //    time. Escape every brace so it renders as a literal instead.
  out = out.replace(/\{/g, "\\{").replace(/\}/g, "\\}");

  return out;
}

export function sanitizeArticleBody(md: string): string {
  // Split on fenced/inline code spans, keeping the delimiters (odd indices).
  const parts = md.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
  return parts.map((part, i) => (i % 2 === 1 ? part : sanitizeProse(part))).join("");
}
