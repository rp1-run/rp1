/**
 * Unit tests for install/claudecode/marketplace.ts - Local filesystem marketplace.
 * Tests marketplace metadata creation and directory structure.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
	createLocalMarketplace,
	MARKETPLACE_NAME,
} from "../../../install/claudecode/marketplace.js";
import {
	cleanupTempDir,
	createTempDir,
	expectTaskRight,
} from "../../helpers/index.js";

describe("marketplace", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("marketplace-test");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	describe("createLocalMarketplace", () => {
		test("creates .claude-plugin directory with marketplace.json", async () => {
			const marketplaceDir = join(tempDir, "plugins");

			const result = await expectTaskRight(
				createLocalMarketplace(marketplaceDir, ["base", "dev"]),
			);

			expect(result.marketplaceDir).toBe(marketplaceDir);
			expect(result.pluginsRegistered).toEqual(["rp1-base", "rp1-dev"]);

			const metadataPath = join(
				marketplaceDir,
				".claude-plugin",
				"marketplace.json",
			);
			const metadataStat = await stat(metadataPath);
			expect(metadataStat.isFile()).toBe(true);

			const content = JSON.parse(await readFile(metadataPath, "utf-8"));
			expect(content.name).toBe(MARKETPLACE_NAME);
			expect(content.owner).toEqual({ name: "rp1" });
			expect(content.plugins).toEqual([
				{ name: "rp1-base", source: "./base/" },
				{ name: "rp1-dev", source: "./dev/" },
			]);
		});

		test("creates marketplace.json with single plugin", async () => {
			const marketplaceDir = join(tempDir, "plugins");

			const result = await expectTaskRight(
				createLocalMarketplace(marketplaceDir, ["base"]),
			);

			expect(result.pluginsRegistered).toEqual(["rp1-base"]);

			const metadataPath = join(
				marketplaceDir,
				".claude-plugin",
				"marketplace.json",
			);
			const content = JSON.parse(await readFile(metadataPath, "utf-8"));
			expect(content.plugins).toHaveLength(1);
			expect(content.plugins[0]).toEqual({
				name: "rp1-base",
				source: "./base/",
			});
		});

		test("includes utils plugin when specified", async () => {
			const marketplaceDir = join(tempDir, "plugins");

			const result = await expectTaskRight(
				createLocalMarketplace(marketplaceDir, ["base", "dev", "utils"]),
			);

			expect(result.pluginsRegistered).toEqual([
				"rp1-base",
				"rp1-dev",
				"rp1-utils",
			]);

			const metadataPath = join(
				marketplaceDir,
				".claude-plugin",
				"marketplace.json",
			);
			const content = JSON.parse(await readFile(metadataPath, "utf-8"));
			expect(content.plugins).toHaveLength(3);
			expect(content.plugins[2]).toEqual({
				name: "rp1-utils",
				source: "./utils/",
			});
		});

		test("overwrites existing marketplace.json on re-creation", async () => {
			const marketplaceDir = join(tempDir, "plugins");

			await expectTaskRight(createLocalMarketplace(marketplaceDir, ["base"]));

			await expectTaskRight(
				createLocalMarketplace(marketplaceDir, ["base", "dev"]),
			);

			const metadataPath = join(
				marketplaceDir,
				".claude-plugin",
				"marketplace.json",
			);
			const content = JSON.parse(await readFile(metadataPath, "utf-8"));
			expect(content.plugins).toHaveLength(2);
		});

		test("creates nested directory structure when parent does not exist", async () => {
			const marketplaceDir = join(tempDir, "deep", "nested", "plugins");

			const result = await expectTaskRight(
				createLocalMarketplace(marketplaceDir, ["base", "dev"]),
			);

			expect(result.marketplaceDir).toBe(marketplaceDir);

			const dirStat = await stat(join(marketplaceDir, ".claude-plugin"));
			expect(dirStat.isDirectory()).toBe(true);
		});
	});
});
