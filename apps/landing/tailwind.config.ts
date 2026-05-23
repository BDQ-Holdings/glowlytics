import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx,mdx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./content/**/*.mdx",
  ],
  theme: {
    extend: {
      colors: {
        // Dusk palette (editorial)
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        ink: "var(--ink)",
        "ink-soft": "var(--ink-soft)",
        muted: "var(--muted)",
        accent: "var(--accent)",
        accent2: "var(--accent2)",
        glow: "var(--glow)",
        hairline: "var(--hairline)",

        // Legacy aliases — mapped to dusk so any unmigrated component stays on-theme
        "bg-deep": "var(--bg)",
        "bg-dark": "var(--bg)",
        "bg-card": "var(--surface)",
        teal: "var(--accent)",
        "teal-dark": "var(--accent)",
        purple: "var(--accent)",
        coral: "#A14A55",
        amber: "#C9B786",
        blue: "#6B8799",
        cream: "var(--surface)",
        "cream-2": "var(--bg)",
        "warm-white": "#FDF9F4",
        "dark-text": "var(--ink)",
        "mid-text": "var(--muted)",
        "light-text": "var(--muted)",
      },
      fontFamily: {
        display: ["'Instrument Serif'", "Georgia", "serif"],
        body: ["'Switzer'", "-apple-system", "sans-serif"],
        script: ["'Dancing Script'", "cursive"],
      },
      borderRadius: {
        xl: "18px",
        "2xl": "22px",
        "3xl": "32px",
      },
    },
  },
  plugins: [],
};

export default config;
