import Link from "next/link";

export default function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 px-[clamp(20px,4vw,48px)] bg-bg-deep/80 backdrop-blur-xl border-b border-white/5">
      <div className="max-w-[1200px] mx-auto flex items-center justify-between h-[72px]">
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/logo-emblem.webp" alt="" width={32} height={32} />
          <span className="font-display text-lg font-bold tracking-tight bg-gradient-to-br from-teal to-purple bg-clip-text text-transparent">
            Glowlytics
          </span>
        </Link>
        <div className="hidden items-center gap-8 md:flex">
          <Link href="/blog" className="text-sm font-medium text-white/55 hover:text-white/90 transition-colors">
            Blog
          </Link>
          <Link href="/guides" className="text-sm font-medium text-white/55 hover:text-white/90 transition-colors">
            Guides
          </Link>
          <Link href="/faq" className="text-sm font-medium text-white/55 hover:text-white/90 transition-colors">
            FAQ
          </Link>
          <Link href="/glossary" className="text-sm font-medium text-white/55 hover:text-white/90 transition-colors">
            Glossary
          </Link>
          <a
            href="https://apps.apple.com/app/glowlytics/id6760600635"
            className="text-sm font-semibold px-5 py-2 rounded-full bg-teal/10 text-teal border border-teal/20 hover:bg-teal/20 transition-colors"
          >
            Download
          </a>
        </div>
        <a
          href="https://apps.apple.com/app/glowlytics/id6760600635"
          className="text-sm font-semibold px-4 py-2 rounded-full bg-teal/10 text-teal border border-teal/20 transition-colors md:hidden"
        >
          App Store
        </a>
      </div>
    </nav>
  );
}
