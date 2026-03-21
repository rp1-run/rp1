import type { Config } from "tailwindcss";

const config: Config = {
	darkMode: ["class"],
	content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
	theme: {
		extend: {
			fontFamily: {
				mono: ["Commit Mono", "monospace"],
				sans: ["Commit Mono", "monospace"],
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
					DEFAULT: "hsl(var(--accent-ui))",
					foreground: "hsl(var(--accent-ui-foreground))",
					amber: "hsl(var(--accent))",
					ghost: "hsl(var(--accent-ghost))",
				},
				popover: {
					DEFAULT: "hsl(var(--popover))",
					foreground: "hsl(var(--popover-foreground))",
				},
				card: {
					DEFAULT: "hsl(var(--card))",
					foreground: "hsl(var(--card-foreground))",
				},
				surface: {
					void: "hsl(var(--void))",
					base: "hsl(var(--base))",
					DEFAULT: "hsl(var(--surface))",
				},
				fg: {
					DEFAULT: "hsl(var(--fg))",
					muted: "hsl(var(--fg-muted))",
					ghost: "hsl(var(--fg-ghost))",
				},
				failure: "hsl(var(--failure))",
				"terminal-green": "hsl(var(--terminal-green))",
				"terminal-yellow": "hsl(var(--terminal-yellow))",
				annotation: {
					open: "hsl(var(--annotation-open))",
				},
			},
			spacing: {
				xs: "var(--space-xs)",
				sm: "var(--space-sm)",
				md: "var(--space-md)",
				lg: "var(--space-lg)",
				xl: "var(--space-xl)",
				"2xl": "var(--space-2xl)",
			},
			borderRadius: {
				lg: "var(--radius)",
				md: "var(--radius)",
				sm: "var(--radius)",
				DEFAULT: "var(--radius)",
			},
			keyframes: {
				"status-pulse": {
					"0%, 100%": { opacity: "0.4" },
					"50%": { opacity: "1" },
				},
				blink: {
					"0%, 49.9%": { opacity: "1" },
					"50%, 100%": { opacity: "0" },
				},
			},
			animation: {
				"status-pulse": "status-pulse 1.8s ease-in-out infinite",
				blink: "blink 1s step-end infinite",
			},
		},
	},
	plugins: [],
};

export default config;
