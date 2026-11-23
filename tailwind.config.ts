import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        edge: {
          bg: "#050608",
          surface: {
            DEFAULT: "#0A0D12",
            secondary: "#10151D",
            tertiary: "#161D27",
            glass: "rgba(10, 13, 18, 0.75)",
            glassDark: "rgba(5, 6, 8, 0.85)"
          },
          border: {
            subtle: "#18202C",
            DEFAULT: "#202A3A",
            strong: "#2B384E"
          },
          text: {
            primary: "#FFFFFF",
            secondary: "#8B9BB4",
            muted: "#5A687D"
          },
          accent: {
            DEFAULT: "#D99B26",
            light: "#E5A93C",
            dark: "#B37D18",
            subtle: "rgba(217, 155, 38, 0.12)"
          },
          profit: {
            DEFAULT: "#10B981",
            light: "#34D399",
            subtle: "rgba(16, 185, 129, 0.12)"
          },
          loss: {
            DEFAULT: "#EF4444",
            light: "#F87171",
            subtle: "rgba(239, 68, 68, 0.12)"
          },
          warning: {
            DEFAULT: "#F59E0B",
            subtle: "rgba(245, 158, 11, 0.12)"
          }
        }
      },
      fontFamily: {
        sans: ["'IBM Plex Sans'", "system-ui", "-apple-system", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      boxShadow: {
        terminal: "0 4px 20px -2px rgba(0, 0, 0, 0.7)",
        subtle: "0 1px 3px 0 rgba(0, 0, 0, 0.4)",
        glow: "0 0 15px -3px rgba(217, 155, 38, 0.2)",
      }
    },
  },
  plugins: [],
};

export default config;
