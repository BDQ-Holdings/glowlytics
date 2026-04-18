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
        "bg-deep": "#050a12",
        "bg-dark": "#080e1a",
        "bg-card": "#0c1424",
        teal: "#7DE7E1",
        "teal-dark": "#1BA8A0",
        purple: "#8A6FE8",
        coral: "#FF7A78",
        amber: "#F2B56A",
        blue: "#4DA6FF",
        cream: "#f8f6f1",
        "cream-2": "#f2efe8",
        "warm-white": "#fdfcfa",
        "dark-text": "#0e1e2e",
        "mid-text": "#5a6a78",
        "light-text": "#94a3b3",
      },
      fontFamily: {
        display: ["'Bricolage Grotesque'", "serif"],
        body: ["'Plus Jakarta Sans'", "-apple-system", "sans-serif"],
      },
      borderRadius: {
        xl: "20px",
        "2xl": "28px",
        "3xl": "36px",
      },
    },
  },
  plugins: [],
};

export default config;
