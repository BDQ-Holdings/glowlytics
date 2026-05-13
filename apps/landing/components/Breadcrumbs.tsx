import Link from "next/link";
import { getTypeLabel, getTypePath } from "@/lib/content";
import type { ContentType } from "@/lib/types";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export default function Breadcrumbs({
  type,
  title,
}: {
  type: ContentType;
  title: string;
}) {
  const items: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    { label: getTypeLabel(type), href: `/${getTypePath(type)}` },
    { label: title },
  ];

  const schemaData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: item.href ? `https://glowlytics.ai${item.href}` : undefined,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }}
      />
      <nav
        aria-label="Breadcrumb"
        className="mb-6 flex flex-wrap items-center gap-2 text-sm text-white/40"
      >
        {items.map((item, index) => (
          <span key={`${item.label}-${index}`} className="flex items-center gap-2">
            {index > 0 ? <span className="text-white/18">/</span> : null}
            {item.href ? (
              <Link href={item.href} className="transition-colors hover:text-white/75">
                {item.label}
              </Link>
            ) : (
              <span className="text-white/65">{item.label}</span>
            )}
          </span>
        ))}
      </nav>
    </>
  );
}
