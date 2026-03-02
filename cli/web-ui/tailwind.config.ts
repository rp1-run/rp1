import type { Config } from "tailwindcss";

const config: Config = {
	darkMode: ["class"],
	content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
	theme: {
		extend: {
			fontFamily: {
				sans: ["Geist Sans", "system-ui", "sans-serif"],
				mono: ["JetBrains Mono", "monospace"],
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
				terminal: {
					green: "hsl(var(--terminal-green))",
					cursor: "hsl(var(--terminal-cursor))",
					mauve: "hsl(var(--terminal-mauve))",
					red: "hsl(var(--terminal-red))",
				},
				status: {
					queued: "hsl(var(--status-queued))",
					running: "hsl(var(--status-running))",
					waiting: "hsl(var(--status-waiting))",
					completed: "hsl(var(--status-completed))",
					failed: "hsl(var(--status-failed))",
					"needs-review": "hsl(var(--status-needs-review))",
					warning: "hsl(var(--status-warning))",
				},
				annotation: {
					open: "hsl(var(--annotation-open))",
				},
				surface: {
					void: "hsl(var(--bg-void))",
					base: "hsl(var(--bg-base))",
					DEFAULT: "hsl(var(--bg-surface))",
					elevated: "hsl(var(--bg-elevated))",
				},
			},
			borderRadius: {
				lg: "var(--radius)",
				md: "calc(var(--radius) - 2px)",
				sm: "calc(var(--radius) - 4px)",
			},
			keyframes: {
				blink: {
					"0%, 100%": { opacity: "1" },
					"50%": { opacity: "0" },
				},
			},
			animation: {
				blink: "blink 1s step-end infinite",
			},
		},
	},
	plugins: [],
};

export default config;
