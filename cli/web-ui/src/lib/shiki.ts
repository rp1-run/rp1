import mermaidGrammars from "@shikijs/langs/mermaid";
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
	"mermaid",
	"text",
] as const;

type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// The bundled mermaid grammar is an injection grammar designed for markdown
// fenced code blocks. Its top-level patterns match ``` delimiters, not raw
// mermaid content. We patch it to use the #mermaid repository (which has
// the actual diagram patterns) directly at the top level.
const mermaidGrammar = mermaidGrammars[0];
const standaloneMermaid = {
	...mermaidGrammar,
	patterns: [{ include: "#mermaid" }],
	injectionSelector: undefined,
};

export async function getHighlighter(): Promise<Highlighter> {
	if (!highlighterPromise) {
		const langs = SUPPORTED_LANGUAGES.filter((l) => l !== "mermaid");
		highlighterPromise = createHighlighter({
			themes: ["min-light", "min-dark", "github-dark-dimmed"],
			langs: [
				...langs,
				standaloneMermaid as Parameters<
					typeof createHighlighter
				>[0]["langs"][number],
			],
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
		mmd: "mermaid",
		mindmap: "mermaid",
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
		mermaid: "Mermaid",
		text: "Plain Text",
	};

	const normalized = normalizeLanguage(lang);
	return displayNames[normalized] || lang.toUpperCase();
}
