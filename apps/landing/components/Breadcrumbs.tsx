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
      <nav aria-label="Breadcrumb" className="breadcrumbs">
        {items.map((item, index) => (
          <span key={`${item.label}-${index}`} className="breadcrumbs-item">
            {index > 0 ? <span className="breadcrumbs-sep">/</span> : null}
            {item.href ? (
              <Link href={item.href} className="breadcrumbs-link">
                {item.label}
              </Link>
            ) : (
              <span className="breadcrumbs-current">{item.label}</span>
            )}
          </span>
        ))}

        <style>{`
          .breadcrumbs {
            margin-bottom: 28px;
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 10px;
            font-family: ui-monospace, "SF Mono", monospace;
            font-size: 11px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--muted);
          }
          .breadcrumbs-item {
            display: inline-flex;
            align-items: center;
            gap: 10px;
          }
          .breadcrumbs-sep {
            color: var(--accent2);
          }
          .breadcrumbs-link {
            color: var(--muted);
            transition: color 160ms var(--ease-out);
          }
          .breadcrumbs-link:hover {
            color: var(--ink);
          }
          .breadcrumbs-current {
            color: var(--ink);
          }
        `}</style>
      </nav>
    </>
  );
}
