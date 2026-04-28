/**
 * Unit tests for install/claudecode/marketplace.ts - Local filesystem marketplace.
 * Tests marketplace metadata creation and directory structure.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "../../../../shared/logger.js";
import {
	cleanupTempDir,
	createTempDir,
	expectTaskRight,
} from "../../helpers/index.js";

type MarketplaceModule =
	typeof import("../../../install/claudecode/marketplace.js");

const importMarketplace = async (): Promise<MarketplaceModule> =>
	(await import(
		`../../../install/claudecode/marketplace.js?marketplace-test=${Date.now()}-${Math.random()}`
	)) as MarketplaceModule;

const createCapturingLogger = (): { logger: Logger; messages: string[] } => {
	const messages: string[] = [];
	const logger: Logger = {
		trace: () => {},
		debug: (message: string) => messages.push(message),
		info: (message: string) => messages.push(message),
		warn: (message: string) => messages.push(message),
		error: (message: string) => messages.push(message),
		start: (message: string) => messages.push(message),
		success: (message: string) => messages.push(message),
		fail: (message: string) => messages.push(message),
		box: (message: string) => messages.push(message),
	};
	return { logger, messages };
};

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
			const { createLocalMarketplace, MARKETPLACE_NAME } =
				await importMarketplace();
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
			const { createLocalMarketplace } = await importMarketplace();
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
			const { createLocalMarketplace } = await importMarketplace();
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
			const { createLocalMarketplace } = await importMarketplace();
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
			const { createLocalMarketplace } = await importMarketplace();
			const marketplaceDir = join(tempDir, "deep", "nested", "plugins");

			const result = await expectTaskRight(
				createLocalMarketplace(marketplaceDir, ["base", "dev"]),
			);

			expect(result.marketplaceDir).toBe(marketplaceDir);

			const dirStat = await stat(join(marketplaceDir, ".claude-plugin"));
			expect(dirStat.isDirectory()).toBe(true);
		});
	});

	describe("registerMarketplace", () => {
		test("dry-run reports the Claude marketplace command without executing it", async () => {
			const { registerMarketplace } = await importMarketplace();
			const { logger, messages } = createCapturingLogger();

			const result = await expectTaskRight(
				registerMarketplace("/tmp/rp1-claude-marketplace", logger, true, false),
			);

			expect(result).toBe(true);
			expect(messages).toContain(
				'[dry-run] Would execute: claude plugin marketplace add "/tmp/rp1-claude-marketplace"',
			);
		});
	});
});
