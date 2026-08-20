import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      // Every step of the type scale is Tailwind's default plus 2px, so a
      // `text-sm` here reads two points larger than it would anywhere else.
      // The scale is overridden rather than the root font size because this
      // codebase sizes almost everything in px, so a root change would move
      // nothing. Line heights move with their steps to keep the rhythm.
      fontSize: {
        xs:   ["14px", { lineHeight: "18px" }],
        sm:   ["16px", { lineHeight: "22px" }],
        base: ["18px", { lineHeight: "26px" }],
        lg:   ["20px", { lineHeight: "30px" }],
        xl:   ["22px", { lineHeight: "30px" }],
        "2xl": ["26px", { lineHeight: "34px" }],
        "3xl": ["32px", { lineHeight: "38px" }],
        "4xl": ["38px", { lineHeight: "42px" }],
        "5xl": ["50px", { lineHeight: "1" }],
        "6xl": ["62px", { lineHeight: "1" }],
        "7xl": ["74px", { lineHeight: "1" }],
        "8xl": ["98px", { lineHeight: "1" }],
        "9xl": ["130px", { lineHeight: "1" }],
      },
      fontFamily: {
        serif: ["'Cormorant Garamond'", "serif"],
        sans: ["'Karla'", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        cream: "hsl(var(--cream))",
        "warm-white": "hsl(var(--warm-white))",
        stone: "hsl(var(--stone))",
        taupe: "hsl(var(--taupe))",
        charcoal: "hsl(var(--charcoal))",
        ink: "hsl(var(--ink))",
        "mist-custom": "hsl(var(--mist-custom))",
        sand: "hsl(var(--sand))",
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
