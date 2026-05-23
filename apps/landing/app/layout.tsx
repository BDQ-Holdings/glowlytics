import type { Metadata } from "next";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://glowlytics.ai"),
  title: {
    default: "Glowlytics | AI Skin Health Tracking Built by Doctors",
    template: "%s | Glowlytics",
  },
  description:
    "Track your skin health daily with AI built by doctors. Understand acne, hydration, sun damage, and aging. Backed by dermatology research.",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://glowlytics.ai",
    siteName: "Glowlytics",
    images: [{ url: "/logo-full.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/png" href="/logo-emblem.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Dancing+Script:wght@500;600;700&family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://api.fontshare.com/v2/css?f[]=switzer@300,400,500,600,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased overflow-x-hidden">
        <Nav />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
