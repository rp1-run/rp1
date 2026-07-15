import {
	copyFileSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	renameSync,
	unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
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
		const target = resolve(filePath);
		return !target.startsWith(resolve(expectedBase));
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

	try {
		const entries = readdirSync(legacyPath);
		if (entries.length === 0) return undefined;
	} catch {
		return undefined;
	}

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

const isWorkArtifact = (entryName: string): boolean => {
	if (KNOWN_WORK_ENTRIES.has(entryName)) return true;
	// JSON/markdown files at top level are likely work artifacts
	if (entryName.endsWith(".md") || entryName.endsWith(".json")) return true;
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
