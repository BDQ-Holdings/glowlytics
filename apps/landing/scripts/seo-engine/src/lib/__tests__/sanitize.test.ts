import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeArticleBody } from "../sanitize.js";

describe("sanitizeArticleBody", () => {
  it("removes <script> tags and their contents", () => {
    const out = sanitizeArticleBody("Hello <script>alert(document.cookie)</script> world");
    assert.ok(!/<script/i.test(out));
    assert.ok(!out.includes("alert(document.cookie)"));
    assert.ok(out.includes("Hello"));
    assert.ok(out.includes("world"));
  });

  it("strips dangerous embedded elements (iframe, style, svg)", () => {
    const out = sanitizeArticleBody(
      '<iframe src="//evil"></iframe><style>body{display:none}</style><svg onload="x()"></svg>ok',
    );
    assert.ok(!/<iframe|<style|<svg/i.test(out));
    assert.ok(out.includes("ok"));
  });

  it("strips arbitrary raw HTML/JSX tags but keeps prose", () => {
    const out = sanitizeArticleBody('Click <a href="javascript:alert(1)">here</a> now');
    assert.ok(!out.includes("<a"));
    assert.ok(!/javascript:/i.test(out));
    assert.ok(out.includes("Click"));
    assert.ok(out.includes("here"));
    assert.ok(out.includes("now"));
  });

  it("removes inline event-handler attributes from leftover markup", () => {
    const out = sanitizeArticleBody('<div onclick="steal()">text</div>');
    assert.ok(!/onclick/i.test(out));
    assert.ok(!out.includes("steal()"));
    assert.ok(out.includes("text"));
  });

  it("escapes MDX expression braces in prose", () => {
    const out = sanitizeArticleBody("price is {process.env.SECRET} dollars");
    assert.ok(out.includes("\\{"));
    assert.ok(out.includes("\\}"));
    assert.ok(!/(^|[^\\])\{process/.test(out));
  });

  it("preserves angle-bracket autolinks", () => {
    const out = sanitizeArticleBody("See <https://glowlytics.ai> for more");
    assert.ok(out.includes("<https://glowlytics.ai>"));
  });

  it("leaves braces and tags inside code spans untouched", () => {
    const fenced = "```ts\nconst x = { a: 1 };\nconst el = <div/>;\n```";
    const out = sanitizeArticleBody(fenced);
    assert.ok(out.includes("{ a: 1 }"));
    assert.ok(out.includes("<div/>"));
    assert.ok(!out.includes("\\{"));

    const inline = "use `{ key: value }` syntax";
    assert.equal(sanitizeArticleBody(inline), inline);
  });

  it("leaves clean markdown prose unchanged", () => {
    const clean = "# Title\n\nThis is **bold** and a [link](https://example.com).";
    assert.equal(sanitizeArticleBody(clean), clean);
  });
});
