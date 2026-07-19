/**
 * Semantic Liquid tag for platform-specific user input instructions.
 *
 * Transforms a canonical "ask user" directive into the correct tool name,
 * parameter format, and constraint notes for each build platform.
 *
 * Syntax: {% ask_user "<question>" [, options: "opt1", "opt2", ...] %}
 *
 * Output by platform:
 *   CC:    AskUserQuestion: "<question>" (with options list if provided)
 *   OC:    ask_user: "<question>" (with options if provided)
 *   Codex: request_user_input: "<question>" with required options array
 *          and subagent unavailability note
 *   Antigravity: ask_user: "<question>" (with options if provided)
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
import { isDirectInteractionHarness, parseTagArgs } from "./index.js";

function renderClaudeCode(
	question: string,
	options: readonly string[],
): string {
	let output = `AskUserQuestion: "${question}"`;
	if (options.length > 0) {
		output += `\nOptions:\n${options.map((o) => `- ${o}`).join("\n")}`;
	}
	return output;
}

function renderOpenCode(question: string, options: readonly string[]): string {
	let output = `ask_user: "${question}"`;
	if (options.length > 0) {
		output += `\nOptions:\n${options.map((o) => `- ${o}`).join("\n")}`;
	}
	return output;
}

function renderCopilot(question: string, options: readonly string[]): string {
	let output = `ask_user: "${question}"`;
	if (options.length > 0) {
		output += `\nOptions:\n${options.map((o) => `- ${o}`).join("\n")}`;
	}
	return output;
}

function renderCodex(question: string, options: readonly string[]): string {
	// A build-time `ask_user` with no options is a free-text question. Emitting a
	// fake `["(provide appropriate options)"]` array (the old behavior) produced
	// a placeholder-only prompt on Codex, so render it as a plain free-text input
	// request instead. Runtime-discovered choices must not use this tag at all —
	// the parent enumerates them at runtime (review M5).
	const hasOptions = options.length > 0;
	let output = `request_user_input: "${question}"`;
	if (hasOptions) {
		output += `\noptions: [${options.map((o) => `"${o}"`).join(", ")}]`;
	}

	// Plain-text fallback for non-plan-mode contexts
	output += `\n\n**Plain-text fallback**: If \`request_user_input\` is unavailable (e.g., outside of plan mode), present the following to the user instead:`;
	output += "\n\n---";
	output += "\nI need your input before continuing.";
	output += `\n\n**${question}**`;
	if (hasOptions) {
		output += "\n\nPlease respond with one of the following:";
		output += `\n${options.map((o) => `- ${o}`).join("\n")}`;
	} else {
		output += "\n\nPlease respond with your answer.";
	}
	output +=
		"\n\n**Checkpoint**: Before stopping, save a checkpoint file that includes:";
	output += "\n- Current workflow phase and step name";
	output += "\n- Paths to any artifacts produced so far";
	output += "\n- Pending work remaining in the workflow";
	output +=
		"\n\n**Stop**: Do NOT continue the workflow beyond this point in the current turn. Present the question above to the user and end your response.";
	output +=
		"\n\n**Resume**: On the next turn, read the checkpoint file, process the user's reply, and continue the workflow from where it stopped.";
	output += "\n---";

	output +=
		"\n\nNote: User input is unavailable in subagent contexts on Codex.";
	return output;
}

/**
 * Render relay envelope instructions for sub-agents on harnesses where
 * sub-agents cannot prompt users directly. The sub-agent returns a
 * JSON envelope to its parent, which relays the question to the user.
 *
 * Envelope protocol is minimal two-type: `needs_input` and `completed`.
 */
function renderRelayEnvelope(
	question: string,
	options: readonly string[],
): string {
	let envelope: string;
	if (options.length > 0) {
		const optionsJson = options.map((o) => JSON.stringify(o)).join(", ");
		envelope = `{"type": "needs_input", "question": ${JSON.stringify(question)}, "options": [${optionsJson}]}`;
	} else {
		envelope = `{"type": "needs_input", "question": ${JSON.stringify(question)}}`;
	}

	let output =
		"Return the following JSON envelope to your parent and **end your turn**:";
	output += `\n\n\`\`\`json\n${envelope}\n\`\`\``;
	output +=
		"\n\nDo NOT attempt to prompt the user directly. Your parent will relay the question and send the answer back via follow-up message.";
	output += "\n\nWhen all your work is complete, return:";
	output += '\n\n```json\n{"type": "completed"}\n```';
	return output;
}

function renderAskUser(
	question: string,
	options: readonly string[],
	platform: BuildPlatform,
	isSubAgent: boolean,
	isDirect: boolean,
): string {
	if (isSubAgent && !isDirect) {
		return renderRelayEnvelope(question, options);
	}
	switch (platform) {
		case "claude-code":
			return renderClaudeCode(question, options);
		case "opencode":
			return renderOpenCode(question, options);
		case "codex":
			return renderCodex(question, options);
		case "copilot":
			return renderCopilot(question, options);
		case "antigravity":
			return renderOpenCode(question, options);
	}
}

export class AskUserTag extends Tag {
	private readonly question: string;
	private readonly options: readonly string[];

	constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
		super(token, remainTokens, liquid);
		const parsed = parseTagArgs(token.args);
		this.question = parsed.positional[0] ?? "";
		const rawOptions = parsed.named.options;
		if (rawOptions === undefined) {
			this.options = [];
		} else if (typeof rawOptions === "string") {
			this.options = [rawOptions];
		} else {
			this.options = rawOptions;
		}
	}

	render(ctx: Context, emitter: Emitter): void {
		const platform = ctx.getSync(["platform"]) as BuildPlatform;

		// Derive sub-agent context from preprocessor-enriched artifactKind.
		// Falls back to legacy artifact.type for contexts not yet migrated (deprecated).
		const artifactKind = ctx.getSync(["artifactKind"]) as string | undefined;
		const isSubAgent =
			artifactKind !== undefined
				? artifactKind === "agent"
				: (ctx.getSync(["artifact"]) as { type?: string } | undefined)?.type ===
					"agent";

		// Detect direct-interaction capability from platform config
		const platformConfig = ctx.getSync(["platformConfig"]) as
			| { capabilities?: readonly string[] }
			| undefined;
		const isDirect = isDirectInteractionHarness(
			platform,
			platformConfig?.capabilities,
		);

		emitter.write(
			renderAskUser(
				this.question,
				this.options,
				platform,
				isSubAgent,
				isDirect,
			),
		);
	}
}
