import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { resolveDirectorySet } from "../../shared/directory-resolution.js";
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
 * Only flags as ancestor when the resolved project root has a project_id file.
 * A stale .rp1/ directory without project_id does not trigger the ancestor prompt.
 */
export const detectAncestorProject = (cwd: string): AncestorProjectInfo => {
	const resolvedCwd = path.resolve(cwd);
	const result = resolveDirectorySet(cwd);

	if (E.isLeft(result)) {
		return { isAncestor: false, ancestorRoot: undefined };
	}

	const resolvedProjectRoot = path.resolve(result.right.projectRoot);

	// Only flag as ancestor if:
	// 1. The resolved root is genuinely a parent, not cwd itself
	// 2. The ancestor has a project_id (not just a stale .rp1/ dir)
	if (
		resolvedProjectRoot !== resolvedCwd &&
		result.right.projectId !== undefined
	) {
		return { isAncestor: true, ancestorRoot: resolvedProjectRoot };
	}

	return { isAncestor: false, ancestorRoot: undefined };
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
): Promise<ReinitState> {
	const directories = resolveInitDirectoryModel(cwd);
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
