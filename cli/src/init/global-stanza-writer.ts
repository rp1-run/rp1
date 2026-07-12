import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
	appendFencedContent,
	hasFencedContent,
	removeFencedContent,
	replaceFencedContent,
	validateFencing,
} from "./comment-fence.js";
import {
	GLOBAL_INSTRUCTION_PATH_MAP,
	resolveGlobalInstructionPath,
} from "./global-path-map.js";
import {
	buildGlobalStanzaContent,
	LATEST_FENCE_VERSION,
} from "./global-stanza-template.js";

export interface GlobalStanzaResult {
	readonly written: string[];
	readonly updated: string[];
	readonly removed: string[];
	readonly skipped: string[];
	readonly errors: Array<{ platform: string; error: string }>;
	readonly paths: ReadonlyMap<string, string>;
}

export interface ManageGlobalStanzasOptions {
	readonly homeDir?: string;
	readonly dryRun?: boolean;
}

async function readFileContent(filePath: string): Promise<string | null> {
	try {
		return await fs.readFile(filePath, "utf-8");
	} catch {
		return null;
	}
}

async function writeFileContent(
	filePath: string,
	content: string,
): Promise<void> {
	const dir = path.dirname(filePath);
	await fs.mkdir(dir, { recursive: true });
	await fs.writeFile(filePath, content, "utf-8");
}

export async function writeGlobalStanza(
	harnessId: string,
	homeDir?: string,
): Promise<{ action: "written" | "updated"; filePath: string }> {
	const filePath = resolveGlobalInstructionPath(harnessId, homeDir);
	if (!filePath) {
		throw new Error(`Unknown harness ID: ${harnessId}`);
	}

	const stanzaContent = buildGlobalStanzaContent(harnessId);
	const existing = await readFileContent(filePath);

	if (existing === null) {
		const fenced = `${appendFencedContent("", stanzaContent, LATEST_FENCE_VERSION)}`;
		await writeFileContent(filePath, fenced);
		return { action: "written", filePath };
	}

	const fencingResult = validateFencing(existing);
	if (!fencingResult.valid) {
		throw new Error(
			`Invalid fencing in ${filePath}: ${fencingResult.error}. ` +
				"Manually fix or remove the rp1 fence markers before retrying.",
		);
	}

	if (hasFencedContent(existing)) {
		const updated = replaceFencedContent(
			existing,
			stanzaContent,
			LATEST_FENCE_VERSION,
		);
		await writeFileContent(filePath, updated);
		return { action: "updated", filePath };
	}

	const appended = appendFencedContent(
		existing,
		stanzaContent,
		LATEST_FENCE_VERSION,
	);
	await writeFileContent(filePath, appended);
	return { action: "written", filePath };
}

export async function removeGlobalStanza(
	harnessId: string,
	homeDir?: string,
): Promise<{ action: "removed" | "skipped"; filePath: string | null }> {
	const filePath = resolveGlobalInstructionPath(harnessId, homeDir);
	if (!filePath) {
		return { action: "skipped", filePath: null };
	}

	const existing = await readFileContent(filePath);
	if (existing === null || !hasFencedContent(existing)) {
		return { action: "skipped", filePath };
	}

	const cleaned = removeFencedContent(existing);
	await writeFileContent(filePath, cleaned);
	return { action: "removed", filePath };
}

export async function manageGlobalStanzas(
	enabledHarnesses: readonly string[],
	options: ManageGlobalStanzasOptions = {},
): Promise<GlobalStanzaResult> {
	const { homeDir, dryRun = false } = options;
	const enabledSet = new Set(enabledHarnesses);
	const allPlatforms = Object.keys(GLOBAL_INSTRUCTION_PATH_MAP);

	const result: {
		written: string[];
		updated: string[];
		removed: string[];
		skipped: string[];
		errors: Array<{ platform: string; error: string }>;
		paths: Map<string, string>;
	} = {
		written: [],
		updated: [],
		removed: [],
		skipped: [],
		errors: [],
		paths: new Map(),
	};

	for (const platform of allPlatforms) {
		if (enabledSet.has(platform)) {
			try {
				if (dryRun) {
					const filePath = resolveGlobalInstructionPath(platform, homeDir);
					if (!filePath) {
						result.skipped.push(platform);
						continue;
					}
					result.paths.set(platform, filePath);
					const existing = await readFileContent(filePath);
					if (existing === null || !hasFencedContent(existing)) {
						result.written.push(platform);
					} else {
						result.updated.push(platform);
					}
				} else {
					const { action, filePath } = await writeGlobalStanza(
						platform,
						homeDir,
					);
					result.paths.set(platform, filePath);
					if (action === "written") {
						result.written.push(platform);
					} else {
						result.updated.push(platform);
					}
				}
			} catch (err) {
				result.errors.push({
					platform,
					error: err instanceof Error ? err.message : String(err),
				});
			}
		} else {
			const filePath = resolveGlobalInstructionPath(platform, homeDir);
			if (!filePath) {
				result.skipped.push(platform);
				continue;
			}

			try {
				const existing = await readFileContent(filePath);
				if (existing === null || !hasFencedContent(existing)) {
					result.skipped.push(platform);
					continue;
				}

				result.paths.set(platform, filePath);
				if (dryRun) {
					result.removed.push(platform);
				} else {
					await removeGlobalStanza(platform, homeDir);
					result.removed.push(platform);
				}
			} catch (err) {
				result.errors.push({
					platform,
					error: err instanceof Error ? err.message : String(err),
				});
			}
		}
	}

	return result;
}
