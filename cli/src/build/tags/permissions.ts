/**
 * Semantic Liquid tag for platform-specific permission model references.
 *
 * Transforms a canonical permissions directive into the correct permission
 * model language for each build platform.
 *
 * Syntax: {% permissions "<directive>" %}
 *
 * Output by platform:
 *   CC:    References allowed-tools with Bash(pattern) format
 *   OC:    References permission map with tool-level granularity
 *   Codex: References sandbox execution policy
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

function renderPermissions(directive: string, platform: BuildPlatform): string {
	switch (platform) {
		case "claude-code":
			return `Use the \`allowed-tools\` frontmatter field with \`Bash(pattern)\` format to ${directive}`;
		case "opencode":
			return `Use the permission map with tool-level granularity to ${directive}`;
		case "codex":
			return `Use the sandbox execution policy to ${directive}`;
		case "copilot":
			return `Use the \`allowed-tools\` YAML frontmatter field to ${directive}. Prefer Copilot permission patterns such as \`shell(rp1:*)\`, \`read\`, and \`write\`.`;
	}
}

export class PermissionsTag extends Tag {
	private readonly directive: string;

	constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
		super(token, remainTokens, liquid);
		const args = parseTagArgs(token.args);
		this.directive = args.positional[0] ?? "";
	}

	render(ctx: Context, emitter: Emitter): void {
		const platform = ctx.getSync(["platform"]) as BuildPlatform;
		emitter.write(renderPermissions(this.directive, platform));
	}
}
