import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import {
	createLocalMarketplace,
	MARKETPLACE_NAME,
} from "../../../install/copilot/marketplace.js";
import {
	cleanupTempDir,
	createTempDir,
	expectTaskRight,
	writeFixture,
} from "../../helpers/index.js";

describe("copilot marketplace", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("copilot-marketplace-test");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("stages marketplace metadata and copies native plugin directories", async () => {
		const sourceRoot = join(tempDir, "artifacts");
		const marketplaceDir = join(tempDir, "marketplace");

		await writeFixture(
			join(sourceRoot, "base"),
			"plugin.json",
			JSON.stringify({ name: "rp1-base" }),
		);
		await writeFixture(join(sourceRoot, "base"), "README.md", "base plugin");
		await writeFixture(
			join(sourceRoot, "base"),
			"skills/rp1-build/SKILL.md",
			"skill content",
		);
		await writeFixture(
			join(sourceRoot, "base"),
			"agents/rp1-base-task-builder.agent.md",
			"agent content",
		);
		await writeFixture(
			join(sourceRoot, "dev"),
			"plugin.json",
			JSON.stringify({ name: "rp1-dev" }),
		);
		await writeFixture(join(sourceRoot, "dev"), "README.md", "dev plugin");
		await writeFixture(
			join(sourceRoot, "dev"),
			"skills/rp1-review/SKILL.md",
			"skill content",
		);
		await writeFixture(
			join(sourceRoot, "dev"),
			"agents/rp1-dev-task-reviewer.agent.md",
			"agent content",
		);

		const result = await expectTaskRight(
			createLocalMarketplace(marketplaceDir, [
				join(sourceRoot, "base"),
				join(sourceRoot, "dev"),
			]),
		);

		expect(result.marketplaceDir).toBe(marketplaceDir);
		expect(result.pluginsRegistered).toEqual(["rp1-base", "rp1-dev"]);

		const metadata = JSON.parse(
			await readFile(join(marketplaceDir, "marketplace.json"), "utf-8"),
		);
		expect(metadata).toEqual({
			name: MARKETPLACE_NAME,
			owner: { name: "rp1" },
			plugins: [
				{ name: "rp1-base", source: "plugins/rp1-base" },
				{ name: "rp1-dev", source: "plugins/rp1-dev" },
			],
		});

		const stagedBaseDir = join(marketplaceDir, "plugins", "rp1-base");
		const stagedBaseStat = await stat(stagedBaseDir);
		expect(stagedBaseStat.isDirectory()).toBe(true);
		expect(await readFile(join(stagedBaseDir, "README.md"), "utf-8")).toContain(
			"base plugin",
		);
	});

	test("re-staging removes stale plugin directories", async () => {
		const sourceRoot = join(tempDir, "artifacts");
		const marketplaceDir = join(tempDir, "marketplace");

		for (const pluginName of ["rp1-base", "rp1-dev"] as const) {
			const key = pluginName.replace(/^rp1-/, "");
			await writeFixture(
				join(sourceRoot, key),
				"plugin.json",
				JSON.stringify({ name: pluginName }),
			);
			await writeFixture(
				join(sourceRoot, key),
				`skills/${pluginName}-skill/SKILL.md`,
				"skill content",
			);
			await writeFixture(
				join(sourceRoot, key),
				`agents/${pluginName}-agent.agent.md`,
				"agent content",
			);
		}

		await expectTaskRight(
			createLocalMarketplace(marketplaceDir, [
				join(sourceRoot, "base"),
				join(sourceRoot, "dev"),
			]),
		);

		await expectTaskRight(
			createLocalMarketplace(marketplaceDir, [join(sourceRoot, "base")]),
		);

		const stagedPlugins = await readdir(join(marketplaceDir, "plugins"));
		expect(stagedPlugins).toEqual(["rp1-base"]);
	});

	test("does not double-prefix already namespaced plugin names", async () => {
		const sourceRoot = join(tempDir, "artifacts");
		const marketplaceDir = join(tempDir, "marketplace");

		await writeFixture(
			join(sourceRoot, "base"),
			"plugin.json",
			JSON.stringify({ name: "rp1-base" }),
		);
		await writeFixture(
			join(sourceRoot, "base"),
			"skills/rp1-build/SKILL.md",
			"skill content",
		);
		await writeFixture(
			join(sourceRoot, "base"),
			"agents/rp1-base-task-builder.agent.md",
			"agent content",
		);

		const result = await expectTaskRight(
			createLocalMarketplace(marketplaceDir, [join(sourceRoot, "base")]),
		);

		expect(result.pluginsRegistered).toEqual(["rp1-base"]);
	});
});
