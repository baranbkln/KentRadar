import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#F7F8FA",
          muted: "#EEF1F4",
          raised: "#FFFFFF",
        },
        ink: {
          DEFAULT: "#17202A",
          muted: "#5D6978",
          subtle: "#8993A0",
        },
        road: {
          blue: "#2563EB",
          green: "#0F9F6E",
          amber: "#D97706",
          red: "#DC2626",
          slate: "#475569",
        },
      },
      boxShadow: {
        panel: "0 12px 32px rgba(23, 32, 42, 0.10)",
      },
    },
  },
  plugins: [],
};

export default config;
