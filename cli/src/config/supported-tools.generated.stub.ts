// STUB FILE - Used during development when generate:assets hasn't been run
// This file is copied to supported-tools.generated.ts by postinstall
// The real file is generated from supported-tools.yaml by generate-asset-imports.ts

export const TOOLS_REGISTRY = {
	version: "1.0",
	tools: [
		{
			id: "claude-code",
			name: "Claude Code",
			binary: "claude",
			min_version: "1.0.33",
			instruction_file: "CLAUDE.md",
			install_url:
				"https://docs.anthropic.com/en/docs/claude-code/getting-started",
			plugin_install_cmd: "claude plugin install {plugin}",
			capabilities: ["plugins", "slash-commands", "agents", "skills"],
		},
		{
			id: "opencode",
			name: "OpenCode",
			binary: "opencode",
			min_version: "0.8.0",
			instruction_file: "AGENTS.md",
			install_url: "https://opencode.ai/docs/installation",
			plugin_install_cmd: null,
			capabilities: ["plugins", "slash-commands", "agents"],
		},
	],
} as const;
