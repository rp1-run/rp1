/**
 * TOML config.toml management for Codex CLI installation.
 * Handles reading, merging, and fencing of rp1-managed sections in ~/.codex/config.toml.
 * Uses shell-fence.ts utilities for # rp1:start / # rp1:end comment markers.
 */

import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { configError, installError } from "../../../shared/errors.js";
import {
	hasShellFencedContent,
	replaceShellFencedContent,
} from "../../init/shell-fence.js";

const SHELL_APPROVAL_PATTERNS = [
	"rp1 agent-tools *",
	"echo *",
	"printf *",
	"git *",
] as const;

const MANAGED_SECTION_HEADER = "# rp1 managed section - do not edit manually";

/**
 * Read existing Codex config.toml content.
 * Returns empty string if file does not exist.
 */
export const readCodexConfig = (
	configPath: string,
): TE.TaskEither<CLIError, string> =>
	TE.tryCatch(
		async () => {
			try {
				return await readFile(configPath, "utf-8");
			} catch {
				return "";
			}
		},
		(e) => configError(`Failed to read Codex config: ${e}`),
	);

/**
 * Read and concatenate all plugin rp1-agents.toml files, append shell approval
 * entries, and wrap the result in # rp1:start / # rp1:end fencing.
 *
 * The fencing content is the inner payload (without fence markers); the caller
 * uses mergeCodexConfig to inject it into the full config.
 */
export const buildConfigPatch = (
	agentTomlPaths: readonly string[],
): TE.TaskEither<CLIError, string> =>
	TE.tryCatch(
		async () => {
			const sections: string[] = [];

			sections.push(MANAGED_SECTION_HEADER);
			sections.push("");

			sections.push("[features]");
			sections.push("multi_agent = true");
			sections.push("");

			const agentSections: string[] = [];
			for (const tomlPath of agentTomlPaths) {
				try {
					const content = await readFile(tomlPath, "utf-8");
					const trimmed = content.trim();
					if (trimmed.length > 0) {
						agentSections.push(trimmed);
					}
				} catch (e) {
					throw installError(
						"build-config-patch",
						`Failed to read agent TOML at ${tomlPath}: ${e}`,
					);
				}
			}

			if (agentSections.length > 0) {
				sections.push("# Agent definitions from rp1 plugins");
				sections.push(agentSections.join("\n\n"));
				sections.push("");
			}

			sections.push("# Shell command approvals for rp1 skills");
			sections.push(generateApprovalEntries());

			return sections.join("\n");
		},
		(e) => {
			if (
				typeof e === "object" &&
				e !== null &&
				"_tag" in e &&
				(e as CLIError)._tag === "InstallError"
			) {
				return e as CLIError;
			}
			return installError(
				"build-config-patch",
				`Failed to build config patch: ${e}`,
			);
		},
	);

/**
 * Merge a config patch into existing config.toml content using shell fencing.
 * If fenced content already exists, it is replaced. Otherwise, it is appended.
 * Non-rp1 content is always preserved.
 */
export const mergeCodexConfig = (
	existingContent: string,
	patch: string,
): string => {
	return replaceShellFencedContent(existingContent, patch);
};

/**
 * Generate [[shell.approved]] TOML entries for commands that rp1 skills execute.
 * These entries prevent Codex from prompting for approval on every shell invocation.
 */
export const generateApprovalEntries = (): string => {
	return SHELL_APPROVAL_PATTERNS.map(
		(pattern) => `[[shell.approved]]\npattern = "${pattern}"`,
	).join("\n\n");
};

/**
 * Produce a human-readable diff preview showing what will change in config.toml.
 * Displays lines being added (prefixed with +) to help users understand the impact.
 */
export const generateConfigDiff = (
	existingContent: string,
	newContent: string,
): string => {
	const lines: string[] = [];

	lines.push("--- config.toml (current)");
	lines.push("+++ config.toml (after rp1 install)");
	lines.push("");

	if (existingContent.trim().length === 0) {
		lines.push("(new file will be created)");
		lines.push("");
		for (const line of newContent.split("\n")) {
			lines.push(`+ ${line}`);
		}
	} else if (!hasShellFencedContent(existingContent)) {
		lines.push("(rp1 section will be appended)");
		lines.push("");

		const existingLines = existingContent.split("\n");
		const newLines = newContent.split("\n");

		let diffStart = 0;
		for (let i = 0; i < existingLines.length; i++) {
			if (i < newLines.length && existingLines[i] === newLines[i]) {
				diffStart = i + 1;
			} else {
				break;
			}
		}

		const contextStart = Math.max(0, diffStart - 2);
		for (let i = contextStart; i < diffStart; i++) {
			if (i < existingLines.length) {
				lines.push(`  ${existingLines[i]}`);
			}
		}

		for (let i = diffStart; i < newLines.length; i++) {
			lines.push(`+ ${newLines[i]}`);
		}
	} else {
		lines.push("(rp1 section will be replaced)");
		lines.push("");

		const existingLines = existingContent.split("\n");
		const newLines = newContent.split("\n");

		let inOldFence = false;
		let inNewFence = false;
		let existingIdx = 0;
		let newIdx = 0;

		while (existingIdx < existingLines.length || newIdx < newLines.length) {
			const existingLine =
				existingIdx < existingLines.length ? existingLines[existingIdx] : null;
			const newLine = newIdx < newLines.length ? newLines[newIdx] : null;

			if (existingLine !== null && existingLine.trim() === "# rp1:start") {
				inOldFence = true;
			}

			if (newLine !== null && newLine.trim() === "# rp1:start") {
				inNewFence = true;
			}

			if (inOldFence && !inNewFence) {
				if (existingLine !== null) {
					lines.push(`- ${existingLine}`);
					existingIdx++;
					if (existingLine.trim() === "# rp1:end") {
						inOldFence = false;
					}
				}
			} else if (inNewFence && !inOldFence) {
				if (newLine !== null) {
					lines.push(`+ ${newLine}`);
					newIdx++;
					if (newLine.trim() === "# rp1:end") {
						inNewFence = false;
					}
				}
			} else if (inOldFence && inNewFence) {
				if (existingLine !== null) {
					lines.push(`- ${existingLine}`);
					existingIdx++;
					if (existingLine.trim() === "# rp1:end") {
						inOldFence = false;
					}
				}
				if (newLine !== null) {
					lines.push(`+ ${newLine}`);
					newIdx++;
					if (newLine.trim() === "# rp1:end") {
						inNewFence = false;
					}
				}
			} else {
				if (existingLine !== null && newLine !== null) {
					lines.push(`  ${newLine}`);
					existingIdx++;
					newIdx++;
				} else if (newLine !== null) {
					lines.push(`+ ${newLine}`);
					newIdx++;
				} else if (existingLine !== null) {
					lines.push(`- ${existingLine}`);
					existingIdx++;
				}
			}
		}
	}

	return lines.join("\n");
};

/**
 * Write config.toml content to disk, creating parent directories if needed.
 */
export const writeCodexConfig = (
	configPath: string,
	content: string,
): TE.TaskEither<CLIError, void> =>
	TE.tryCatch(
		async () => {
			await mkdir(dirname(configPath), { recursive: true });
			const { writeFile: fsWriteFile } = await import("node:fs/promises");
			await fsWriteFile(configPath, content, "utf-8");
		},
		(e) => configError(`Failed to write Codex config: ${e}`),
	);
