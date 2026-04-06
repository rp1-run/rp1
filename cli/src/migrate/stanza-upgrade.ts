import * as fs from "node:fs";
import * as path from "node:path";
import * as E from "fp-ts/lib/Either.js";
import {
	extractFenceVersion,
	hasFencedContent,
	replaceFencedContent,
} from "../init/comment-fence.js";
import { buildManagedGitignoreContent } from "../init/gitignore.js";
import {
	extractShellFenceVersion,
	hasShellFencedContent,
	replaceShellFencedContent,
} from "../init/shell-fence.js";
import {
	AGENTS_TEMPLATE,
	CLAUDE_CODE_TEMPLATE,
} from "../init/templates/generated.js";
import { LATEST_FENCE_VERSION } from "../lib/fence-version.js";
import { compareVersions } from "../lib/version.js";

export interface StanzaFileUpgrade {
	readonly file: string;
	readonly fromVersion: string;
	readonly toVersion: string;
}

export interface StanzaUpgradeResult {
	readonly filesScanned: number;
	readonly filesUpgraded: StanzaFileUpgrade[];
	readonly filesAlreadyCurrent: string[];
	readonly filesNotFound: string[];
	readonly errors: Array<{ file: string; error: string }>;
}

interface UpgradeSpec {
	readonly file: string;
	readonly versionExtractor: (content: string) => string | null;
	readonly hasFence: (content: string) => boolean;
	readonly getTemplate: () => string;
	readonly replacer: (
		content: string,
		newContent: string,
		version?: string,
	) => string;
}

function getGitignoreTemplate(): string {
	const result = buildManagedGitignoreContent(".", "recommended");
	if (E.isLeft(result)) {
		return "";
	}
	return result.right;
}

const UPGRADE_SPECS: readonly UpgradeSpec[] = [
	{
		file: "CLAUDE.md",
		versionExtractor: extractFenceVersion,
		hasFence: hasFencedContent,
		getTemplate: () => CLAUDE_CODE_TEMPLATE,
		replacer: replaceFencedContent,
	},
	{
		file: "AGENTS.md",
		versionExtractor: extractFenceVersion,
		hasFence: hasFencedContent,
		getTemplate: () => AGENTS_TEMPLATE,
		replacer: replaceFencedContent,
	},
	{
		file: ".gitignore",
		versionExtractor: extractShellFenceVersion,
		hasFence: hasShellFencedContent,
		getTemplate: getGitignoreTemplate,
		replacer: replaceShellFencedContent,
	},
];

function readFileSafe(filePath: string): string | null {
	try {
		return fs.readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}
}

export function upgradeStanzas(projectRoot: string): StanzaUpgradeResult {
	const filesUpgraded: StanzaFileUpgrade[] = [];
	const filesAlreadyCurrent: string[] = [];
	const filesNotFound: string[] = [];
	const errors: Array<{ file: string; error: string }> = [];

	for (const spec of UPGRADE_SPECS) {
		const filePath = path.join(projectRoot, spec.file);
		const content = readFileSafe(filePath);

		if (content === null) {
			filesNotFound.push(spec.file);
			continue;
		}

		if (!spec.hasFence(content)) {
			continue;
		}

		try {
			const version = spec.versionExtractor(content);
			const effectiveVersion = version ?? "0.0.0";

			const cmp = compareVersions(effectiveVersion, LATEST_FENCE_VERSION);
			if (cmp >= 0) {
				filesAlreadyCurrent.push(spec.file);
				continue;
			}

			const template = spec.getTemplate();
			if (!template) {
				errors.push({
					file: spec.file,
					error: "Failed to generate template content",
				});
				continue;
			}

			const updated = spec.replacer(content, template, LATEST_FENCE_VERSION);
			fs.writeFileSync(filePath, updated);

			filesUpgraded.push({
				file: spec.file,
				fromVersion: effectiveVersion,
				toVersion: LATEST_FENCE_VERSION,
			});
		} catch (err) {
			errors.push({
				file: spec.file,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	return {
		filesScanned: UPGRADE_SPECS.length,
		filesUpgraded,
		filesAlreadyCurrent,
		filesNotFound,
		errors,
	};
}
