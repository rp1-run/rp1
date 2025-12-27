/**
 * Project context detection for greenfield/brownfield classification.
 * Determines whether a directory represents an existing codebase (brownfield)
 * or a new project (greenfield) based on git presence and source file existence.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import { detectGitRoot, type GitRootResult } from "./git-root.js";

/**
 * Project context classification.
 */
export type ProjectContext = "brownfield" | "greenfield";

/**
 * Result of project context detection.
 */
export interface ContextDetectionResult {
	readonly context: ProjectContext;
	readonly gitResult: GitRootResult;
	readonly hasSourceFiles: boolean;
	readonly reasoning: string;
}

/**
 * Source file extensions to check for existing code.
 */
const SOURCE_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".py",
	".rs",
	".go",
	".java",
	".kt",
	".scala",
	".rb",
	".php",
	".c",
	".cpp",
	".h",
	".cs",
	".swift",
	".m",
]);

/**
 * Directories to skip when checking for source files.
 */
const SKIP_DIRS = new Set([
	"node_modules",
	".git",
	"dist",
	"build",
	"target",
	"__pycache__",
]);

/**
 * Recursively checks if a directory contains any source files.
 * Stops early when a source file is found for performance.
 *
 * @param dirPath - Directory to check
 * @param depth - Current recursion depth (max 10 to prevent deep traversal)
 * @returns true if source files exist, false otherwise
 */
async function hasSourceFiles(dirPath: string, depth = 0): Promise<boolean> {
	if (depth > 10) {
		return false;
	}

	try {
		const entries = await fs.readdir(dirPath, { withFileTypes: true });

		for (const entry of entries) {
			if (entry.isFile()) {
				const ext = path.extname(entry.name).toLowerCase();
				if (SOURCE_EXTENSIONS.has(ext)) {
					return true;
				}
			} else if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
				const subPath = path.join(dirPath, entry.name);
				if (await hasSourceFiles(subPath, depth + 1)) {
					return true;
				}
			}
		}

		return false;
	} catch {
		return false;
	}
}

/**
 * Checks if a directory is empty (contains no files or directories).
 *
 * @param dirPath - Directory to check
 * @returns true if directory is empty, false otherwise
 */
async function isDirectoryEmpty(dirPath: string): Promise<boolean> {
	try {
		const entries = await fs.readdir(dirPath);
		return entries.length === 0;
	} catch {
		return true;
	}
}

/**
 * Detects the project context (greenfield or brownfield) for a directory.
 *
 * Detection rules per BR-002:
 * 1. Empty directory -> Greenfield
 * 2. .git with source files -> Brownfield
 * 3. .git without source files -> Greenfield
 * 4. No .git but files exist -> Brownfield
 *
 * @param cwd - Directory to analyze
 * @returns TaskEither that always succeeds with ContextDetectionResult
 */
export const detectProjectContext = (
	cwd: string,
): TE.TaskEither<never, ContextDetectionResult> =>
	pipe(
		detectGitRoot(cwd),
		TE.chain((gitResult) =>
			TE.tryCatch(
				async () => {
					const isEmpty = await isDirectoryEmpty(cwd);

					if (isEmpty) {
						return {
							context: "greenfield" as ProjectContext,
							gitResult,
							hasSourceFiles: false,
							reasoning: "Empty directory",
						};
					}

					const foundSourceFiles = await hasSourceFiles(cwd);

					let context: ProjectContext;
					let reasoning: string;

					if (gitResult.isGitRepo && foundSourceFiles) {
						context = "brownfield";
						reasoning = "Git repository with existing source files";
					} else if (gitResult.isGitRepo && !foundSourceFiles) {
						context = "greenfield";
						reasoning = "Git repository without source files";
					} else if (!gitResult.isGitRepo && foundSourceFiles) {
						context = "brownfield";
						reasoning = "Directory contains source files (no git)";
					} else {
						context = "greenfield";
						reasoning = "No source files detected";
					}

					return {
						context,
						gitResult,
						hasSourceFiles: foundSourceFiles,
						reasoning,
					};
				},
				() =>
					({
						context: "greenfield" as ProjectContext,
						gitResult,
						hasSourceFiles: false,
						reasoning: "Detection failed, defaulting to greenfield",
					}) as never,
			),
		),
	);
