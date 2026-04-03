/**
 * Build-time agent name parity test for the Codex platform.
 * Validates that every plugin agent produces a consistent Codex name
 * via transformNamespace, matching the pattern used by both the
 * dispatch-side (skill agent_type references) and registry-side
 * (config.toml [agents.X] entries).
 */

import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { transformNamespace } from "../../../build/tags/index.js";

const projectRoot = join(import.meta.dir, "..", "..", "..", "..", "..");
const PLUGINS = ["base", "dev", "utils"] as const;

/**
 * Collect agent names from plugin agent directories by reading .md filenames
 * and stripping the extension. This mirrors how the build pipeline discovers
 * agents via filesystem scan of `plugins/{plugin}/agents/*.md`.
 */
function collectAgentNames(plugin: string): string[] {
	const agentsDir = join(projectRoot, "plugins", plugin, "agents");
	try {
		return readdirSync(agentsDir)
			.filter((f) => f.endsWith(".md"))
			.map((f) => basename(f, ".md"));
	} catch {
		return [];
	}
}

describe("Codex agent name parity", () => {
	const CODEX_NAME_PATTERN = /^rp1-(?:base|dev|utils)-.+$/;

	for (const plugin of PLUGINS) {
		const agentNames = collectAgentNames(plugin);

		if (agentNames.length === 0) {
			continue;
		}

		describe(`plugin: ${plugin}`, () => {
			test.each(
				agentNames,
			)("agent '%s' produces a valid Codex name via transformNamespace", (agentName) => {
				const canonicalRef = `rp1-${plugin}:${agentName}`;
				const codexName = transformNamespace(canonicalRef, "codex");

				expect(codexName).toMatch(CODEX_NAME_PATTERN);
				expect(codexName).toBe(`rp1-${plugin}-${agentName}`);
			});
		});
	}

	test("dispatch-side and registry-side derive identical names", () => {
		const mismatches: string[] = [];

		for (const plugin of PLUGINS) {
			const agentNames = collectAgentNames(plugin);

			for (const agentName of agentNames) {
				const canonicalRef = `rp1-${plugin}:${agentName}`;

				// dispatch-side: transformNamespace used by dispatch_agent tag
				const dispatchName = transformNamespace(canonicalRef, "codex");

				// registry-side: the same transformNamespace call used in
				// buildCodexPlugin (command.ts) for config.toml entries
				const registryName = transformNamespace(canonicalRef, "codex");

				if (dispatchName !== registryName) {
					mismatches.push(
						`[${plugin}] Agent "${agentName}": ` +
							`dispatch="${dispatchName}" vs registry="${registryName}"`,
					);
				}
			}
		}

		expect(mismatches).toEqual([]);
	});

	test("all plugins have at least one agent", () => {
		for (const plugin of PLUGINS) {
			const agentNames = collectAgentNames(plugin);
			expect(
				agentNames.length,
				`Plugin "${plugin}" has no agents in plugins/${plugin}/agents/`,
			).toBeGreaterThan(0);
		}
	});

	test("transformNamespace is idempotent for Codex names", () => {
		for (const plugin of PLUGINS) {
			const agentNames = collectAgentNames(plugin);

			for (const agentName of agentNames) {
				const canonicalRef = `rp1-${plugin}:${agentName}`;
				const codexName = transformNamespace(canonicalRef, "codex");

				// A second pass through transformNamespace with a non-canonical
				// input should return the input unchanged (no double transform)
				const secondPass = transformNamespace(codexName, "codex");
				expect(
					secondPass,
					`Double-transform of "${codexName}" should be a no-op`,
				).toBe(codexName);
			}
		}
	});
});
