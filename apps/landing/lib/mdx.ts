import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

// Sanitize the HTML produced from (AI-generated / scraped-derived) MDX as a
// render-time backstop to the write-time stripping in the SEO engine. We run it
// AFTER rehype-slug / rehype-autolink-headings and extend the default
// (GitHub-grade) schema so their trusted output survives: permit the heading
// `id` and the autolink anchor's accessibility attributes, and disable id/name
// clobbering so the generated `#slug` anchors keep matching their heading ids.
const sanitizeSchema = {
  ...defaultSchema,
  clobber: [],
  attributes: {
    ...defaultSchema.attributes,
    "*": [
      ...(defaultSchema.attributes?.["*"] ?? []),
      "id",
      "className",
      "ariaHidden",
      "tabIndex",
    ],
    a: [...(defaultSchema.attributes?.a ?? []), "ariaHidden", "tabIndex", "className"],
  },
};

export async function renderMdx(source: string) {
  const { content } = await compileMDX({
    source,
    options: {
      mdxOptions: {
        remarkPlugins: [remarkGfm],
        rehypePlugins: [rehypeSlug, rehypeAutolinkHeadings, [rehypeSanitize, sanitizeSchema]],
      },
    },
  });
  return content;
}
