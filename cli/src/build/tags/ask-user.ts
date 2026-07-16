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
import { parseTagArgs } from "./index.js";

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
	const optionsList =
		options.length > 0 ? options : ["(provide appropriate options)"];
	let output = `request_user_input: "${question}"`;
	output += `\noptions: [${optionsList.map((o) => `"${o}"`).join(", ")}]`;

	// Plain-text fallback for non-plan-mode contexts
	output += `\n\n**Plain-text fallback**: If \`request_user_input\` is unavailable (e.g., outside of plan mode), present the following to the user instead:`;
	output += "\n\n---";
	output += "\nI need your input before continuing.";
	output += `\n\n**${question}**`;
	output += "\n\nPlease respond with one of the following:";
	output += `\n${optionsList.map((o) => `- ${o}`).join("\n")}`;
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

function renderAskUser(
	question: string,
	options: readonly string[],
	platform: BuildPlatform,
): string {
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
		case "goose":
			return `Goose does not support interactive user input: ${question}`;
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
		emitter.write(renderAskUser(this.question, this.options, platform));
	}
}
