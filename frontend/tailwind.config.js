/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Core background colors
        void: {
          DEFAULT: "#F8FAFC",   // Clean slate-50 background
          soft: "#F1F5F9",      // slate-100
          panel: "#FFFFFF",     // pure white
        },
        navy: {
          900: "#FFFFFF",       // Mapping old card layer to pure white
          800: "#F8FAFC",       // Mapping to slate-50
          700: "#E2E8F0",       // slate-200 border
        },
        electric: {
          DEFAULT: "#2563EB",   // Modern solid blue-600
          light: "#3B82F6",     // blue-500
          glow: "#93C5FD",      // blue-300
        },
        cyan: {
          glow: "#0EA5E9",      // sky-500
        },
        violet: {
          DEFAULT: "#4F46E5",   // modern indigo-600
          soft: "#6366F1",      // indigo-500
        },
        ink: {
          100: "#0F172A",       // slate-900 (main text)
          300: "#334155",       // slate-700
          500: "#64748B",       // slate-500 (subtext)
          700: "#94A3B8",       // slate-400 (disabled/placeholders)
          600: "#94A3B8", 
        },
        mint: "#16A34A",        // green-600
        amber: "#D97706",       // amber-600
        coral: "#DC2626",       // red-600
      },
      fontFamily: {
        display: ["'Inter'", "sans-serif"], 
        body: ["'Inter'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      backgroundImage: {
        aurora: "none",
        "glass-sheen": "none",
      },
      boxShadow: {
        glow: "0 4px 12px -2px rgba(37, 99, 235, 0.2)",
        "glow-cyan": "0 4px 12px -2px rgba(14, 165, 233, 0.2)",
        card: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)",
        soft: "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)",
      },
      borderRadius: {
        xl2: "1rem",
        "3xl": "1.25rem",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: 0, transform: "translateY(8px)" }, "100%": { opacity: 1, transform: "translateY(0)" } },
      },
      animation: {
        fadeIn: "fadeIn 0.25s ease-out both",
      },
    },
  },
  plugins: [],
}
