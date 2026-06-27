/**
 * Serialize an object for embedding in a `<script type="application/ld+json">`
 * tag via `dangerouslySetInnerHTML`.
 *
 * `JSON.stringify` alone is unsafe here: attacker-influenced string values
 * (article titles, FAQ answers, scraped/AI content) can contain `</script>` or
 * other HTML-significant characters that would break out of the script element
 * and inject markup. We escape the characters that are meaningful to the HTML
 * parser (`<`, `>`, `&`) plus the JS line separators U+2028/U+2029 using their
 * `\uXXXX` JSON escapes, which are valid inside JSON string literals and so
 * round-trip cleanly when the browser parses the ld+json block.
 */
export function safeJsonLd(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
