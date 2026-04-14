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
