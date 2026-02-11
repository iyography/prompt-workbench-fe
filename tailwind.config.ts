import type { Config } from "tailwindcss";

const defaultTheme = require("tailwindcss/defaultTheme");

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  safelist: [{ pattern: /w-./ }],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Noto Sans'", "var(--font-circular-std)", ...defaultTheme.fontFamily.sans],
        serif: ["'Playfair Display'", ...defaultTheme.fontFamily.serif],
      },
      colors: {
        ...defaultTheme.colors,
        // Narrative Brand Colors
        "narrative-green": "#008B68",
        "narrative-mid-green": "#00663D",
        "narrative-dark-green": "#042623",
        "narrative-purple": "#6C75F1",
        "narrative-cream": "#F8F5F3",
        "narrative-charcoal": "#262529",
        // Semantic colors using brand palette
        primary: "#262529", // Charcoal for text
        secondary: "#808080", // Keep for secondary text
        accent: "#008B68", // Narrative Green for accents
        link: "#008B68", // Use brand green for links
        // Legacy colors for compatibility
        "main-blue-inner": "#6C75F1", // Map to brand purple
        "main-blue-outer": "#008B68", // Map to brand green
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
};
export default config;
