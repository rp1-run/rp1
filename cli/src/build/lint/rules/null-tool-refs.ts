/**
 * L001: Detect tool names that resolved to null on the target platform.
 *
 * When a platform registry maps a CC tool to `null`, that tool has no
 * equivalent on the target platform. If the rendered output still contains
 * a literal reference like "Use the null tool", something went wrong during
 * rendering. This rule also catches direct CC tool names that map to null
 * appearing verbatim in non-CC rendered output.
 */

import { codexRegistry } from "../../codex/registry.js";
import { defaultRegistry } from "../../registry.js";
import type { BuildPlatform } from "../../template-context.js";
import type { LintDiagnostic } from "../index.js";

function getRegistryForPlatform(platform: BuildPlatform) {
	switch (platform) {
		case "opencode":
			return defaultRegistry;
		case "codex":
			return codexRegistry;
		default:
			return null;
	}
}

function findLineNumber(content: string, index: number): number {
	let line = 1;
	for (let i = 0; i < index && i < content.length; i++) {
		if (content[i] === "\n") line++;
	}
	return line;
}

export function nullToolRefsRule(
	content: string,
	platform: BuildPlatform,
	file: string,
): LintDiagnostic[] {
	if (platform === "claude-code") return [];

	const registry = getRegistryForPlatform(platform);
	if (!registry) return [];

	const diagnostics: LintDiagnostic[] = [];

	const nullTools = Object.entries(registry.toolMappings)
		.filter(([, mapping]) => mapping === null)
		.map(([tool]) => tool);

	for (const tool of nullTools) {
		const pattern = new RegExp(`\\b${tool}\\b`, "g");
		let match: RegExpExecArray | null;
		while ((match = pattern.exec(content)) !== null) {
			diagnostics.push({
				rule: "L001",
				severity: "error",
				message: `Tool "${tool}" maps to null on ${platform} but appears in rendered output`,
				file,
				line: findLineNumber(content, match.index),
				suggestion: `Use the appropriate semantic tag (e.g., {% plan_tool %}, {% web_access %}) instead of referencing "${tool}" directly`,
			});
		}
	}

	return diagnostics;
}
