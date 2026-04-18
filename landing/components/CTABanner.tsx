export default function CTABanner({ signal }: { signal?: string }) {
  const text = signal
    ? `Track your ${signal} daily with Glowlytics`
    : "Track your skin health daily with Glowlytics";

  return (
    <div className="mt-12 p-6 rounded-2xl bg-gradient-to-r from-teal/10 to-purple/10 border border-teal/15 text-center">
      <p className="text-white/80 font-medium">{text}</p>
      <a
        href="https://apps.apple.com/app/glowlytics/id6760600635"
        className="inline-block mt-3 px-6 py-2.5 rounded-full bg-teal/15 text-teal font-semibold text-sm border border-teal/25 hover:bg-teal/25 transition-colors"
      >
        Download for iOS
      </a>
    </div>
  );
}
