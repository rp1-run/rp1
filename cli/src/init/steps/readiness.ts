/**
 * Readiness check step for the rp1 init command.
 * Performs parallel checks to determine rp1 setup readiness.
 */

import { stat } from "node:fs/promises";
import { join } from "node:path";
import { resolveInitDirectoryModel } from "../directory-model.js";
import type { StepCallbacks } from "../models.js";

/**
 * Result of rp1 readiness checks.
 * Tracks whether directories, KB, and charter exist.
 */
export interface ReadinessResult {
	readonly directoriesExist: boolean;
	readonly kbExists: boolean;
	readonly charterExists: boolean;
}

/**
 * Check if a path exists (file or directory).
 * Handles permission errors gracefully by returning false.
 *
 * @param filePath - Absolute path to check
 * @returns true if path exists, false otherwise (including permission errors)
 */
async function pathExists(filePath: string): Promise<boolean> {
	try {
		await stat(filePath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Check if a path exists and is a directory.
 * Handles permission errors gracefully by returning false.
 *
 * @param dirPath - Absolute path to check
 * @returns true if path exists and is a directory, false otherwise
 */
async function isDirectory(dirPath: string): Promise<boolean> {
	try {
		const dirStat = await stat(dirPath);
		return dirStat.isDirectory();
	} catch {
		return false;
	}
}

/**
 * Check rp1 readiness by performing parallel file system checks.
 * Checks for the local rp1 directories, KB presence, and charter presence.
 * The work root is resolved from directory settings/env but may be created on
 * demand, so it is not required for readiness.
 *
 * @param cwd - Current working directory
 * @param callbacks - Optional callbacks for reporting progress to UI
 * @returns ReadinessResult with boolean flags for each check
 */
export async function checkRp1Readiness(
	cwd: string,
	callbacks?: StepCallbacks,
): Promise<ReadinessResult> {
	callbacks?.onActivity("Checking existing rp1 configuration", "info");

	const directories = resolveInitDirectoryModel(cwd);
	const rp1Dir = directories.rp1Dir;
	const contextDir = directories.contextDir;
	const kbFile = join(contextDir, "index.md");
	const charterFile = join(contextDir, "charter.md");
	const workDir = directories.workDir;

	const [
		rp1DirExists,
		contextDirExists,
		kbExists,
		charterExists,
		workDirExists,
	] = await Promise.all([
		isDirectory(rp1Dir),
		isDirectory(contextDir),
		pathExists(kbFile),
		pathExists(charterFile),
		isDirectory(workDir),
	]);

	const directoriesExist = rp1DirExists && contextDirExists;

	// Report findings
	if (directoriesExist) {
		callbacks?.onActivity("Found existing rp1 directory structure", "info");
	}
	if (workDirExists) {
		callbacks?.onActivity("Resolved work directory exists", "info");
	}
	if (kbExists) {
		callbacks?.onActivity("Knowledge base exists", "info");
	}
	if (charterExists) {
		callbacks?.onActivity("Charter exists", "info");
	}

	return {
		directoriesExist,
		kbExists,
		charterExists,
	};
}
