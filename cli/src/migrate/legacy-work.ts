import type { Dirent } from "node:fs";
import {
	copyFileSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	realpathSync,
	renameSync,
	unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, sep as pathSeparator, resolve } from "node:path";
import { normalizeProjectKey } from "../../shared/directory-resolution.js";

export interface LegacyWorkResult {
	readonly legacyPath: string | undefined;
	readonly filesMoved: number;
	readonly filesSkipped: number;
}

const isSymlinkOutsideExpected = (
	filePath: string,
	expectedBase: string,
): boolean => {
	try {
		const stats = lstatSync(filePath);
		if (!stats.isSymbolicLink()) return false;
		const target = realpathSync(filePath);
		const base = resolve(expectedBase);
		return target !== base && !target.startsWith(`${base}${pathSeparator}`);
	} catch {
		return true;
	}
};

const crossDeviceMove = (src: string, dest: string): void => {
	copyFileSync(src, dest);
	unlinkSync(src);
};

const moveFile = (src: string, dest: string): void => {
	try {
		renameSync(src, dest);
	} catch (error: unknown) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "EXDEV"
		) {
			crossDeviceMove(src, dest);
		} else {
			throw error;
		}
	}
};

const isGitRepo = (dirPath: string): boolean =>
	existsSync(join(dirPath, ".git"));

const moveRecursive = (
	srcDir: string,
	destDir: string,
	expectedBase: string,
): { moved: number; skipped: number } => {
	let moved = 0;
	let skipped = 0;

	const entries = readdirSync(srcDir, { withFileTypes: true });

	for (const entry of entries) {
		const srcPath = join(srcDir, entry.name);
		const destPath = join(destDir, entry.name);

		if (isSymlinkOutsideExpected(srcPath, expectedBase)) {
			skipped++;
			continue;
		}

		if (entry.isDirectory()) {
			// Skip directories that look like git repos (worktree checkouts)
			if (isGitRepo(srcPath)) {
				skipped++;
				continue;
			}
			if (!existsSync(destPath)) {
				mkdirSync(destPath, { recursive: true });
			}
			const sub = moveRecursive(srcPath, destPath, expectedBase);
			moved += sub.moved;
			skipped += sub.skipped;
		} else if (entry.isFile() || entry.isSymbolicLink()) {
			if (existsSync(destPath)) {
				skipped++;
			} else {
				mkdirSync(join(destDir, ".."), { recursive: true });
				moveFile(srcPath, destPath);
				moved++;
			}
		}
	}

	return { moved, skipped };
};

export const findLegacyWorkDir = (
	projectRoot: string,
	homeDir: string = homedir(),
): string | undefined => {
	const key = normalizeProjectKey(projectRoot);
	const legacyPath = join(homeDir, ".rp1", "work", key);

	if (!existsSync(legacyPath)) return undefined;

	if (!hasLegacyWorkArtifacts(legacyPath)) return undefined;

	return legacyPath;
};

/** Top-level entries that are actual rp1 work artifacts, not repo checkouts */
const KNOWN_WORK_ENTRIES = new Set([
	"features",
	"research",
	"pr-reviews",
	"archives",
	"content",
	"blueprints",
	"pr-review-checkpoint.json",
]);

export const isWorkArtifact = (entryName: string): boolean => {
	if (KNOWN_WORK_ENTRIES.has(entryName)) return true;
	// JSON/markdown files at top level are likely work artifacts
	if (entryName.endsWith(".md") || entryName.endsWith(".json")) return true;
	return false;
};

export const isEligibleLegacyWorkEntry = (
	entryName: string,
	entryPath: string,
	expectedBase: string,
): boolean => {
	if (!isWorkArtifact(entryName)) return false;
	try {
		const stats = lstatSync(entryPath);
		if (stats.isSymbolicLink())
			return !isSymlinkOutsideExpected(entryPath, expectedBase);
		if (stats.isDirectory()) return !isGitRepo(entryPath);
		return stats.isFile();
	} catch {
		return false;
	}
};

const containsActualArtifact = (
	dirPath: string,
	expectedBase: string,
): boolean => {
	let entries: Dirent[];
	try {
		entries = readdirSync(dirPath, { withFileTypes: true });
	} catch {
		return false;
	}
	for (const entry of entries) {
		const entryPath = join(dirPath, entry.name);
		try {
			const stats = lstatSync(entryPath);
			if (
				stats.isSymbolicLink() &&
				isSymlinkOutsideExpected(entryPath, expectedBase)
			)
				continue;
			if (stats.isDirectory() && isGitRepo(entryPath)) continue;
			if (stats.isFile()) return true;
			if (
				stats.isDirectory() &&
				containsActualArtifact(entryPath, expectedBase)
			)
				return true;
		} catch {}
	}
	return false;
};

export const hasLegacyWorkArtifacts = (legacyPath: string): boolean => {
	let entries: Dirent[];
	try {
		entries = readdirSync(legacyPath, { withFileTypes: true });
	} catch {
		return false;
	}
	for (const entry of entries) {
		const entryPath = join(legacyPath, entry.name);
		if (!isEligibleLegacyWorkEntry(entry.name, entryPath, legacyPath)) continue;
		if (entry.isFile()) return true;
		if (entry.isDirectory() && containsActualArtifact(entryPath, legacyPath))
			return true;
	}
	return false;
};

export const moveLegacyWork = (
	projectRoot: string,
	legacyPath: string,
): LegacyWorkResult => {
	const destDir = join(projectRoot, ".rp1", "work");

	mkdirSync(destDir, { recursive: true });

	let totalMoved = 0;
	let totalSkipped = 0;

	const entries = readdirSync(legacyPath, { withFileTypes: true });
	for (const entry of entries) {
		if (!isWorkArtifact(entry.name)) {
			totalSkipped++;
			continue;
		}

		const srcPath = join(legacyPath, entry.name);
		const destPath = join(destDir, entry.name);

		if (entry.isDirectory()) {
			if (!existsSync(destPath)) {
				mkdirSync(destPath, { recursive: true });
			}
			const sub = moveRecursive(srcPath, destPath, legacyPath);
			totalMoved += sub.moved;
			totalSkipped += sub.skipped;
		} else if (entry.isFile()) {
			if (existsSync(destPath)) {
				totalSkipped++;
			} else {
				moveFile(srcPath, destPath);
				totalMoved++;
			}
		}
	}

	return {
		legacyPath,
		filesMoved: totalMoved,
		filesSkipped: totalSkipped,
	};
};
