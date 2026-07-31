import type { Config } from "tailwindcss";

const config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          emphasis: "var(--primary-emphasis)",
          foreground: "var(--primary-foreground)",
          hover: "var(--primary-hover)"
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)"
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          emphasis: "var(--destructive-emphasis)",
          foreground: "var(--destructive-foreground)",
          hover: "var(--destructive-hover)"
        },
        success: {
          DEFAULT: "var(--success)",
          emphasis: "var(--success-emphasis)",
          foreground: "var(--success-foreground)",
          hover: "var(--success-hover)"
        },
        warning: {
          DEFAULT: "var(--warning)",
          emphasis: "var(--warning-emphasis)",
          foreground: "var(--warning-foreground)",
          hover: "var(--warning-hover)"
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)"
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)"
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)"
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)"
        }
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)"
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        heading: ["var(--font-heading)"]
      }
    }
  },
  plugins: []
} satisfies Config;

export default config;
