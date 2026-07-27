import * as fs from "node:fs";
import * as path from "node:path";
import * as E from "fp-ts/lib/Either.js";
import {
	extractFencedContent,
	extractFenceVersion,
	hasFencedContent,
	removeFencedContent,
	replaceFencedContent,
} from "../init/comment-fence.js";
import { buildManagedGitignoreContent } from "../init/gitignore.js";
import {
	extractShellFenceVersion,
	hasShellFencedContent,
	replaceShellFencedContent,
} from "../init/shell-fence.js";
import { hasUnfencedAgentsReference } from "../init/steps/project-setup.js";
import {
	AGENTS_REFERENCE_TEMPLATE,
	resolveInstructionTemplate,
} from "../init/templates/index.js";
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
	readonly getTemplate: (content: string) => string;
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
		getTemplate: (content) =>
			resolveInstructionTemplate("CLAUDE.md", { existingContent: content }),
		replacer: replaceFencedContent,
	},
	{
		file: "AGENTS.md",
		versionExtractor: extractFenceVersion,
		hasFence: hasFencedContent,
		getTemplate: (content) =>
			resolveInstructionTemplate("AGENTS.md", { existingContent: content }),
		replacer: replaceFencedContent,
	},
	{
		file: ".gitignore",
		versionExtractor: extractShellFenceVersion,
		hasFence: hasShellFencedContent,
		getTemplate: () => getGitignoreTemplate(),
		replacer: replaceShellFencedContent,
	},
];

/**
 * A CLAUDE.md has converged onto the single-file layout when it either owns a
 * bare `@AGENTS.md` import with no leftover fence, or carries nothing but the
 * reference template inside its fence.
 */
function isConvergedOntoAgentsReference(content: string): boolean {
	if (hasUnfencedAgentsReference(content)) {
		return !hasFencedContent(content);
	}
	return extractFencedContent(content) === AGENTS_REFERENCE_TEMPLATE;
}

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

	// Pre-check: determine whether AGENTS.md carries a fenced stanza so that
	// CLAUDE.md can be switched to the @AGENTS.md reference during upgrade.
	// Deliberate convergence: this applies even when CLAUDE.md is already at
	// the current fence version — dual-stanza projects collapse to the
	// single-file layout on their next migrate, not only on version bumps.
	const agentsFileContent = readFileSafe(path.join(projectRoot, "AGENTS.md"));
	const agentsHasFence =
		agentsFileContent !== null && hasFencedContent(agentsFileContent);

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

			// When both files carry fenced stanzas, CLAUDE.md should use the
			// @AGENTS.md import reference instead of a full duplicate template.
			const convergeToReference = spec.file === "CLAUDE.md" && agentsHasFence;
			const needsConvergence =
				convergeToReference && !isConvergedOntoAgentsReference(content);

			const cmp = compareVersions(effectiveVersion, LATEST_FENCE_VERSION);
			if (cmp >= 0 && !needsConvergence) {
				filesAlreadyCurrent.push(spec.file);
				continue;
			}

			// A CLAUDE.md that already imports AGENTS.md itself needs no fenced
			// reference; keeping one would import AGENTS.md twice.
			if (convergeToReference && hasUnfencedAgentsReference(content)) {
				fs.writeFileSync(filePath, removeFencedContent(content));
				filesUpgraded.push({
					file: spec.file,
					fromVersion: effectiveVersion,
					toVersion: LATEST_FENCE_VERSION,
				});
				continue;
			}

			const template = convergeToReference
				? AGENTS_REFERENCE_TEMPLATE
				: spec.getTemplate(content);

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
