/**
 * Semantic Liquid tag for platform-specific planning/todo instructions.
 *
 * Transforms a canonical planning directive into the correct tool name
 * and usage pattern for each build platform.
 *
 * Syntax: {% plan_tool "<directive>" %}
 *
 * Output by platform:
 *   CC:    TodoWrite: <directive> (with EnterPlanMode/ExitPlanMode when applicable)
 *   OC:    manage_todos: <directive>
 *   Codex: update_plan: <directive>
 *   Antigravity: Track progress in a markdown task list
 *   Gemini: Track progress in a markdown task list
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

const PLANNING_MODE_PATTERNS = [
	/\benter\s+plan(?:ning)?\s+mode\b/i,
	/\bstart\s+plan(?:ning)?\b/i,
	/\bexit\s+plan(?:ning)?\s+mode\b/i,
	/\bend\s+plan(?:ning)?\b/i,
	/\bplan(?:ning)?\s+mode\b/i,
];

function referencesPlanningMode(directive: string): boolean {
	return PLANNING_MODE_PATTERNS.some((pattern) => pattern.test(directive));
}

function renderClaudeCode(directive: string): string {
	let output = `TodoWrite: ${directive}`;
	if (referencesPlanningMode(directive)) {
		output +=
			"\n\nUse EnterPlanMode before planning and ExitPlanMode when done.";
	}
	return output;
}

function renderPlanTool(directive: string, platform: BuildPlatform): string {
	switch (platform) {
		case "claude-code":
			return renderClaudeCode(directive);
		case "opencode":
			return `manage_todos: ${directive}`;
		case "codex":
			return `update_plan: ${directive}`;
		case "copilot":
			return `${directive}\n\nNote: No dedicated planning tool is available on Copilot CLI. Track progress by writing status updates to a markdown file in the working directory.`;
		case "antigravity":
			return `${directive}\n\nTrack progress in a markdown task list in the working directory.`;
		case "gemini":
			return `${directive}\n\nTrack progress in a markdown task list in the working directory.`;
	}
}

export class PlanToolTag extends Tag {
	private readonly directive: string;

	constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
		super(token, remainTokens, liquid);
		const parsed = parseTagArgs(token.args);
		this.directive = parsed.positional[0] ?? "";
	}

	render(ctx: Context, emitter: Emitter): void {
		const platform = ctx.getSync(["platform"]) as BuildPlatform;
		emitter.write(renderPlanTool(this.directive, platform));
	}
}
