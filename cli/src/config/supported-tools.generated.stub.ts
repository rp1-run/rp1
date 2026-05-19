// STUB FILE - Used during development when generate:assets hasn't been run
// This file is copied to supported-tools.generated.ts by postinstall
// The real file is generated from supported-tools.yaml by generate-asset-imports.ts

export const TOOLS_REGISTRY = {
	version: "1.0",
	tools: [
		{
			id: "claude-code",
			name: "Claude Code",
			enabled: true,
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
			enabled: true,
			binary: "opencode",
			min_version: "0.8.0",
			instruction_file: "AGENTS.md",
			install_url: "https://opencode.ai/docs/installation",
			plugin_install_cmd: null,
			capabilities: ["plugins", "slash-commands", "agents"],
		},
		{
			id: "codex",
			name: "Codex CLI",
			enabled: true,
			binary: "codex",
			min_version: "0.116.0",
			instruction_file: "AGENTS.md",
			install_url: "https://github.com/openai/codex",
			plugin_install_cmd: null,
			capabilities: ["skills", "agents"],
		},
		{
			id: "copilot",
			name: "GitHub Copilot CLI",
			enabled: true,
			binary: "copilot",
			min_version: "0.0.0",
			version_command: ["version"],
			detect_command: ["plugin", "--help"],
			instruction_file: "AGENTS.md",
			install_url:
				"https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli",
			plugin_install_cmd: "copilot plugin install {plugin}",
			capabilities: ["plugins", "skills", "agents", "slash-commands"],
		},
		{
			id: "gemini",
			name: "Gemini CLI",
			enabled: true,
			binary: "gemini",
			min_version: "0.0.0",
			instruction_file: "AGENTS.md",
			install_url: "https://github.com/google-gemini/gemini-cli",
			plugin_install_cmd: null,
			supportLevel: "experimental",
			icon: {
				source: "@lobehub/icons",
				name: "Gemini",
				variant: "mono",
			},
			capabilities: ["slash-commands"],
		},
	],
} as const;
