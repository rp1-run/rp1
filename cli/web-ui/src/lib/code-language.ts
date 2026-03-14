/**
 * Map file extensions to syntax highlighting languages.
 * Returns null for markdown files (which use MarkdownViewer).
 */
export function getCodeLanguageFromPath(path: string): string | null {
	const ext = path.split(".").pop()?.toLowerCase();
	if (!ext) return null;

	const extToLang: Record<string, string> = {
		ts: "typescript",
		tsx: "tsx",
		js: "javascript",
		jsx: "jsx",
		py: "python",
		go: "go",
		rs: "rust",
		java: "java",
		c: "c",
		cpp: "cpp",
		cc: "cpp",
		cxx: "cpp",
		h: "c",
		hpp: "cpp",
		rb: "ruby",
		sh: "bash",
		bash: "bash",
		zsh: "bash",
		json: "json",
		yaml: "yaml",
		yml: "yaml",
		sql: "sql",
		html: "html",
		css: "css",
		xml: "xml",
		toml: "toml",
		txt: "text",
	};

	if (ext === "md" || ext === "mdx") return null;

	return extToLang[ext] ?? null;
}
