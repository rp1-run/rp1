/**
 * Semantic Liquid tag for platform-aware agent dispatch rendering.
 *
 * Transforms a canonical agent reference into the correct platform-specific
 * spawn instructions: Task tool for Claude Code, task tool for OpenCode,
 * and the full spawn/wait protocol for Codex.
 *
 * Inline syntax:  {% dispatch_agent "<agent-ref>", "<prompt>" [, background] %}
 * Block syntax:   {% dispatch_agent "<agent-ref>" [, background] %}
 *                   multi-line prompt content
 *                 {% enddispatch_agent %}
 */

import {
	type Context,
	type Emitter,
	type Liquid,
	Tag,
	type TagToken,
	type Template,
	type TopLevelToken,
} from "liquidjs";
import type { BuildPlatform } from "../template-context.js";
import { parseTagArgs, transformNamespace } from "./index.js";

function renderClaudeCode(agentRef: string, prompt: string): string {
	return `Task tool:
subagent_type: ${agentRef}
prompt: ${prompt}`;
}

function renderOpenCode(agentRef: string, prompt: string): string {
	const ns = transformNamespace(agentRef, "opencode");
	return `task tool:
subagent_type: ${ns}
prompt: ${prompt}`;
}

// Codex multi-agent API is experimental (HYP-002 rejected). The spawn/wait
// protocol below reflects the current API surface and may need updating if
// Codex changes its multi-agent primitives.

function renderCodexForeground(agentRef: string, prompt: string): string {
	const ns = transformNamespace(agentRef, "codex");
	return `Spawn agent:
  agent_type: ${ns}
  prompt: ${prompt}

Wait for the spawned agent to complete. Do NOT proceed until the agent has finished and returned its result. Check the agent's output for success/failure before continuing.`;
}

function renderCodexBackground(agentRef: string, prompt: string): string {
	const ns = transformNamespace(agentRef, "codex");
	return `Spawn agent (background):
  agent_type: ${ns}
  prompt: ${prompt}

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

/**
 * Format a prompt value for output. Inline (short) prompts get quoted.
 * Block (multi-line) prompts are emitted as-is with a leading newline.
 */
function formatPrompt(prompt: string, isBlock: boolean): string {
	if (isBlock) {
		return `\n${prompt}`;
	}
	return `"${prompt}"`;
}

export class DispatchAgentTag extends Tag {
	private readonly agentRef: string;
	private readonly inlinePrompt: string | null;
	private readonly mode: "foreground" | "background";
	private readonly blockTemplates: Template[];

	constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
		super(token, remainTokens, liquid);
		const args = parseTagArgs(token.args);
		this.agentRef = args.positional[0] ?? "";
		this.blockTemplates = [];

		// Determine inline vs block based on arguments.
		// Inline: {% dispatch_agent "agent", "prompt" [, background] %}
		// Block:  {% dispatch_agent "agent" [, background] %}...{% enddispatch_agent %}
		// If the second positional arg is a mode keyword, it's block syntax.
		const modeKeywords = new Set(["background", "foreground"]);
		const secondArg = args.positional[1];
		const hasInlinePrompt =
			secondArg !== undefined && !modeKeywords.has(secondArg);

		if (hasInlinePrompt) {
			this.inlinePrompt = secondArg;
			this.mode =
				args.positional[2] === "background" ? "background" : "foreground";
		} else {
			this.mode = secondArg === "background" ? "background" : "foreground";

			// Check if this is a block tag (has enddispatch_agent) or
			// a no-prompt inline tag. Peek at remainTokens for the end tag.
			let isBlock = false;
			for (const t of remainTokens) {
				if ("name" in t && t.name === "enddispatch_agent") {
					isBlock = true;
					break;
				}
			}

			if (isBlock) {
				this.inlinePrompt = null;
				const stream = liquid.parser.parseStream(remainTokens);
				stream
					.on("tag:enddispatch_agent", () => stream.stop())
					.on("template", (tpl: Template) => this.blockTemplates.push(tpl))
					.on("end", () => {
						throw new Error(
							"dispatch_agent block tag missing {% enddispatch_agent %}",
						);
					});
				stream.start();
			} else {
				// No-prompt inline dispatch
				this.inlinePrompt = "";
			}
		}
	}

	*render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
		const platform = ctx.getSync(["platform"]) as BuildPlatform;

		let prompt: string;
		let isBlock: boolean;

		if (this.inlinePrompt !== null) {
			prompt = this.inlinePrompt;
			isBlock = false;
		} else {
			// Render block body templates to collect the prompt text
			const chunks: string[] = [];
			const blockEmitter = {
				write(s: string) {
					chunks.push(s);
				},
			};
			yield this.liquid.renderer.renderTemplates(
				this.blockTemplates,
				ctx,
				blockEmitter as Emitter,
			);
			prompt = chunks.join("").trim();
			isBlock = true;
		}

		emitter.write(
			renderDispatch(
				this.agentRef,
				formatPrompt(prompt, isBlock),
				this.mode,
				platform,
			),
		);
	}
}
