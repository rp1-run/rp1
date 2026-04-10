/**
 * Fence staleness scanning utility.
 * Scans instruction files for fence markers and compares their versions
 * against LATEST_FENCE_VERSION to detect outdated stanzas.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { extractFenceVersion } from "../init/comment-fence.js";
import { extractShellFenceVersion } from "../init/shell-fence.js";
import { LATEST_FENCE_VERSION } from "./fence-version.js";
import { compareVersions } from "./version.js";

export interface FenceCheckResult {
	readonly latestFenceVersion: string;
	readonly staleFiles: string[];
	readonly currentFiles: string[];
	readonly hasProject: boolean;
	readonly oldestVersion: string | null;
}

interface FileSpec {
	readonly file: string;
	readonly extractor: (content: string) => string | null;
}

const INSTRUCTION_FILES: readonly FileSpec[] = [
	{ file: "CLAUDE.md", extractor: extractFenceVersion },
	{ file: "AGENTS.md", extractor: extractFenceVersion },
	{ file: ".gitignore", extractor: extractShellFenceVersion },
];

/**
 * Scan instruction files for fence markers and check staleness
 * against LATEST_FENCE_VERSION.
 *
 * Files that don't exist are silently skipped (not stale).
 * Legacy unversioned markers (version null) are treated as 0.0.0.
 */
export function checkFenceStaleness(cwd: string): FenceCheckResult {
	const rp1Dir = path.join(cwd, ".rp1");
	if (!directoryExistsSync(rp1Dir)) {
		return {
			latestFenceVersion: LATEST_FENCE_VERSION,
			staleFiles: [],
			currentFiles: [],
			hasProject: false,
			oldestVersion: null,
		};
	}

	const staleFiles: string[] = [];
	const currentFiles: string[] = [];
	let oldestVersion: string | null = null;

	for (const { file, extractor } of INSTRUCTION_FILES) {
		const filePath = path.join(cwd, file);
		const content = readFileSyncSafe(filePath);
		if (content === null) continue;

		const version = extractor(content);
		if (version === undefined) continue;

		// null means legacy unversioned marker or no marker at all
		// If extractor returns null and there's no fenced content, skip
		if (version === null) {
			// Check if the file actually has fenced content
			// A null version with fenced content means legacy (treat as 0.0.0)
			if (!hasFenceMarker(content, file)) continue;
			staleFiles.push(file);
			// Legacy markers are treated as 0.0.0
			if (
				oldestVersion === null ||
				compareVersions("0.0.0", oldestVersion) < 0
			) {
				oldestVersion = "0.0.0";
			}
			continue;
		}

		const cmp = compareVersions(version, LATEST_FENCE_VERSION);
		if (cmp < 0) {
			staleFiles.push(file);
			if (
				oldestVersion === null ||
				compareVersions(version, oldestVersion) < 0
			) {
				oldestVersion = version;
			}
		} else {
			currentFiles.push(file);
		}
	}

	return {
		latestFenceVersion: LATEST_FENCE_VERSION,
		staleFiles,
		currentFiles,
		hasProject: true,
		oldestVersion,
	};
}

function hasFenceMarker(content: string, file: string): boolean {
	if (file === ".gitignore") {
		return content.includes("# rp1:start");
	}
	return content.includes("<!-- rp1:start");
}

function directoryExistsSync(dirPath: string): boolean {
	try {
		return fs.statSync(dirPath).isDirectory();
	} catch {
		return false;
	}
}

function readFileSyncSafe(filePath: string): string | null {
	try {
		return fs.readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}
}
