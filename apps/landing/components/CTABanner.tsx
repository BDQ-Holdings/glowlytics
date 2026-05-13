const APP_STORE_URL = "https://apps.apple.com/app/glowlytics/id6760600635";

export default function CTABanner({ signal }: { signal?: string }) {
  const title = signal
    ? `Track your ${signal} trend with Glowlytics`
    : "Track your skin health daily with Glowlytics";

  return (
    <section className="mt-12 overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(135deg,rgba(125,231,225,0.12),rgba(138,111,232,0.12))] px-6 py-7">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="max-w-[540px]">
          <div className="page-kicker">Glowlytics App</div>
          <h2 className="m-0 text-[clamp(1.7rem,3vw,2.4rem)] font-bold leading-[1.02] tracking-[-0.04em]">
            {title}
          </h2>
          <p className="mt-3 text-sm leading-7 text-white/62 md:text-base">
            Download the iPhone app, scan in seconds, and start your 7-day free trial.
            The goal is simple: replace skincare guesswork with measurable trends.
          </p>
        </div>
        <div className="flex flex-col gap-3 md:items-end">
          <a
            href={APP_STORE_URL}
            className="inline-flex items-center justify-center rounded-full bg-teal px-5 py-3 text-sm font-semibold text-bg-deep transition-transform hover:-translate-y-0.5"
          >
            Download on the App Store
          </a>
          <span className="text-xs font-medium tracking-[0.08em] text-white/42 uppercase">
            iOS only • Photos never stored
          </span>
        </div>
      </div>
    </section>
  );
}
