import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { resolveDirectorySet } from "../../shared/directory-resolution.js";
import type { StorageMode } from "../../shared/storage-mode.js";
import {
	computeDirectoryPaths,
	readStorageMode,
} from "../../shared/storage-mode.js";
import { hasFencedContent } from "./comment-fence.js";
import type { ReinitState } from "./models.js";
import type { DetectedTool } from "./tool-detector.js";

export interface InitDirectoryModel {
	readonly projectRoot: string;
	readonly rp1Dir: string;
	readonly contextDir: string;
	readonly workDir: string;
}

export const defaultInitDirectoryModel = (cwd: string): InitDirectoryModel => {
	const projectRoot = path.resolve(cwd);
	const rp1Dir = path.resolve(projectRoot, ".rp1");
	return {
		projectRoot,
		rp1Dir,
		contextDir: path.join(rp1Dir, "context"),
		workDir: path.join(rp1Dir, "work"),
	};
};

export interface AncestorProjectInfo {
	/** Whether the resolved project root is an ancestor directory (not cwd itself) */
	readonly isAncestor: boolean;
	/** The ancestor project root path (only meaningful when isAncestor is true) */
	readonly ancestorRoot: string | undefined;
}

export const resolveInitDirectoryModel = (cwd: string): InitDirectoryModel => {
	const result = resolveDirectorySet(cwd);
	if (E.isLeft(result)) {
		return defaultInitDirectoryModel(cwd);
	}

	return {
		projectRoot: path.resolve(result.right.projectRoot),
		rp1Dir: path.resolve(result.right.projectRoot, ".rp1"),
		contextDir: path.resolve(result.right.kbRoot),
		workDir: path.resolve(result.right.workRoot),
	};
};

/**
 * Detect whether an ancestor directory (not cwd itself) has an rp1 project with a project_id.
 * Used by init to prompt when running in a subdirectory of an existing project.
 *
 * Only flags as ancestor when:
 * - The resolved project root is a true ancestor directory of cwd (not a sibling).
 * - The ancestor has a project_id file (stale .rp1/ dirs alone do not count).
 * - cwd is not inside a linked git worktree whose main repo resolves to a sibling path.
 */
export const detectAncestorProject = (cwd: string): AncestorProjectInfo => {
	const resolvedCwd = path.resolve(cwd);
	const result = resolveDirectorySet(cwd);

	if (E.isLeft(result)) {
		return { isAncestor: false, ancestorRoot: undefined };
	}

	// Linked git worktrees resolve to the main repo root, which can be a sibling
	// path rather than an ancestor. Skip the prompt in that case.
	if (result.right.isWorktree) {
		return { isAncestor: false, ancestorRoot: undefined };
	}

	const resolvedProjectRoot = path.resolve(result.right.projectRoot);

	if (result.right.projectId === undefined) {
		return { isAncestor: false, ancestorRoot: undefined };
	}

	// Require a true parent-of relationship: cwd must live inside projectRoot,
	// not just be path-inequal to it.
	const rootWithSep = resolvedProjectRoot.endsWith(path.sep)
		? resolvedProjectRoot
		: resolvedProjectRoot + path.sep;
	if (!resolvedCwd.startsWith(rootWithSep)) {
		return { isAncestor: false, ancestorRoot: undefined };
	}

	return { isAncestor: true, ancestorRoot: resolvedProjectRoot };
};

/**
 * Return the InitDirectoryModel to use for a given init invocation.
 * When forceLocalProject is true, always treat cwd as the project root
 * (used after the user opts into a nested init). Otherwise use the
 * ancestor-climbing resolver as before.
 */
export const chooseInitDirectoryModel = (
	cwd: string,
	forceLocalProject: boolean,
): InitDirectoryModel =>
	forceLocalProject
		? defaultInitDirectoryModel(cwd)
		: resolveInitDirectoryModel(cwd);

/**
 * Resolved storage directory paths based on the project's storage mode.
 * Used after project_id and settings.toml are established to determine
 * where KB and work artifacts should be stored.
 */
export interface StorageDirectoryPaths {
	readonly contextDir: string;
	readonly workDir: string;
	readonly storageMode: StorageMode;
}

/**
 * Compute storage directories using the resolver's path computation.
 * Reads the storage mode from the project's settings.toml and delegates
 * to computeDirectoryPaths for central vs local path resolution.
 *
 * Must be called after settings.toml is written and project_id exists.
 *
 * @param homeDir - Override home directory for central path computation
 *   (test isolation seam; Bun's homedir() does not respect HOME env var)
 */
export const resolveStorageDirectoryPaths = (
	projectRoot: string,
	projectId: string,
	homeDir?: string,
): StorageDirectoryPaths => {
	const mode = readStorageMode(projectRoot);

	if (mode === "central" && homeDir !== undefined) {
		const centralBase = path.join(homeDir, ".rp1", "projects", projectId);
		return {
			contextDir: path.join(centralBase, "context"),
			workDir: path.join(centralBase, "work"),
			storageMode: "central",
		};
	}

	const { kbRoot, workRoot, effectiveMode } = computeDirectoryPaths(
		projectRoot,
		projectId,
		mode,
	);
	return {
		contextDir: kbRoot,
		workDir: workRoot,
		storageMode: effectiveMode,
	};
};

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function directoryExists(dirPath: string): Promise<boolean> {
	try {
		const stat = await fs.stat(dirPath);
		return stat.isDirectory();
	} catch {
		return false;
	}
}

async function readFileContent(filePath: string): Promise<string | null> {
	try {
		return await fs.readFile(filePath, "utf-8");
	} catch {
		return null;
	}
}

async function hasAnyFiles(dirPath: string): Promise<boolean> {
	try {
		const entries = await fs.readdir(dirPath, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isFile()) {
				return true;
			}
			if (entry.isDirectory()) {
				const subPath = path.join(dirPath, entry.name);
				if (await hasAnyFiles(subPath)) {
					return true;
				}
			}
		}
		return false;
	} catch {
		return false;
	}
}

export async function detectReinitState(
	cwd: string,
	detectedTool: DetectedTool | null,
	directoriesOverride?: InitDirectoryModel,
): Promise<ReinitState> {
	const directories = directoriesOverride ?? resolveInitDirectoryModel(cwd);
	const hasRp1Dir = await directoryExists(directories.rp1Dir);

	let hasFenced = false;
	const detectedToolInstructionFile =
		detectedTool?.tool.instruction_file ?? null;

	if (detectedToolInstructionFile) {
		const instrPath = path.resolve(cwd, detectedToolInstructionFile);
		const content = await readFileContent(instrPath);
		if (content) {
			hasFenced = hasFencedContent(content);
		}
	} else {
		for (const file of ["CLAUDE.md", "AGENTS.md"]) {
			const instrPath = path.resolve(cwd, file);
			const content = await readFileContent(instrPath);
			if (content && hasFencedContent(content)) {
				hasFenced = true;
				break;
			}
		}
	}

	const hasKB = await fileExists(path.join(directories.contextDir, "index.md"));
	const legacyWorkDir = path.join(directories.rp1Dir, "work");
	const hasWork =
		(await hasAnyFiles(legacyWorkDir)) ||
		(await hasAnyFiles(directories.workDir));

	return {
		hasRp1Dir,
		hasFencedContent: hasFenced,
		hasKBContent: hasKB,
		hasWorkContent: hasWork,
	};
}
