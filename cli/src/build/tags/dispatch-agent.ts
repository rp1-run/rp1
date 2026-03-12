/**
 * Semantic Liquid tag for platform-aware agent dispatch rendering.
 *
 * Transforms a canonical agent reference into the correct platform-specific
 * spawn instructions: Task tool for Claude Code, task tool for OpenCode,
 * and the full spawn/wait protocol for Codex.
 *
 * Syntax: {% dispatch_agent "<agent-ref>", "<prompt>" [, background] %}
 */

import {
	type Context,
	type Emitter,
	type Liquid,
	Tag,
	type TagToken,
	type TopLevelToken,
} from "liquidjs";
import type { BuildPlatform } from "../template-context.js";
import { parseTagArgs, transformNamespace } from "./index.js";

function renderClaudeCode(agentRef: string, prompt: string): string {
	return `Task tool:
subagent_type: ${agentRef}
prompt: "${prompt}"`;
}

function renderOpenCode(agentRef: string, prompt: string): string {
	const ns = transformNamespace(agentRef, "opencode");
	return `task tool:
subagent_type: ${ns}
prompt: "${prompt}"`;
}

// Codex multi-agent API is experimental (HYP-002 rejected). The spawn/wait
// protocol below reflects the current API surface and may need updating if
// Codex changes its multi-agent primitives.

function renderCodexForeground(agentRef: string, prompt: string): string {
	const ns = transformNamespace(agentRef, "codex");
	return `Spawn agent:
  agent_type: ${ns}
  prompt: "${prompt}"

Wait for the spawned agent to complete. Do NOT proceed until the agent has finished and returned its result. Check the agent's output for success/failure before continuing.`;
}

function renderCodexBackground(agentRef: string, prompt: string): string {
	const ns = transformNamespace(agentRef, "codex");
	return `Spawn agent (background):
  agent_type: ${ns}
  prompt: "${prompt}"

This agent runs in the background. Continue with other work. Check its result later when needed.`;
}

function renderDispatch(
	agentRef: string,
	prompt: string,
	mode: "foreground" | "background",
	platform: BuildPlatform,
): string {
	switch (platform) {
		case "claude-code":
			return renderClaudeCode(agentRef, prompt);
		case "opencode":
			return renderOpenCode(agentRef, prompt);
		case "codex":
			return mode === "background"
				? renderCodexBackground(agentRef, prompt)
				: renderCodexForeground(agentRef, prompt);
	}
}

export class DispatchAgentTag extends Tag {
	private readonly agentRef: string;
	private readonly prompt: string;
	private readonly mode: "foreground" | "background";

	constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
		super(token, remainTokens, liquid);
		const args = parseTagArgs(token.args);
		this.agentRef = args.positional[0] ?? "";
		this.prompt = args.positional[1] ?? "";
		this.mode =
			args.positional[2] === "background" ? "background" : "foreground";
	}

	render(ctx: Context, emitter: Emitter): void {
		const platform = ctx.getSync(["platform"]) as BuildPlatform;
		emitter.write(
			renderDispatch(this.agentRef, this.prompt, this.mode, platform),
		);
	}
}
