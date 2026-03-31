import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface GitignoreUpdateResult {
	readonly updated: boolean;
	readonly rulesAdded: readonly string[];
}

const WORK_IGNORE_PATTERN = ".rp1/*";
const PROJECT_ID_UNIGNORE = "!.rp1/project_id";
const RP1_UNIGNORE = "!.rp1/";

const hasLine = (content: string, line: string): boolean =>
	content.split("\n").some((l) => l.trim() === line);

export const updateGitignore = (projectRoot: string): GitignoreUpdateResult => {
	const gitignorePath = join(projectRoot, ".gitignore");
	const rulesAdded: string[] = [];

	let content = "";
	if (existsSync(gitignorePath)) {
		content = readFileSync(gitignorePath, "utf-8");
	}

	if (
		hasLine(content, WORK_IGNORE_PATTERN) &&
		hasLine(content, PROJECT_ID_UNIGNORE) &&
		hasLine(content, RP1_UNIGNORE)
	) {
		return { updated: false, rulesAdded: [] };
	}

	const linesToAdd: string[] = [];

	if (!hasLine(content, RP1_UNIGNORE)) {
		linesToAdd.push(RP1_UNIGNORE);
		rulesAdded.push(RP1_UNIGNORE);
	}

	if (!hasLine(content, WORK_IGNORE_PATTERN)) {
		linesToAdd.push(WORK_IGNORE_PATTERN);
		rulesAdded.push(WORK_IGNORE_PATTERN);
	}

	if (!hasLine(content, PROJECT_ID_UNIGNORE)) {
		linesToAdd.push(PROJECT_ID_UNIGNORE);
		rulesAdded.push(PROJECT_ID_UNIGNORE);
	}

	if (linesToAdd.length === 0) {
		return { updated: false, rulesAdded: [] };
	}

	const separator =
		content.length > 0 && !content.endsWith("\n") ? "\n\n" : "\n";
	const prefix = content.length === 0 ? "" : content.trimEnd() + separator;
	const section = `# rp1 directory\n${linesToAdd.join("\n")}\n`;

	writeFileSync(gitignorePath, prefix + section);

	return { updated: true, rulesAdded };
};
