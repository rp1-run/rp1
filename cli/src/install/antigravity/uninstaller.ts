import { lstat, readdir, readFile, rm, rmdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, sep } from "node:path";
import { dirname as posixDirname } from "node:path/posix";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { installError } from "../../../shared/errors.js";
import type { BundledAssets } from "../../assets/reader.js";
import {
	type AntigravityBundleAssetManifestOptions,
	antigravityPackageDisplayRoot,
	antigravityPackageRelativeRoot,
	loadAntigravityBundleAssetManifest,
} from "./bundle-assets.js";
import type {
	AntigravityAssetManifestEntry,
	AntigravityLifecycleState,
} from "./lifecycle.js";

export const ANTIGRAVITY_SAFE_REMOVAL_RESULTS = [
	"would_remove",
	"removed",
	"skipped_missing",
	"blocked_unowned",
	"blocked_unexpected_leftovers",
	"failed",
] as const;

export type AntigravitySafeRemovalResult =
	(typeof ANTIGRAVITY_SAFE_REMOVAL_RESULTS)[number];

export interface AntigravitySafeRemovalStatus {
	readonly asset: AntigravityAssetManifestEntry;
	readonly result: AntigravitySafeRemovalResult;
	readonly issue: string | null;
	readonly userAction: string | null;
}

export interface AntigravityUninstallOptions {
	readonly dryRun: boolean;
	readonly homeDir?: string;
	readonly assetManifest?: readonly AntigravityAssetManifestEntry[];
	readonly bundledAssets?: BundledAssets;
	readonly distDir?: string;
}

export interface AntigravityUninstallResult {
	readonly dryRun: boolean;
	readonly packageRoot: string;
	readonly packageDisplayRoot: string;
	readonly state: AntigravityLifecycleState;
	readonly statuses: readonly AntigravitySafeRemovalStatus[];
	readonly unexpectedLeftovers: readonly string[];
	readonly removedFiles: readonly string[];
	readonly wouldRemoveFiles: readonly string[];
	readonly inactive: boolean;
	readonly issue: string | null;
	readonly userAction: string | null;
}

const missingPathCodes = new Set(["ENOENT", "ENOTDIR"]);

const isMissingPathError = (error: unknown): boolean =>
	typeof error === "object" &&
	error !== null &&
	"code" in error &&
	typeof (error as { code?: unknown }).code === "string" &&
	missingPathCodes.has((error as { code: string }).code);

const toDisplayPath = (homeDir: string, targetPath: string): string => {
	const relativePath = relative(homeDir, targetPath).split(sep).join("/");
	return `~/${relativePath}`;
};

const toManifestRelativePath = (homeDir: string, targetPath: string): string =>
	relative(homeDir, targetPath).split(sep).join("/");

const removalStatus = (
	asset: AntigravityAssetManifestEntry,
	result: AntigravitySafeRemovalStatus["result"],
	issue: string | null = null,
	userAction: string | null = null,
): AntigravitySafeRemovalStatus => ({
	asset,
	result,
	issue,
	userAction,
});

const expectedContainerPaths = (
	assets: readonly AntigravityAssetManifestEntry[],
): ReadonlySet<string> => {
	const paths = new Set<string>([antigravityPackageRelativeRoot()]);

	for (const assetPath of assets.map((asset) => asset.relativePath)) {
		let current = posixDirname(assetPath);
		while (current.startsWith(antigravityPackageRelativeRoot())) {
			paths.add(current);
			if (current === antigravityPackageRelativeRoot()) break;
			current = posixDirname(current);
		}
	}

	return paths;
};

const collectUnexpectedLeftovers = async (
	homeDir: string,
	assets: readonly AntigravityAssetManifestEntry[],
): Promise<readonly string[]> => {
	const packageRoot = join(homeDir, antigravityPackageRelativeRoot());
	const expectedAssets = new Set(assets.map((asset) => asset.relativePath));
	const expectedContainers = expectedContainerPaths(assets);
	const leftovers: string[] = [];

	try {
		const rootStat = await lstat(packageRoot);
		if (!rootStat.isDirectory()) {
			return [antigravityPackageDisplayRoot()];
		}
	} catch (error) {
		if (isMissingPathError(error)) return [];
		throw error;
	}

	const visit = async (dir: string): Promise<void> => {
		const entries = await readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const targetPath = join(dir, entry.name);
			const manifestRelativePath = toManifestRelativePath(homeDir, targetPath);

			if (entry.isDirectory()) {
				if (expectedContainers.has(manifestRelativePath)) {
					await visit(targetPath);
				} else {
					leftovers.push(toDisplayPath(homeDir, targetPath));
				}
				continue;
			}

			if (!expectedAssets.has(manifestRelativePath)) {
				leftovers.push(toDisplayPath(homeDir, targetPath));
			}
		}
	};

	await visit(packageRoot);
	return leftovers.sort();
};

const removeEmptyManifestDirs = async (
	homeDir: string,
	assets: readonly AntigravityAssetManifestEntry[],
): Promise<void> => {
	const dirs = new Set<string>([antigravityPackageRelativeRoot()]);
	for (const assetPath of assets.map((asset) => asset.relativePath)) {
		let current = posixDirname(assetPath);
		while (current.startsWith(antigravityPackageRelativeRoot())) {
			dirs.add(current);
			if (current === antigravityPackageRelativeRoot()) break;
			current = posixDirname(current);
		}
	}

	const orderedDirs = [...dirs].sort(
		(a, b) => b.split("/").length - a.split("/").length,
	);
	for (const dir of orderedDirs) {
		const targetPath = join(homeDir, dir);
		try {
			const entries = await readdir(targetPath);
			if (entries.length === 0) {
				await rmdir(targetPath);
			}
		} catch {}
	}
};

const evaluateAssetRemoval = async (
	homeDir: string,
	dryRun: boolean,
	asset: AntigravityAssetManifestEntry,
): Promise<AntigravitySafeRemovalStatus> => {
	const targetPath = join(homeDir, asset.relativePath);

	try {
		const fileStat = await lstat(targetPath);
		if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
			return removalStatus(
				asset,
				"blocked_unowned",
				`Antigravity asset is not an rp1-owned regular file: ${asset.displayPath}.`,
				`Inspect ${asset.displayPath} manually before removing it.`,
			);
		}

		const actualContent = await readFile(targetPath, "utf-8");
		if (actualContent !== asset.expectedContent) {
			return removalStatus(
				asset,
				"blocked_unowned",
				`Antigravity asset content differs from the rp1 manifest: ${asset.displayPath}.`,
				`Review ${asset.displayPath} manually; remove it yourself only if it is safe.`,
			);
		}

		if (dryRun) {
			return removalStatus(asset, "would_remove");
		}

		await rm(targetPath);
		return removalStatus(asset, "removed");
	} catch (error) {
		if (isMissingPathError(error)) {
			return removalStatus(asset, "skipped_missing");
		}

		return removalStatus(
			asset,
			"failed",
			error instanceof Error
				? `Failed to remove ${asset.displayPath}: ${error.message}`
				: `Failed to remove ${asset.displayPath}.`,
			`Check permissions for ${asset.displayPath}, then retry rp1 uninstall antigravity.`,
		);
	}
};

const summarizeState = (
	dryRun: boolean,
	statuses: readonly AntigravitySafeRemovalStatus[],
): AntigravityLifecycleState => {
	if (
		statuses.some(
			(status) =>
				status.result === "blocked_unowned" || status.result === "failed",
		)
	) {
		return "blocked";
	}

	const removable = statuses.filter(
		(status) => status.result === "would_remove" || status.result === "removed",
	).length;

	if (!dryRun) return "removed";
	if (removable === 0) return "missing";
	if (removable === statuses.length) return "current";
	return "partial";
};

const summarizeIssue = (
	statuses: readonly AntigravitySafeRemovalStatus[],
	unexpectedLeftovers: readonly string[],
): string | null => {
	const blocked = statuses.find(
		(status) =>
			status.result === "blocked_unowned" || status.result === "failed",
	);
	if (blocked?.issue) return blocked.issue;

	if (unexpectedLeftovers.length > 0) {
		return "Unexpected files remain under the rp1 Antigravity package directory.";
	}

	return null;
};

const summarizeUserAction = (
	dryRun: boolean,
	statuses: readonly AntigravitySafeRemovalStatus[],
	unexpectedLeftovers: readonly string[],
): string | null => {
	const blocked = statuses.find(
		(status) =>
			status.result === "blocked_unowned" || status.result === "failed",
	);
	if (blocked?.userAction) return blocked.userAction;

	if (unexpectedLeftovers.length > 0) {
		return `Inspect ${antigravityPackageDisplayRoot()} and remove unexpected files manually only if they are yours to delete.`;
	}

	const hasRemovableAssets = statuses.some(
		(status) => status.result === "would_remove" || status.result === "removed",
	);

	if (dryRun) {
		if (!hasRemovableAssets) {
			return "Run `rp1 verify antigravity` to confirm Antigravity assets are missing or removed.";
		}
		return "Run `rp1 uninstall antigravity --yes` to remove the listed rp1-owned Antigravity assets.";
	}

	return "Run `rp1 verify antigravity` to confirm Antigravity assets are missing or removed.";
};

export const uninstallAntigravityPackageAssets = (
	options: AntigravityUninstallOptions,
): TE.TaskEither<CLIError, AntigravityUninstallResult> =>
	TE.tryCatch(
		async () => {
			const homeDir = options.homeDir ?? process.env.HOME ?? homedir();
			const manifestOptions: AntigravityBundleAssetManifestOptions = {
				assetManifest: options.assetManifest,
				bundledAssets: options.bundledAssets,
				distDir: options.distDir,
			};
			const assets = await loadAntigravityBundleAssetManifest(manifestOptions);
			const statuses: AntigravitySafeRemovalStatus[] = [];

			for (const asset of assets) {
				statuses.push(
					await evaluateAssetRemoval(homeDir, options.dryRun, asset),
				);
			}

			if (!options.dryRun) {
				await removeEmptyManifestDirs(homeDir, assets);
			}

			const unexpectedLeftovers = await collectUnexpectedLeftovers(
				homeDir,
				assets,
			);
			const removedFiles = statuses
				.filter((status) => status.result === "removed")
				.map((status) => status.asset.displayPath);
			const wouldRemoveFiles = statuses
				.filter((status) => status.result === "would_remove")
				.map((status) => status.asset.displayPath);
			const state = summarizeState(options.dryRun, statuses);
			const issue = summarizeIssue(statuses, unexpectedLeftovers);
			const userAction = summarizeUserAction(
				options.dryRun,
				statuses,
				unexpectedLeftovers,
			);
			const inactive =
				!options.dryRun &&
				statuses.every(
					(status) =>
						status.result === "removed" || status.result === "skipped_missing",
				);

			return {
				dryRun: options.dryRun,
				packageRoot: join(homeDir, antigravityPackageRelativeRoot()),
				packageDisplayRoot: antigravityPackageDisplayRoot(),
				state,
				statuses,
				unexpectedLeftovers,
				removedFiles,
				wouldRemoveFiles,
				inactive,
				issue,
				userAction,
			};
		},
		(error) =>
			installError(
				"antigravity-uninstall",
				error instanceof Error
					? error.message
					: "Failed to uninstall Antigravity package assets",
			),
	);
