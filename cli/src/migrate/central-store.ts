import { execFileSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
	hasFencedContent,
	removeFencedContent,
} from "../init/comment-fence.js";
import { GITIGNORE_PRESETS } from "../init/models.js";
import { replaceShellFencedContent } from "../init/shell-fence.js";
import { LATEST_FENCE_VERSION } from "../lib/fence-version.js";

export interface RelocateResult {
	readonly contextFiles: number;
	readonly workFiles: number;
	readonly skipped: number;
}

export interface RelocateOptions {
	readonly dryRun?: boolean;
	readonly homeDir?: string;
}

export interface WriteStorageSectionOptions {
	readonly dryRun?: boolean;
}

export interface UpdateGitignoreResult {
	readonly updated: boolean;
}

export interface UpdateGitignoreOptions {
	readonly dryRun?: boolean;
}

export interface GitUnstageResult {
	readonly unstaged: string[];
}

export interface GitUnstageOptions {
	readonly dryRun?: boolean;
}

export interface RemoveStanzasResult {
	readonly filesModified: string[];
	readonly filesSkipped: string[];
}

export interface RemoveStanzasOptions {
	readonly dryRun?: boolean;
}

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

const moveRecursive = (
	srcDir: string,
	destDir: string,
): { moved: number; skipped: number } => {
	if (!existsSync(srcDir)) {
		return { moved: 0, skipped: 0 };
	}

	let moved = 0;
	let skipped = 0;

	const entries = readdirSync(srcDir, { withFileTypes: true });

	for (const entry of entries) {
		const srcPath = join(srcDir, entry.name);
		const destPath = join(destDir, entry.name);

		if (entry.isDirectory()) {
			if (!existsSync(destPath)) {
				mkdirSync(destPath, { recursive: true });
			}
			const sub = moveRecursive(srcPath, destPath);
			moved += sub.moved;
			skipped += sub.skipped;
		} else if (entry.isFile() || entry.isSymbolicLink()) {
			if (existsSync(destPath)) {
				skipped++;
			} else {
				mkdirSync(dirname(destPath), { recursive: true });
				moveFile(srcPath, destPath);
				moved++;
			}
		}
	}

	return { moved, skipped };
};

const countFiles = (dir: string): number => {
	if (!existsSync(dir)) return 0;
	let count = 0;
	const entries = readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		if (entry.isDirectory()) {
			count += countFiles(join(dir, entry.name));
		} else if (entry.isFile() || entry.isSymbolicLink()) {
			count++;
		}
	}
	return count;
};

export const relocateToCenter = (
	projectRoot: string,
	projectId: string,
	options: RelocateOptions = {},
): RelocateResult => {
	const { dryRun = false, homeDir: homeDirOverride } = options;
	const home = homeDirOverride ?? homedir();
	const centralBase = join(home, ".rp1", "projects", projectId);

	const contextSrc = join(projectRoot, ".rp1", "context");
	const workSrc = join(projectRoot, ".rp1", "work");
	const contextDest = join(centralBase, "context");
	const workDest = join(centralBase, "work");

	if (dryRun) {
		const contextFiles = countFiles(contextSrc);
		const workFiles = countFiles(workSrc);
		return { contextFiles, workFiles, skipped: 0 };
	}

	mkdirSync(contextDest, { recursive: true });
	mkdirSync(workDest, { recursive: true });

	const contextResult = moveRecursive(contextSrc, contextDest);
	const workResult = moveRecursive(workSrc, workDest);

	return {
		contextFiles: contextResult.moved,
		workFiles: workResult.moved,
		skipped: contextResult.skipped + workResult.skipped,
	};
};

const STORAGE_HEADER_RE = /^\[storage\]\s*$/;
const ANY_TABLE_HEADER_RE = /^\[.+\]\s*$/;
const MODE_KEY_RE = /^mode\s*=/;

export const writeStorageSection = (
	filePath: string,
	mode: string,
	options: WriteStorageSectionOptions = {},
): boolean => {
	if (options.dryRun) {
		if (!existsSync(filePath)) return true;
		const content = readFileSync(filePath, "utf-8");
		const lines = content.split("\n");
		const range = findSectionRange(lines, STORAGE_HEADER_RE);
		if (range === null) return true;
		const existingMode = extractModeValue(lines, range);
		return existingMode !== mode;
	}

	if (!existsSync(filePath)) {
		const parentDir = dirname(filePath);
		mkdirSync(parentDir, { recursive: true });
		writeFileSync(filePath, `[storage]\nmode = "${mode}"\n`, "utf-8");
		return true;
	}

	const content = readFileSync(filePath, "utf-8");
	const lines = content.split("\n");

	const range = findSectionRange(lines, STORAGE_HEADER_RE);

	if (range === null) {
		const appendLines: string[] = [];
		if (content.length > 0 && !content.endsWith("\n\n")) {
			if (!content.endsWith("\n")) {
				appendLines.push("");
			}
			appendLines.push("");
		}
		appendLines.push("[storage]");
		appendLines.push(`mode = "${mode}"`);
		appendLines.push("");
		writeFileSync(filePath, content + appendLines.join("\n"), "utf-8");
		return true;
	}

	const existingMode = extractModeValue(lines, range);
	if (existingMode === mode) {
		return false;
	}

	const modeLineIndex = findKeyLine(lines, range, MODE_KEY_RE);
	if (modeLineIndex !== -1) {
		lines[modeLineIndex] = `mode = "${mode}"`;
	} else {
		const insertAt = findInsertionPoint(lines, range);
		lines.splice(insertAt, 0, `mode = "${mode}"`);
	}

	writeFileSync(filePath, lines.join("\n"), "utf-8");
	return true;
};

function findSectionRange(
	lines: string[],
	headerRe: RegExp,
): { headerIndex: number; endIndex: number } | null {
	const headerIndex = lines.findIndex((line) => headerRe.test(line));
	if (headerIndex === -1) return null;

	let endIndex = headerIndex;
	for (let i = headerIndex + 1; i < lines.length; i++) {
		if (ANY_TABLE_HEADER_RE.test(lines[i])) break;
		endIndex = i;
	}

	return { headerIndex, endIndex };
}

function extractModeValue(
	lines: string[],
	range: { headerIndex: number; endIndex: number },
): string | null {
	for (let i = range.headerIndex + 1; i <= range.endIndex; i++) {
		const match = lines[i].match(/^mode\s*=\s*"([^"]+)"/);
		if (match) return match[1];
	}
	return null;
}

function findKeyLine(
	lines: string[],
	range: { headerIndex: number; endIndex: number },
	keyRe: RegExp,
): number {
	for (let i = range.headerIndex + 1; i <= range.endIndex; i++) {
		if (keyRe.test(lines[i])) return i;
	}
	return -1;
}

function findInsertionPoint(
	lines: string[],
	range: { headerIndex: number; endIndex: number },
): number {
	let insertAt = range.headerIndex + 1;
	for (let i = range.endIndex; i > range.headerIndex; i--) {
		if (lines[i].trim() !== "") {
			insertAt = i + 1;
			break;
		}
	}
	return insertAt;
}

export const updateGitignoreCentral = (
	projectRoot: string,
	options: UpdateGitignoreOptions = {},
): UpdateGitignoreResult => {
	const gitignorePath = join(projectRoot, ".gitignore");
	const centralPreset = GITIGNORE_PRESETS.central;
	const existing = existsSync(gitignorePath)
		? readFileSync(gitignorePath, "utf-8")
		: "";
	const candidate = replaceShellFencedContent(
		existing,
		centralPreset,
		LATEST_FENCE_VERSION,
	);
	const updated = candidate !== existing;

	if (updated && !options.dryRun) {
		writeFileSync(gitignorePath, candidate, "utf-8");
	}

	return { updated };
};

const isGitRepo = (dirPath: string): boolean =>
	existsSync(join(dirPath, ".git"));

export const gitUnstageTracked = (
	projectRoot: string,
	dirs: string[],
	options: GitUnstageOptions = {},
): GitUnstageResult => {
	if (!isGitRepo(projectRoot)) {
		return { unstaged: [] };
	}

	const unstaged: string[] = [];

	for (const dir of dirs) {
		const relDir = dir.startsWith(projectRoot)
			? dir.slice(projectRoot.length + 1)
			: dir;

		let trackedFiles: string;
		try {
			trackedFiles = execFileSync("git", ["ls-files", relDir], {
				cwd: projectRoot,
				encoding: "utf-8",
			}).trim();
		} catch {
			continue;
		}

		if (trackedFiles.length === 0) {
			continue;
		}

		if (options.dryRun) {
			unstaged.push(...trackedFiles.split("\n").filter(Boolean));
			continue;
		}

		try {
			execFileSync("git", ["rm", "--cached", "-r", relDir], {
				cwd: projectRoot,
				encoding: "utf-8",
			});
			unstaged.push(...trackedFiles.split("\n").filter(Boolean));
		} catch {
			// git rm --cached may fail if files were already removed
		}
	}

	return { unstaged };
};

export const removeProjectStanzas = (
	projectRoot: string,
	options: RemoveStanzasOptions = {},
): RemoveStanzasResult => {
	const filesModified: string[] = [];
	const filesSkipped: string[] = [];

	const targets = ["CLAUDE.md", "AGENTS.md"];

	for (const fileName of targets) {
		const filePath = join(projectRoot, fileName);

		if (!existsSync(filePath)) {
			filesSkipped.push(fileName);
			continue;
		}

		let content: string;
		try {
			content = readFileSync(filePath, "utf-8");
		} catch {
			filesSkipped.push(fileName);
			continue;
		}

		if (!hasFencedContent(content)) {
			filesSkipped.push(fileName);
			continue;
		}

		if (options.dryRun) {
			filesModified.push(fileName);
			continue;
		}

		const cleaned = removeFencedContent(content);
		writeFileSync(filePath, cleaned, "utf-8");
		filesModified.push(fileName);
	}

	return { filesModified, filesSkipped };
};
