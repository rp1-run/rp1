/**
 * Local filesystem marketplace module for Copilot plugin distribution.
 * Creates and registers a local directory as a Copilot marketplace.
 */

import { exec } from "node:child_process";
import {
	copyFile,
	mkdir,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { formatError, installError } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import { createSpinner } from "../../../shared/spinner.js";

const execAsync = promisify(exec);

export const MARKETPLACE_NAME = "rp1-local";

export const DEFAULT_MARKETPLACE_DIR = join(
	process.env.HOME ?? "/tmp",
	".rp1",
	"copilot",
	"marketplace",
);

const COMMAND_TIMEOUT = 15000;

interface MarketplaceMetadata {
	readonly name: string;
	readonly owner: { readonly name: string };
	readonly plugins: readonly MarketplacePluginEntry[];
}

interface MarketplacePluginEntry {
	readonly name: string;
	readonly source: string;
}

interface CopilotPluginManifest {
	readonly name?: string;
}

export interface MarketplaceResult {
	readonly marketplaceDir: string;
	readonly pluginsRegistered: readonly string[];
}

const copyDirRecursive = async (src: string, dst: string): Promise<number> => {
	await mkdir(dst, { recursive: true, mode: 0o755 });
	let count = 0;

	const entries = await readdir(src, { withFileTypes: true });
	for (const entry of entries) {
		const srcPath = join(src, entry.name);
		const dstPath = join(dst, entry.name);

		if (entry.isDirectory()) {
			count += await copyDirRecursive(srcPath, dstPath);
		} else {
			await mkdir(dirname(dstPath), { recursive: true, mode: 0o755 });
			await copyFile(srcPath, dstPath);
			count++;
		}
	}

	return count;
};

const normalizePluginName = (name: string): string =>
	name.startsWith("rp1-") ? name : `rp1-${name}`;

const resolvePluginName = async (pluginDir: string): Promise<string> => {
	const manifestPath = join(pluginDir, "plugin.json");
	const raw = await readFile(manifestPath, "utf-8");
	const manifest = JSON.parse(raw) as CopilotPluginManifest;

	if (typeof manifest.name !== "string" || manifest.name.length === 0) {
		throw new Error(`plugin.json at ${manifestPath} is missing a valid name`);
	}

	return normalizePluginName(manifest.name);
};

const buildMarketplaceMetadata = (
	pluginNames: readonly string[],
): MarketplaceMetadata => ({
	name: MARKETPLACE_NAME,
	owner: { name: "rp1" },
	plugins: pluginNames.map((pluginName) => ({
		name: pluginName,
		source: `plugins/${pluginName}`,
	})),
});

export const createLocalMarketplace = (
	marketplaceDir: string,
	pluginDirs: readonly string[],
): TE.TaskEither<CLIError, MarketplaceResult> =>
	TE.tryCatch(
		async () => {
			await rm(marketplaceDir, { recursive: true, force: true });
			await mkdir(marketplaceDir, { recursive: true, mode: 0o755 });

			const pluginsRootDir = join(marketplaceDir, "plugins");
			await mkdir(pluginsRootDir, { recursive: true, mode: 0o755 });

			const pluginsRegistered: string[] = [];
			const seen = new Set<string>();

			for (const pluginDir of pluginDirs) {
				const pluginName = await resolvePluginName(pluginDir);
				if (seen.has(pluginName)) {
					throw new Error(`Duplicate Copilot plugin name: ${pluginName}`);
				}

				seen.add(pluginName);
				await copyDirRecursive(pluginDir, join(pluginsRootDir, pluginName));
				pluginsRegistered.push(pluginName);
			}

			const metadata = buildMarketplaceMetadata(pluginsRegistered);
			await writeFile(
				join(marketplaceDir, "marketplace.json"),
				`${JSON.stringify(metadata, null, 2)}\n`,
				{ mode: 0o644 },
			);

			return {
				marketplaceDir,
				pluginsRegistered,
			};
		},
		(e) =>
			installError(
				"create-marketplace",
				`Failed to create Copilot marketplace at ${marketplaceDir}: ${e}`,
			),
	);

export const registerMarketplace = (
	marketplaceDir: string,
	logger: Logger,
	dryRun: boolean,
	isTTY: boolean,
): TE.TaskEither<CLIError, boolean> => {
	const command = `gh copilot -- plugin marketplace add "${marketplaceDir}"`;
	const spinner = createSpinner(isTTY);

	if (dryRun) {
		logger.info(`[dry-run] Would execute: ${command}`);
		return TE.right(true);
	}

	spinner.start("Registering local Copilot marketplace...");

	return pipe(
		TE.tryCatch(
			async () => {
				const { stdout, stderr } = await execAsync(command, {
					timeout: COMMAND_TIMEOUT,
				});
				return stdout || stderr;
			},
			(e) => {
				const error = e as Error & { stderr?: string };
				const message = error.stderr || error.message || String(e);
				return installError(
					"register-marketplace",
					`Failed to register Copilot marketplace: ${message}`,
				);
			},
		),
		TE.map(() => {
			spinner.succeed(
				`Local Copilot marketplace registered at ${marketplaceDir}`,
			);
			return true;
		}),
		TE.orElse((error) => {
			const message = formatError(error, false);
			if (/already (exists|added|registered)/i.test(message)) {
				spinner.stop();
				logger.info("Local Copilot marketplace already registered");
				return TE.right(true);
			}
			spinner.fail(`Failed to register marketplace: ${message}`);
			return TE.left(error);
		}),
	);
};
