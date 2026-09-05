/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
      },
      colors: {
        // Workshop-dark chrome (sidebar, headers on dark)
        graphite: {
          900: "#14171C",
          800: "#1B1F27",
          700: "#242A35",
          600: "#333B49",
          400: "#7A8494",
          200: "#DDE1E6",
        },
        // Primary accent: EV charge-green
        signal: {
          50: "#EAFBF1",
          100: "#CFF5DD",
          400: "#2FD673",
          500: "#22B85F",
          600: "#1A9A4D",
        },
        // Reserved for live/recording/energy states only
        amber: {
          50: "#FFF6E5",
          400: "#FFB020",
          500: "#F29A00",
        },
        // Warm-neutral reading canvas
        canvas: "#F7F7F4",
        // Legacy alias so existing brand-* classes keep working
        brand: {
          50: "#EAFBF1",
          100: "#CFF5DD",
          600: "#22B85F",
          700: "#1A9A4D",
        },
      },
    },
  },
  plugins: [],
};
