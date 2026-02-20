/**
 * Unit tests for plugin command locator.
 * Tests resolution of plugin-command identifiers to file paths and argument-hint extraction.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	extractArgumentHint,
	extractFrontmatter,
	isFallback,
	isResult,
	lookupPluginCommand,
	lookupPluginCommandWithFallback,
	parsePluginCommand,
	resolveFromInstalledPlugins,
	resolvePluginDir,
	resolvePluginPath,
} from "../../../agent-tools/transform-args/plugin-locator.js";
import {
	expectLeft,
	expectRight,
	expectTaskLeft,
	expectTaskRight,
} from "../../helpers/fp-ts-helpers.js";

describe("parsePluginCommand", () => {
	test("parses valid plugin-command format", () => {
		const result = expectRight(parsePluginCommand("rp1-dev:build"));

		expect(result.pluginId).toBe("rp1-dev");
		expect(result.commandName).toBe("build");
	});

	test("parses command with hyphens", () => {
		const result = expectRight(parsePluginCommand("rp1-base:knowledge-load"));

		expect(result.pluginId).toBe("rp1-base");
		expect(result.commandName).toBe("knowledge-load");
	});

	test("parses command with numbers", () => {
		const result = expectRight(parsePluginCommand("rp1-utils:tool2"));

		expect(result.pluginId).toBe("rp1-utils");
		expect(result.commandName).toBe("tool2");
	});

	test("rejects format without colon", () => {
		const error = expectLeft(parsePluginCommand("rp1-dev-build"));

		expect(error._tag).toBe("PluginLookupError");
		expect(error.reason).toBe("invalid-format");
		expect(error.message).toContain("Expected format");
	});

	test("rejects empty command name", () => {
		const error = expectLeft(parsePluginCommand("rp1-dev:"));

		expect(error.reason).toBe("invalid-format");
	});

	test("rejects command starting with number", () => {
		const error = expectLeft(parsePluginCommand("rp1-dev:2fast"));

		expect(error.reason).toBe("invalid-format");
	});

	test("rejects command with uppercase", () => {
		const error = expectLeft(parsePluginCommand("rp1-dev:Build"));

		expect(error.reason).toBe("invalid-format");
	});
});

describe("resolvePluginDir", () => {
	test("maps rp1-base to base", () => {
		const result = expectRight(resolvePluginDir("rp1-base"));
		expect(result).toBe("base");
	});

	test("rejects unknown plugin", () => {
		const error = expectLeft(resolvePluginDir("rp1-unknown"));

		expect(error._tag).toBe("PluginLookupError");
		expect(error.reason).toBe("unknown-plugin");
		expect(error.message).toContain("Known plugins");
	});
});

describe("resolvePluginPath", () => {
	test("constructs correct path for rp1-dev:build", () => {
		const result = expectRight(resolvePluginPath("rp1-dev:build", "/project"));

		expect(result).toBe("/project/plugins/dev/commands/build.md");
	});

	test("handles relative project root", () => {
		const result = expectRight(resolvePluginPath("rp1-utils:test", "."));

		expect(result).toBe("plugins/utils/commands/test.md");
	});

	test("propagates invalid format error", () => {
		const error = expectLeft(resolvePluginPath("invalid", "/project"));

		expect(error.reason).toBe("invalid-format");
	});

	test("propagates unknown plugin error", () => {
		const error = expectLeft(resolvePluginPath("rp1-unknown:cmd", "/project"));

		expect(error.reason).toBe("unknown-plugin");
	});
});

describe("extractFrontmatter", () => {
	test("extracts valid frontmatter", () => {
		const content = `---
name: build
argument-hint: "<feature-id> [--afk]"
---

# Content here`;

		const result = expectRight(extractFrontmatter(content, "test.md"));

		expect(result.name).toBe("build");
		expect(result["argument-hint"]).toBe("<feature-id> [--afk]");
	});

	test("handles multiple --- in content", () => {
		const content = `---
name: test
---

# Title

Some text with --- in it

---
More content`;

		const result = expectRight(extractFrontmatter(content, "test.md"));

		expect(result.name).toBe("test");
	});

	test("rejects content without frontmatter start", () => {
		const content = `# No Frontmatter

Just content here`;

		const error = expectLeft(extractFrontmatter(content, "test.md"));

		expect(error.reason).toBe("invalid-frontmatter");
		expect(error.message).toContain("must start with ---");
	});

	test("rejects content without frontmatter end", () => {
		const content = `---
name: incomplete
This is not valid YAML structure`;

		const error = expectLeft(extractFrontmatter(content, "test.md"));

		expect(error.reason).toBe("invalid-frontmatter");
	});

	test("rejects invalid YAML", () => {
		const content = `---
invalid: yaml: content:
  - malformed
---`;

		const error = expectLeft(extractFrontmatter(content, "test.md"));

		expect(error.reason).toBe("invalid-frontmatter");
		expect(error.message).toContain("YAML parse error");
	});
});

describe("extractArgumentHint", () => {
	test("extracts argument-hint field", () => {
		const metadata = {
			name: "build",
			"argument-hint": "<feature-id> [--afk]",
		};

		const result = expectRight(extractArgumentHint(metadata, "test.md"));

		expect(result).toBe("<feature-id> [--afk]");
	});

	test("handles empty argument-hint", () => {
		const metadata = {
			name: "build",
			"argument-hint": "",
		};

		const result = expectRight(extractArgumentHint(metadata, "test.md"));

		expect(result).toBe("");
	});

	test("accepts missing argument-hint as empty string", () => {
		const metadata = {
			name: "build",
		};

		const result = expectRight(extractArgumentHint(metadata, "test.md"));

		expect(result).toBe("");
	});

	test("rejects non-string argument-hint", () => {
		const metadata = {
			name: "build",
			"argument-hint": ["array", "value"],
		};

		const error = expectLeft(extractArgumentHint(metadata, "test.md"));

		expect(error.reason).toBe("invalid-frontmatter");
		expect(error.message).toContain("must be a string");
	});
});

describe("resolveFromInstalledPlugins", () => {
	let tempHome: string;

	beforeEach(async () => {
		tempHome = path.join(
			import.meta.dir,
			".test-fixtures",
			`test-installed-${Date.now()}`,
		);
		await mkdir(path.join(tempHome, ".claude", "plugins"), {
			recursive: true,
		});
	});

	afterEach(async () => {
		try {
			await rm(tempHome, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	test("resolves command from installed_plugins.json", async () => {
		const installPath = path.join(
			tempHome,
			"cache",
			"rp1-local",
			"rp1-dev",
			"0.4.7-dev",
		);
		await mkdir(path.join(installPath, "commands"), { recursive: true });
		await writeFile(
			path.join(installPath, "commands", "build.md"),
			`---\nname: build\nargument-hint: "<id>"\n---\n# Build`,
		);

		const installedPlugins = {
			version: 2,
			plugins: {
				"rp1-dev@rp1-local": [
					{
						installPath,
						scope: "local",
						version: "0.4.7-dev",
						installedAt: "",
						lastUpdated: "",
					},
				],
			},
		};
		await writeFile(
			path.join(tempHome, ".claude", "plugins", "installed_plugins.json"),
			JSON.stringify(installedPlugins),
		);

		const result = await expectTaskRight(
			resolveFromInstalledPlugins("rp1-dev:build", tempHome),
		);

		expect(result).toBe(path.join(installPath, "commands", "build.md"));
	});

	test("matches plugin with @rp1-run marketplace suffix", async () => {
		const installPath = path.join(
			tempHome,
			"cache",
			"rp1-run",
			"rp1-base",
			"0.4.5",
		);
		await mkdir(path.join(installPath, "commands"), { recursive: true });
		await writeFile(
			path.join(installPath, "commands", "knowledge-load.md"),
			`---\nname: knowledge-load\n---\n# KL`,
		);

		const installedPlugins = {
			version: 2,
			plugins: {
				"rp1-base@rp1-run": [
					{
						installPath,
						scope: "marketplace",
						version: "0.4.5",
						installedAt: "",
						lastUpdated: "",
					},
				],
			},
		};
		await writeFile(
			path.join(tempHome, ".claude", "plugins", "installed_plugins.json"),
			JSON.stringify(installedPlugins),
		);

		const result = await expectTaskRight(
			resolveFromInstalledPlugins("rp1-base:knowledge-load", tempHome),
		);

		expect(result).toBe(
			path.join(installPath, "commands", "knowledge-load.md"),
		);
	});

	test("returns error when installed_plugins.json is missing", async () => {
		// Remove the plugins directory to ensure no json file exists
		await rm(path.join(tempHome, ".claude", "plugins"), {
			recursive: true,
			force: true,
		});

		const error = await expectTaskLeft(
			resolveFromInstalledPlugins("rp1-dev:build", tempHome),
		);

		expect(error._tag).toBe("PluginLookupError");
		expect(error.reason).toBe("file-not-found");
		expect(error.message).toContain("No Claude Code plugins directory found");
	});

	test("returns error when plugin is not in installed_plugins.json", async () => {
		const installedPlugins = {
			version: 2,
			plugins: {
				"rp1-base@rp1-run": [
					{
						installPath: "/some/path",
						scope: "marketplace",
						version: "0.4.5",
						installedAt: "",
						lastUpdated: "",
					},
				],
			},
		};
		await writeFile(
			path.join(tempHome, ".claude", "plugins", "installed_plugins.json"),
			JSON.stringify(installedPlugins),
		);

		const error = await expectTaskLeft(
			resolveFromInstalledPlugins("rp1-dev:build", tempHome),
		);

		expect(error._tag).toBe("PluginLookupError");
		expect(error.reason).toBe("file-not-found");
		expect(error.message).toContain('Plugin "rp1-dev" not found');
	});

	test("returns error when command file does not exist at install path", async () => {
		const installPath = path.join(
			tempHome,
			"cache",
			"rp1-local",
			"rp1-dev",
			"0.4.7-dev",
		);
		// Do NOT create the commands directory or file

		const installedPlugins = {
			version: 2,
			plugins: {
				"rp1-dev@rp1-local": [
					{
						installPath,
						scope: "local",
						version: "0.4.7-dev",
						installedAt: "",
						lastUpdated: "",
					},
				],
			},
		};
		await writeFile(
			path.join(tempHome, ".claude", "plugins", "installed_plugins.json"),
			JSON.stringify(installedPlugins),
		);

		const error = await expectTaskLeft(
			resolveFromInstalledPlugins("rp1-dev:nonexistent", tempHome),
		);

		expect(error._tag).toBe("PluginLookupError");
		expect(error.reason).toBe("file-not-found");
		expect(error.message).toContain("Command file not found");
	});

	test("returns error for invalid plugin-command format", async () => {
		const error = await expectTaskLeft(
			resolveFromInstalledPlugins("invalid-format", tempHome),
		);

		expect(error._tag).toBe("PluginLookupError");
		expect(error.reason).toBe("invalid-format");
	});

	test("picks first matching entry when multiple marketplace entries exist", async () => {
		const localPath = path.join(
			tempHome,
			"cache",
			"rp1-local",
			"rp1-dev",
			"0.4.7-dev",
		);
		await mkdir(path.join(localPath, "commands"), { recursive: true });
		await writeFile(
			path.join(localPath, "commands", "build.md"),
			`---\nname: build\n---\n# Build`,
		);

		const installedPlugins = {
			version: 2,
			plugins: {
				"rp1-dev@rp1-local": [
					{
						installPath: localPath,
						scope: "local",
						version: "0.4.7-dev",
						installedAt: "",
						lastUpdated: "",
					},
				],
				"rp1-dev@rp1-run": [
					{
						installPath: "/other/path",
						scope: "marketplace",
						version: "0.4.5",
						installedAt: "",
						lastUpdated: "",
					},
				],
			},
		};
		await writeFile(
			path.join(tempHome, ".claude", "plugins", "installed_plugins.json"),
			JSON.stringify(installedPlugins),
		);

		const result = await expectTaskRight(
			resolveFromInstalledPlugins("rp1-dev:build", tempHome),
		);

		expect(result).toBe(path.join(localPath, "commands", "build.md"));
	});
});

describe("lookupPluginCommand", () => {
	let tempDir: string;
	const fakeHome = path.join(
		import.meta.dir,
		".test-fixtures",
		"nonexistent-home",
	);

	beforeEach(async () => {
		tempDir = path.join(
			import.meta.dir,
			".test-fixtures",
			`test-${Date.now()}`,
		);
		await mkdir(path.join(tempDir, "plugins", "dev", "commands"), {
			recursive: true,
		});
	});

	afterEach(async () => {
		try {
			await rm(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	test("successfully looks up valid command via project-local fallback", async () => {
		const commandPath = path.join(
			tempDir,
			"plugins",
			"dev",
			"commands",
			"build.md",
		);
		await writeFile(
			commandPath,
			`---
name: build
argument-hint: "<feature-id> [requirements...] [--afk]"
---

# Build Command`,
		);

		const result = await expectTaskRight(
			lookupPluginCommand("rp1-dev:build", tempDir, fakeHome),
		);

		expect(result.argumentHint).toBe("<feature-id> [requirements...] [--afk]");
		expect(result.pluginCommand).toBe("rp1-dev:build");
		expect(result.filePath).toBe(commandPath);
	});

	test("returns error for missing file", async () => {
		const error = await expectTaskLeft(
			lookupPluginCommand("rp1-dev:nonexistent", tempDir, fakeHome),
		);

		expect(error._tag).toBe("PluginLookupError");
		expect(error.reason).toBe("file-not-found");
	});

	test("returns error for invalid frontmatter", async () => {
		const commandPath = path.join(
			tempDir,
			"plugins",
			"dev",
			"commands",
			"broken.md",
		);
		await writeFile(commandPath, "# No frontmatter here");

		const error = await expectTaskLeft(
			lookupPluginCommand("rp1-dev:broken", tempDir, fakeHome),
		);

		expect(error.reason).toBe("invalid-frontmatter");
	});

	test("returns empty string for missing argument-hint", async () => {
		const commandPath = path.join(
			tempDir,
			"plugins",
			"dev",
			"commands",
			"nohint.md",
		);
		await writeFile(
			commandPath,
			`---
name: nohint
---

# No Hint`,
		);

		const result = await expectTaskRight(
			lookupPluginCommand("rp1-dev:nohint", tempDir, fakeHome),
		);

		expect(result.argumentHint).toBe("");
		expect(result.pluginCommand).toBe("rp1-dev:nohint");
	});
});

describe("lookupPluginCommandWithFallback", () => {
	let tempDir: string;
	const fakeHome = path.join(
		import.meta.dir,
		".test-fixtures",
		"nonexistent-home",
	);

	beforeEach(async () => {
		tempDir = path.join(
			import.meta.dir,
			".test-fixtures",
			`test-fallback-${Date.now()}`,
		);
		await mkdir(path.join(tempDir, "plugins", "dev", "commands"), {
			recursive: true,
		});
	});

	afterEach(async () => {
		try {
			await rm(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	test("returns result for valid command", async () => {
		const commandPath = path.join(
			tempDir,
			"plugins",
			"dev",
			"commands",
			"build.md",
		);
		await writeFile(
			commandPath,
			`---
name: build
argument-hint: "<id>"
---

# Build`,
		);

		const outcome = await expectTaskRight(
			lookupPluginCommandWithFallback("rp1-dev:build", tempDir, fakeHome),
		);

		expect(isResult(outcome)).toBe(true);
		if (isResult(outcome)) {
			expect(outcome.argumentHint).toBe("<id>");
		}
	});

	test("returns fallback for missing command", async () => {
		const outcome = await expectTaskRight(
			lookupPluginCommandWithFallback("rp1-dev:missing", tempDir, fakeHome),
		);

		expect(isFallback(outcome)).toBe(true);
		if (isFallback(outcome)) {
			expect(outcome.pluginCommand).toBe("rp1-dev:missing");
			expect(outcome.reason).toContain("not found");
		}
	});

	test("returns fallback for invalid format", async () => {
		const outcome = await expectTaskRight(
			lookupPluginCommandWithFallback("invalid-format", tempDir, fakeHome),
		);

		expect(isFallback(outcome)).toBe(true);
		if (isFallback(outcome)) {
			expect(outcome.reason).toContain("Invalid plugin-command format");
		}
	});

	test("returns fallback for unknown plugin", async () => {
		const outcome = await expectTaskRight(
			lookupPluginCommandWithFallback("rp1-unknown:cmd", tempDir, fakeHome),
		);

		expect(isFallback(outcome)).toBe(true);
		if (isFallback(outcome)) {
			expect(outcome.reason).toContain("Unknown plugin");
		}
	});
});
