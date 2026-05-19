import {
	Claude,
	Gemini,
	GithubCopilot,
	OpenAI,
	OpenCode,
} from "@lobehub/icons";

export type HarnessName =
	| "claude-code"
	| "codex"
	| "copilot"
	| "gemini"
	| "gemini-cli"
	| "opencode";

interface HarnessIconProps {
	readonly harness: string | null;
	readonly size?: number;
}

export function HarnessIcon({ harness, size = 20 }: HarnessIconProps) {
	let icon: React.ReactNode;
	switch (harness) {
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
		<span title={harness} className="inline-flex shrink-0 text-fg-muted">
			<span className="pointer-events-none">{icon}</span>
		</span>
	);
}
