/**
 * Semantic Liquid tag for platform-specific web access instructions.
 *
 * Transforms a canonical web access directive into the correct tool
 * references for each build platform, with graceful degradation when
 * a capability is unavailable.
 *
 * Syntax: {% web_access "<capability>", "<directive>" %}
 *   where <capability> is "fetch", "search", or "both"
 *
 * Output by platform:
 *   CC:    WebFetch / WebSearch tool references per capability
 *   OC:    web_fetch / web_search tool references per capability
 *   Codex: web_search for all capabilities with degradation note
 *          when fetch is unavailable
 *   Antigravity: web_search / web_fetch references per capability
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

type WebCapability = "fetch" | "search" | "both";

function isWebCapability(value: string): value is WebCapability {
	return value === "fetch" || value === "search" || value === "both";
}

function renderCC(capability: WebCapability, directive: string): string {
	switch (capability) {
		case "fetch":
			return `WebFetch: ${directive}`;
		case "search":
			return `WebSearch: ${directive}`;
		case "both":
			return `WebFetch: ${directive}\nWebSearch: ${directive}`;
	}
}

function renderOC(capability: WebCapability, directive: string): string {
	switch (capability) {
		case "fetch":
			return `web_fetch: ${directive}`;
		case "search":
			return `web_search: ${directive}`;
		case "both":
			return `web_fetch: ${directive}\nweb_search: ${directive}`;
	}
}

function renderCodex(capability: WebCapability, directive: string): string {
	switch (capability) {
		case "search":
			return `web_search: ${directive}`;
		case "fetch":
			return `web_search: ${directive}\nNote: WebFetch is not available on Codex. Use web_search as an alternative where possible.`;
		case "both":
			return `web_search: ${directive}\nNote: WebFetch is not available on Codex. Only web_search is supported.`;
	}
}

function renderCopilot(capability: WebCapability, directive: string): string {
	switch (capability) {
		case "fetch":
			return `fetch_url: ${directive}`;
		case "search":
			return `fetch_url: ${directive}\nNote: Web search is not available on Copilot CLI. Use fetch_url with a known URL as an alternative where possible.`;
		case "both":
			return `fetch_url: ${directive}\nNote: Web search is not available on Copilot CLI. Only fetch_url is supported.`;
	}
}

function renderWebAccess(
	capability: WebCapability,
	directive: string,
	platform: BuildPlatform,
): string {
	switch (platform) {
		case "claude-code":
			return renderCC(capability, directive);
		case "opencode":
			return renderOC(capability, directive);
		case "codex":
			return renderCodex(capability, directive);
		case "copilot":
			return renderCopilot(capability, directive);
		case "antigravity":
			return renderOC(capability, directive);
		case "goose":
			return `Goose unsupported capability: web access is not supported in this build. Use local evidence only, or stop and ask the user for the required source before continuing: ${directive}`;
	}
}

export class WebAccessTag extends Tag {
	private readonly capability: WebCapability;
	private readonly directive: string;

	constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
		super(token, remainTokens, liquid);
		const parsed = parseTagArgs(token.args);
		const rawCapability = parsed.positional[0] ?? "search";
		this.capability = isWebCapability(rawCapability) ? rawCapability : "search";
		this.directive = parsed.positional[1] ?? "";
	}

	render(ctx: Context, emitter: Emitter): void {
		const platform = ctx.getSync(["platform"]) as BuildPlatform;
		emitter.write(renderWebAccess(this.capability, this.directive, platform));
	}
}
