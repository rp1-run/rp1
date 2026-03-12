/**
 * TOML config.toml management for Codex CLI installation.
 * Handles reading, merging, and fencing of rp1-managed sections in ~/.codex/config.toml.
 * Uses shell-fence.ts utilities for # rp1:start / # rp1:end comment markers.
 */

import { mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { configError, installError } from "../../../shared/errors.js";
import {
	findShellFencedContent,
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
 * Build the platform-specific writable_roots paths that rp1 needs
 * outside the project directory (status DB, project registry, settings).
 */
export const getWritableRoots = (): readonly string[] => {
	const home = homedir();
	const roots: string[] = [join(home, ".rp1")];

	const platform = process.platform;
	if (platform === "darwin") {
		roots.push(join(home, "Library", "Application Support", "rp1"));
	} else if (platform === "win32") {
		const appData = process.env.APPDATA;
		roots.push(
			appData ? join(appData, "rp1") : join(home, "AppData", "Roaming", "rp1"),
		);
	} else {
		const xdgConfig = process.env.XDG_CONFIG_HOME;
		roots.push(
			xdgConfig ? join(xdgConfig, "rp1") : join(home, ".config", "rp1"),
		);
	}

	return roots;
};

/**
 * Generate the [sandbox_workspace_write] TOML section with platform-specific writable roots.
 */
const generateWritableRootsSection = (): string => {
	const roots = getWritableRoots();
	const entries = roots.map((r) => `"${r}"`).join(", ");
	return `[sandbox_workspace_write]\nwritable_roots = [${entries}]`;
};

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

			sections.push(
				"# Allow rp1 to write status DB, project registry, and settings",
			);
			sections.push(generateWritableRootsSection());
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
 * Extract user-owned content (everything outside the rp1 fence).
 * Used to detect tables the user already defines so we can skip them in our patch.
 */
const getUserContent = (content: string): string => {
	const position = findShellFencedContent(content);
	if (!position) return content;
	return content.slice(0, position.start) + content.slice(position.end);
};

/**
 * Collect top-level TOML table names from parsed TOML data.
 * Returns table names like "features", "agents.rp1-build", etc.
 */
const getTableNames = (
	parsed: Record<string, unknown>,
	prefix = "",
): Set<string> => {
	const names = new Set<string>();
	for (const key of Object.keys(parsed)) {
		const fullKey = prefix ? `${prefix}.${key}` : key;
		names.add(fullKey);
		const value = parsed[key];
		if (typeof value === "object" && value !== null && !Array.isArray(value)) {
			for (const sub of getTableNames(
				value as Record<string, unknown>,
				fullKey,
			)) {
				names.add(sub);
			}
		}
	}
	return names;
};

/**
 * Remove TOML sections from patch text that would duplicate tables the user
 * already defines outside the rp1 fence. Operates on the raw patch string
 * by dropping lines between conflicting [table] headers.
 */
export const deduplicatePatch = (
	patch: string,
	userContent: string,
): { patch: string; skipped: readonly string[] } => {
	// Parse user content to discover existing tables
	let userTables: Set<string>;
	try {
		const parsed = Bun.TOML.parse(userContent) as Record<string, unknown>;
		userTables = getTableNames(parsed);
	} catch {
		// User content doesn't parse (shouldn't happen), skip dedup
		return { patch, skipped: [] };
	}

	if (userTables.size === 0) return { patch, skipped: [] };

	const lines = patch.split("\n");
	const outputLines: string[] = [];
	const skipped: string[] = [];
	let skippingTable: string | null = null;

	for (const line of lines) {
		const trimmed = line.trim();

		// Detect [table] or [table.subtable] headers (not [[array]])
		const tableMatch = trimmed.match(/^\[([^[\]]+)\]$/);
		if (tableMatch) {
			const tableName = tableMatch[1].trim();
			if (userTables.has(tableName)) {
				skippingTable = tableName;
				skipped.push(tableName);
				continue;
			}
			skippingTable = null;
		}

		// Detect [[array.table]] headers - these are safe (additive)
		const arrayMatch = trimmed.match(/^\[\[([^[\]]+)\]\]$/);
		if (arrayMatch) {
			skippingTable = null;
		}

		if (skippingTable !== null) {
			// Skip lines belonging to the duplicate table (until next header or blank)
			if (trimmed.length === 0) {
				skippingTable = null;
			}
			continue;
		}

		outputLines.push(line);
	}

	return { patch: outputLines.join("\n"), skipped };
};

/**
 * Deduplicate [[shell.approved]] entries that already exist in user content.
 * Returns patch with redundant approval patterns removed.
 */
const deduplicateShellApprovals = (
	patch: string,
	userContent: string,
): string => {
	let userParsed: Record<string, unknown>;
	try {
		userParsed = Bun.TOML.parse(userContent) as Record<string, unknown>;
	} catch {
		return patch;
	}

	const userShell = userParsed.shell as
		| { approved?: Array<{ pattern?: string }> }
		| undefined;
	if (!userShell?.approved || userShell.approved.length === 0) return patch;

	const existingPatterns = new Set(
		userShell.approved.map((a) => a.pattern).filter(Boolean),
	);
	if (existingPatterns.size === 0) return patch;

	// Remove [[shell.approved]] blocks whose pattern already exists
	const lines = patch.split("\n");
	const outputLines: string[] = [];
	let i = 0;

	while (i < lines.length) {
		if (lines[i].trim() === "[[shell.approved]]") {
			// Look ahead for the pattern line
			const patternLine = i + 1 < lines.length ? lines[i + 1] : "";
			const patternMatch = patternLine.match(/^pattern\s*=\s*"(.+)"$/);
			if (patternMatch && existingPatterns.has(patternMatch[1])) {
				// Skip this entire [[shell.approved]] block
				i += 2;
				// Skip trailing blank line
				if (i < lines.length && lines[i].trim() === "") i++;
				continue;
			}
		}
		outputLines.push(lines[i]);
		i++;
	}

	return outputLines.join("\n");
};

/**
 * Merge a config patch into existing config.toml content using shell fencing.
 * If fenced content already exists, it is replaced. Otherwise, it is appended.
 * Non-rp1 content is always preserved.
 *
 * Deduplicates the patch against user content to prevent TOML conflicts:
 * - Regular tables ([features], [agents.X]) that the user already defines are skipped
 * - [[shell.approved]] entries with patterns the user already has are skipped
 */
export const mergeCodexConfig = (
	existingContent: string,
	patch: string,
): string => {
	const userContent = getUserContent(existingContent);

	// Deduplicate regular tables and shell approvals
	const { patch: dedupedPatch } = deduplicatePatch(patch, userContent);
	const finalPatch = deduplicateShellApprovals(dedupedPatch, userContent);

	return replaceShellFencedContent(existingContent, finalPatch);
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
 * Validate that a string is syntactically valid TOML.
 * Uses Bun's built-in TOML parser. Returns the parse error message on failure.
 */
export const validateToml = (content: string): string | null => {
	try {
		Bun.TOML.parse(content);
		return null;
	} catch (e) {
		return e instanceof Error ? e.message : String(e);
	}
};

/**
 * Write config.toml content to disk, creating parent directories if needed.
 * Validates the content as syntactically valid TOML before writing to prevent
 * corrupting the user's Codex configuration.
 */
export const writeCodexConfig = (
	configPath: string,
	content: string,
): TE.TaskEither<CLIError, void> =>
	TE.tryCatch(
		async () => {
			const tomlError = validateToml(content);
			if (tomlError) {
				throw configError(
					`Refusing to write invalid TOML to ${configPath}. ` +
						`This would break your Codex CLI configuration.\n` +
						`Parse error: ${tomlError}\n` +
						`No changes were made to your config file.`,
				);
			}

			await mkdir(dirname(configPath), { recursive: true });
			const { writeFile: fsWriteFile } = await import("node:fs/promises");
			await fsWriteFile(configPath, content, "utf-8");
		},
		(e) => {
			if (
				typeof e === "object" &&
				e !== null &&
				"_tag" in e &&
				(e as CLIError)._tag === "ConfigError"
			) {
				return e as CLIError;
			}
			return configError(`Failed to write Codex config: ${e}`);
		},
	);
