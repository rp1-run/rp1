import { describe, expect, test } from "bun:test";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { Logger } from "../../../../shared/logger.js";
import type { ClaudeCodeInstallerDependencies } from "../../../install/claudecode/installer.js";
import { expectTaskRight } from "../../helpers/index.js";

const createLogger = (): { logger: Logger; messages: string[] } => {
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

const importClaudeCodeInstaller = async () =>
	(await import(
		`../../../install/claudecode/installer.js?real=${Date.now()}-${Math.random()}`
	)) as typeof import("../../../install/claudecode/installer.js");

describe("claude code installer", () => {
	test("dry-run plugin install and update emit scoped Claude commands", async () => {
		const { installPlugin, updatePlugin } = await importClaudeCodeInstaller();
		const { logger, messages } = createLogger();

		await expectTaskRight(
			installPlugin("rp1-base", "project", logger, true, false),
		);
		await expectTaskRight(
			updatePlugin("rp1-dev", "local", logger, true, false),
		);
		await expectTaskRight(
			installPlugin("rp1-utils", "user", logger, true, false),
		);

		expect(messages).toContain(
			"[dry-run] Would execute: claude plugin install rp1-base@rp1-local --scope project",
		);
		expect(messages).toContain(
			"[dry-run] Would execute: claude plugin update rp1-dev@rp1-local --scope local",
		);
		expect(messages).toContain(
			"[dry-run] Would execute: claude plugin install rp1-utils@rp1-local --scope user",
		);
	});

	test("dry-run full install creates marketplace flow and records extracted plugins", async () => {
		const { installAllPlugins } = await importClaudeCodeInstaller();
		const calls: string[] = [];
		const installerDeps: ClaudeCodeInstallerDependencies = {
			migrateFromGitHubMarketplace: () => {
				calls.push("migrate");
				return TE.right(false);
			},
			extractPlatformAssets: () => {
				calls.push("extract");
				return TE.right({
					pluginsExtracted: ["rp1-base", "rp1-dev"],
					filesExtracted: 4,
					targetDir: "/tmp/rp1-marketplace-test",
				});
			},
			createLocalMarketplace: (_dir: string, plugins: readonly string[]) => {
				calls.push(`marketplace:${plugins.join(",")}`);
				return TE.right({
					marketplaceDir: "/tmp/rp1-marketplace-test",
					pluginsRegistered: plugins.map((plugin) => `rp1-${plugin}`),
				});
			},
			registerMarketplace: () => {
				calls.push("register");
				return TE.right(true);
			},
			writeVersionMarker: (tool: string, version: string) => {
				calls.push(`marker:${tool}:${version}`);
				return TE.right(undefined);
			},
			getInstalledVersion: () => "1.2.3",
			defaultMarketplaceDir: "/tmp/rp1-marketplace-test",
		};

		const { logger, messages } = createLogger();

		const result = await expectTaskRight(
			installAllPlugins("project", logger, true, false, installerDeps),
		);

		expect(result).toEqual({
			marketplaceAdded: true,
			pluginsInstalled: ["rp1-base", "rp1-dev"],
			warnings: [],
		});
		expect(calls).toEqual([
			"migrate",
			"extract",
			"marketplace:base,dev",
			"register",
			"marker:claude-code:1.2.3",
		]);
		expect(messages).toContain("Extracting Claude Code assets...");
		expect(messages).toContain(
			"[dry-run] Would execute: claude plugin install rp1-base@rp1-local --scope project",
		);
		expect(messages).toContain(
			"[dry-run] Would execute: claude plugin install rp1-dev@rp1-local --scope project",
		);
	});
});
