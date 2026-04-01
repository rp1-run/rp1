import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const projectRoot = join(import.meta.dir, "..", "..", "..", "..", "..");
const pluginsRoot = join(projectRoot, "plugins");

const collectMarkdownFiles = (dir: string): string[] => {
	const entries = readdirSync(dir);
	const files: string[] = [];

	for (const entry of entries) {
		const fullPath = join(dir, entry);
		const stat = statSync(fullPath);
		if (stat.isDirectory()) {
			files.push(...collectMarkdownFiles(fullPath));
			continue;
		}
		if (entry.endsWith(".md")) {
			files.push(fullPath);
		}
	}

	return files;
};

describe("artifact_registered directives", () => {
	test("plugin prompts always declare storageRoot explicitly", () => {
		const markdownFiles = collectMarkdownFiles(pluginsRoot);
		const missingStorageRoot: string[] = [];

		for (const filePath of markdownFiles) {
			const content = readFileSync(filePath, "utf8");
			const blocks = content.matchAll(
				/rp1 agent-tools emit[\s\S]*?--type artifact_registered[\s\S]*?--data '([^']+)'/g,
			);

			for (const block of blocks) {
				const dataPayload = block[1] ?? "";
				if (!dataPayload.includes('"storageRoot"')) {
					missingStorageRoot.push(filePath);
				}
			}
		}

		expect(missingStorageRoot).toEqual([]);
	});
});
