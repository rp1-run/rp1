import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const PROJECT_ID_FILENAME = "project_id";

const PROJECT_ID_PATH = (projectRoot: string): string =>
	join(projectRoot, ".rp1", PROJECT_ID_FILENAME);

export const readProjectId = (projectRoot: string): string | undefined => {
	const filePath = PROJECT_ID_PATH(projectRoot);
	if (!existsSync(filePath)) return undefined;
	const content = readFileSync(filePath, "utf-8").trim();
	return content.length > 0 ? content : undefined;
};

export const ensureProjectId = async (projectRoot: string): Promise<string> => {
	const existing = readProjectId(projectRoot);
	if (existing) return existing;

	const rp1Dir = join(projectRoot, ".rp1");
	if (!existsSync(rp1Dir)) {
		mkdirSync(rp1Dir, { recursive: true });
	}

	const id = randomUUID();
	writeFileSync(PROJECT_ID_PATH(projectRoot), id);
	return id;
};
