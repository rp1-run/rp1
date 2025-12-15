import { createHighlighter, type Highlighter } from "shiki";

let highlighterPromise: Promise<Highlighter> | null = null;

const SUPPORTED_LANGUAGES = [
	"javascript",
	"typescript",
	"jsx",
	"tsx",
	"python",
	"go",
	"rust",
	"java",
	"c",
	"cpp",
	"ruby",
	"bash",
	"shellscript",
	"json",
	"yaml",
	"markdown",
	"sql",
	"html",
	"css",
	"xml",
	"dockerfile",
	"toml",
	"text",
] as const;

type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export async function getHighlighter(): Promise<Highlighter> {
	if (!highlighterPromise) {
		highlighterPromise = createHighlighter({
			themes: ["catppuccin-latte", "catppuccin-mocha"],
			langs: [...SUPPORTED_LANGUAGES],
		});
	}
	return highlighterPromise;
}

export function normalizeLanguage(lang: string | undefined): SupportedLanguage {
	if (!lang) return "text";

	const normalized = lang.toLowerCase();

	const aliases: Record<string, SupportedLanguage> = {
		js: "javascript",
		ts: "typescript",
		py: "python",
		rb: "ruby",
		sh: "bash",
		shell: "bash",
		zsh: "bash",
		yml: "yaml",
		md: "markdown",
		"c++": "cpp",
		cxx: "cpp",
		h: "c",
		hpp: "cpp",
		plaintext: "text",
		txt: "text",
	};

	const aliased = aliases[normalized] || normalized;

	if (SUPPORTED_LANGUAGES.includes(aliased as SupportedLanguage)) {
		return aliased as SupportedLanguage;
	}

	return "text";
}

export function getLanguageDisplayName(lang: string | undefined): string {
	if (!lang) return "Plain Text";

	const displayNames: Record<string, string> = {
		javascript: "JavaScript",
		typescript: "TypeScript",
		jsx: "JSX",
		tsx: "TSX",
		python: "Python",
		go: "Go",
		rust: "Rust",
		java: "Java",
		c: "C",
		cpp: "C++",
		ruby: "Ruby",
		bash: "Bash",
		shellscript: "Shell",
		json: "JSON",
		yaml: "YAML",
		markdown: "Markdown",
		sql: "SQL",
		html: "HTML",
		css: "CSS",
		xml: "XML",
		dockerfile: "Dockerfile",
		toml: "TOML",
		text: "Plain Text",
	};

	const normalized = normalizeLanguage(lang);
	return displayNames[normalized] || lang.toUpperCase();
}
