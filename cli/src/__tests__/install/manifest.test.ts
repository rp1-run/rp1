/**
 * Unit tests for manifest.ts - Plugin manifest parsing and discovery.
 * Tests rp1's manifest processing logic, not JSON parsing (library).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";

import {
	discoverPlugins,
	getAllArtifactNames,
	getExpectedCounts,
	loadManifest,
} from "../../install/manifest.js";
import type { PluginManifest } from "../../install/models.js";
import {
	cleanupTempDir,
	createTempDir,
	getErrorMessage,
	getFixturePath,
} from "../helpers/index.js";

describe("manifest", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("manifest-test");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	describe("loadManifest", () => {
		test("parses all required fields from valid manifest.json", async () => {
			const manifestPath = getFixturePath("configs", "valid-manifest.json");
			const result = await loadManifest(manifestPath)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				const manifest = result.right;
				expect(manifest.plugin).toBe("test-plugin");
				expect(manifest.version).toBe("1.0.0");
				expect(manifest.generatedAt).toBe("2025-01-01T00:00:00Z");
				expect(manifest.opencodeVersionTested).toBe("0.9.0");
				expect(manifest.commands).toContain("sample-command");
				expect(manifest.agents).toContain("sample-agent");
				expect(manifest.skills).toContain("sample-skill");
			}
		});

		test("returns Left(ParseError) for missing required fields", async () => {
			const invalidManifestPath = getFixturePath(
				"configs",
				"invalid-manifest.json",
			);
			const result = await loadManifest(invalidManifestPath)();

			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(getErrorMessage(result.left)).toContain(
					"missing required fields",
				);
			}
		});

		test("returns Left(ParseError) when artifacts is not an object", async () => {
			const manifestPath = join(tempDir, "manifest.json");
			await writeFile(
				manifestPath,
				JSON.stringify({
					plugin: "test",
					version: "1.0.0",
					generated_at: "2025-01-01T00:00:00Z",
					opencode_version_tested: "0.9.0",
					artifacts: "not-an-object",
				}),
			);

			const result = await loadManifest(manifestPath)();

			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(getErrorMessage(result.left)).toContain("must be an object");
			}
		});

		test("returns Left for non-existent manifest file", async () => {
			const result = await loadManifest(join(tempDir, "nonexistent.json"))();

			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(getErrorMessage(result.left)).toContain("Failed to read");
			}
		});

		test("handles empty artifact arrays gracefully", async () => {
			const manifestPath = join(tempDir, "manifest.json");
			await writeFile(
				manifestPath,
				JSON.stringify({
					plugin: "test",
					version: "1.0.0",
					generated_at: "2025-01-01T00:00:00Z",
					opencode_version_tested: "0.9.0",
					artifacts: {},
				}),
			);

			const result = await loadManifest(manifestPath)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right.commands).toEqual([]);
				expect(result.right.agents).toEqual([]);
				expect(result.right.skills).toEqual([]);
			}
		});
	});

	describe("discoverPlugins", () => {
		test("finds all plugin directories with manifest.json", async () => {
			// Create two plugin directories with manifests
			const plugin1Dir = join(tempDir, "rp1-base");
			const plugin2Dir = join(tempDir, "rp1-dev");
			await mkdir(plugin1Dir, { recursive: true });
			await mkdir(plugin2Dir, { recursive: true });

			await writeFile(
				join(plugin1Dir, "manifest.json"),
				JSON.stringify({
					plugin: "rp1-base",
					version: "1.0.0",
					generated_at: "2025-01-01T00:00:00Z",
					opencode_version_tested: "0.9.0",
					artifacts: { commands: ["cmd1"], agents: [], skills: [] },
				}),
			);

			await writeFile(
				join(plugin2Dir, "manifest.json"),
				JSON.stringify({
					plugin: "rp1-dev",
					version: "1.0.0",
					generated_at: "2025-01-01T00:00:00Z",
					opencode_version_tested: "0.9.0",
					artifacts: { commands: ["cmd2"], agents: ["agent1"], skills: [] },
				}),
			);

			const result = await discoverPlugins(tempDir)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right.length).toBe(2);
				const plugins = result.right.map((p) => p.plugin);
				expect(plugins).toContain("rp1-base");
				expect(plugins).toContain("rp1-dev");
			}
		});

		test("returns Left when no plugins found", async () => {
			// Empty directory - no plugin subdirs
			const result = await discoverPlugins(tempDir)();

			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(getErrorMessage(result.left)).toContain(
					"No plugin manifests found",
				);
			}
		});

		test("skips directories without valid manifest", async () => {
			// Create one valid and one invalid plugin dir
			const validDir = join(tempDir, "valid-plugin");
			const invalidDir = join(tempDir, "invalid-plugin");
			await mkdir(validDir, { recursive: true });
			await mkdir(invalidDir, { recursive: true });

			await writeFile(
				join(validDir, "manifest.json"),
				JSON.stringify({
					plugin: "valid-plugin",
					version: "1.0.0",
					generated_at: "2025-01-01T00:00:00Z",
					opencode_version_tested: "0.9.0",
					artifacts: { commands: [], agents: [], skills: [] },
				}),
			);

			// Invalid: malformed JSON
			await writeFile(join(invalidDir, "manifest.json"), "{ invalid }");

			const result = await discoverPlugins(tempDir)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right.length).toBe(1);
				expect(result.right[0].plugin).toBe("valid-plugin");
			}
		});

		test("skips non-directory entries", async () => {
			// Create a file in the root (should be skipped)
			await writeFile(join(tempDir, "not-a-dir.txt"), "content");

			// Create a valid plugin dir
			const pluginDir = join(tempDir, "plugin");
			await mkdir(pluginDir, { recursive: true });
			await writeFile(
				join(pluginDir, "manifest.json"),
				JSON.stringify({
					plugin: "plugin",
					version: "1.0.0",
					generated_at: "2025-01-01T00:00:00Z",
					opencode_version_tested: "0.9.0",
					artifacts: { commands: ["cmd"], agents: [], skills: [] },
				}),
			);

			const result = await discoverPlugins(tempDir)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right.length).toBe(1);
			}
		});
	});

	describe("getExpectedCounts", () => {
		test("sums artifacts across multiple manifests", () => {
			const manifests: readonly PluginManifest[] = [
				{
					plugin: "base",
					version: "1.0.0",
					generatedAt: "2025-01-01",
					opencodeVersionTested: "0.9.0",
					commands: ["cmd1", "cmd2"],
					agents: ["agent1"],
					skills: ["skill1", "skill2", "skill3"],
				},
				{
					plugin: "dev",
					version: "1.0.0",
					generatedAt: "2025-01-01",
					opencodeVersionTested: "0.9.0",
					commands: ["cmd3"],
					agents: ["agent2", "agent3"],
					skills: [],
				},
			];

			const counts = getExpectedCounts(manifests);

			expect(counts.commands).toBe(3); // 2 + 1
			expect(counts.agents).toBe(3); // 1 + 2
			expect(counts.skills).toBe(3); // 3 + 0
		});

		test("returns zeros for empty manifests array", () => {
			const counts = getExpectedCounts([]);

			expect(counts.commands).toBe(0);
			expect(counts.agents).toBe(0);
			expect(counts.skills).toBe(0);
		});
	});

	describe("getAllArtifactNames", () => {
		test("collects unique artifact names across manifests", () => {
			const manifests: readonly PluginManifest[] = [
				{
					plugin: "base",
					version: "1.0.0",
					generatedAt: "2025-01-01",
					opencodeVersionTested: "0.9.0",
					commands: ["cmd1", "shared-cmd"],
					agents: ["agent1"],
					skills: ["skill1"],
				},
				{
					plugin: "dev",
					version: "1.0.0",
					generatedAt: "2025-01-01",
					opencodeVersionTested: "0.9.0",
					commands: ["cmd2", "shared-cmd"], // shared-cmd is duplicate
					agents: ["agent2"],
					skills: ["skill2"],
				},
			];

			const names = getAllArtifactNames(manifests);

			expect(names.commands.size).toBe(3); // cmd1, cmd2, shared-cmd (unique)
			expect(names.commands.has("cmd1")).toBe(true);
			expect(names.commands.has("cmd2")).toBe(true);
			expect(names.commands.has("shared-cmd")).toBe(true);

			expect(names.agents.size).toBe(2);
			expect(names.agents.has("agent1")).toBe(true);
			expect(names.agents.has("agent2")).toBe(true);

			expect(names.skills.size).toBe(2);
			expect(names.skills.has("skill1")).toBe(true);
			expect(names.skills.has("skill2")).toBe(true);
		});

		test("returns empty sets for empty manifests array", () => {
			const names = getAllArtifactNames([]);

			expect(names.commands.size).toBe(0);
			expect(names.agents.size).toBe(0);
			expect(names.skills.size).toBe(0);
		});
	});
});
