import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { resolveDirectorySet } from "../../shared/directory-resolution.js";
import { hasFencedContent } from "./comment-fence.js";
import type { ReinitState } from "./models.js";
import type { DetectedTool } from "./tool-detector.js";

export interface InitDirectoryModel {
	readonly rp1Dir: string;
	readonly contextDir: string;
	readonly workDir: string;
}

const defaultInitDirectoryModel = (cwd: string): InitDirectoryModel => {
	const rp1Root = process.env.RP1_ROOT || ".rp1";
	const rp1Dir = path.resolve(cwd, rp1Root);
	return {
		rp1Dir,
		contextDir: path.join(rp1Dir, "context"),
		workDir: path.join(rp1Dir, "work"),
	};
};

export const resolveInitDirectoryModel = (cwd: string): InitDirectoryModel => {
	const result = resolveDirectorySet(cwd);
	if (E.isLeft(result)) {
		return defaultInitDirectoryModel(cwd);
	}

	return {
		rp1Dir: path.resolve(result.right.projectRoot, ".rp1"),
		contextDir: path.resolve(result.right.kbRoot),
		workDir: path.resolve(result.right.workRoot),
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
