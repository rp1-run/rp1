import Antigravity from "@lobehub/icons/es/Antigravity/components/Mono";
import Claude from "@lobehub/icons/es/Claude/components/Mono";
import Gemini from "@lobehub/icons/es/Gemini/components/Mono";
import GithubCopilot from "@lobehub/icons/es/GithubCopilot/components/Mono";
import Goose from "@lobehub/icons/es/Goose/components/Mono";
import OpenAI from "@lobehub/icons/es/OpenAI/components/Mono";
import OpenCode from "@lobehub/icons/es/OpenCode/components/Mono";

export type HarnessName =
	| "antigravity"
	| "claude-code"
	| "codex"
	| "copilot"
	| "gemini"
	| "gemini-cli"
	| "goose"
	| "opencode";

interface HarnessIconProps {
	readonly harness: string | null;
	readonly size?: number;
}

export function HarnessIcon({ harness, size = 20 }: HarnessIconProps) {
	let icon: React.ReactNode;
	let title = harness ?? undefined;
	switch (harness) {
		case "antigravity":
			icon = <Antigravity size={size} />;
			title = "Antigravity";
			break;
		case "claude-code":
			icon = <Claude size={size} />;
			break;
		case "codex":
			icon = <OpenAI size={size} />;
			break;
		case "copilot":
			icon = <GithubCopilot size={size} />;
			break;
		case "gemini":
		case "gemini-cli":
			icon = <Gemini size={size} />;
			break;
		case "goose":
			icon = <Goose size={size} />;
			title = "Goose";
			break;
		case "opencode":
			icon = <OpenCode size={size} />;
			break;
		default:
			return (
				<span
					className="inline-block shrink-0"
					style={{ width: size, height: size }}
				/>
			);
	}

	return (
		<span title={title} className="inline-flex shrink-0 text-fg-muted">
			<span className="pointer-events-none">{icon}</span>
		</span>
	);
}
