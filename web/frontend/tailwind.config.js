/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        zinc: {
          850: "#1f1f22", // between 800/900 — subtle rails & dividers
          950: "#0a0a0b",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      // 10px is the standard corner radius across the app.
      borderRadius: {
        md: "10px",
        lg: "10px",
        xl: "10px",
        "2xl": "10px",
      },
    },
  },
  plugins: [],
};
