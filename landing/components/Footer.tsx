import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-white/5 py-12 px-[clamp(20px,4vw,48px)]">
      <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row justify-between gap-8">
        <div>
          <span className="font-display text-lg font-bold bg-gradient-to-br from-teal to-purple bg-clip-text text-transparent">
            Glowlytics
          </span>
          <p className="text-sm text-white/40 mt-2">AI skin health tracking built by doctors.</p>
          <p className="text-xs text-white/25 mt-4">&copy; {new Date().getFullYear()} BDQ Holdings LLC</p>
        </div>
        <div className="flex gap-12">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-white/30 uppercase tracking-wider">Learn</span>
            <Link href="/blog" className="text-sm text-white/50 hover:text-white/80">Blog</Link>
            <Link href="/guides" className="text-sm text-white/50 hover:text-white/80">Guides</Link>
            <Link href="/faq" className="text-sm text-white/50 hover:text-white/80">FAQ</Link>
            <Link href="/glossary" className="text-sm text-white/50 hover:text-white/80">Glossary</Link>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-white/30 uppercase tracking-wider">Legal</span>
            <Link href="/privacy" className="text-sm text-white/50 hover:text-white/80">Privacy</Link>
            <Link href="/terms" className="text-sm text-white/50 hover:text-white/80">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
