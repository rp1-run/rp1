/**
 * Semantic Liquid tag for platform-specific file editing instructions.
 *
 * Transforms a canonical editing directive into the correct tool name and
 * editing model description for each build platform.
 *
 * Syntax: {% edit_model "<directive>" %}
 *
 * Output by platform:
 *   CC:    Use the Edit tool (exact string replacement) to <directive>
 *   OC:    Use the edit_file tool (exact string replacement) to <directive>
 *   Codex: Use the apply_patch tool (unified diff format) to <directive>
 *   Antigravity: Use Antigravity CLI file editing tools to <directive>
 *   Gemini: Use Gemini CLI file editing tools to <directive>
 *   Goose: Use Goose developer file editing tools to <directive>
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

function renderEditModel(directive: string, platform: BuildPlatform): string {
	switch (platform) {
		case "claude-code":
			return `Use the Edit tool (exact string replacement) to ${directive}`;
		case "opencode":
			return `Use the edit_file tool (exact string replacement) to ${directive}`;
		case "codex":
			return `Use the apply_patch tool (unified diff format) to ${directive}`;
		case "copilot":
			return `Use the edit_file tool (exact string replacement) to ${directive}. Provide old_string and new_string parameters for precise replacements.`;
		case "antigravity":
			return `Use Antigravity CLI file editing tools to ${directive}`;
		case "gemini":
			return `Use Gemini CLI file editing tools to ${directive}`;
		case "goose":
			return `Use Goose developer file editing tools to ${directive}`;
	}
}

export class EditModelTag extends Tag {
	private readonly directive: string;

	constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
		super(token, remainTokens, liquid);
		const args = parseTagArgs(token.args);
		this.directive = args.positional[0] ?? "";
	}

	render(ctx: Context, emitter: Emitter): void {
		const platform = ctx.getSync(["platform"]) as BuildPlatform;
		emitter.write(renderEditModel(this.directive, platform));
	}
}
