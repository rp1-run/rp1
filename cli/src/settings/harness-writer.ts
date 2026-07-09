/**
 * Comment-preserving writer for the [harnesses] section of settings.toml.
 *
 * Uses targeted line edits (find/replace/append) rather than full-file
 * serialization, following the same pattern as arcade-writer.ts. smol-toml
 * is parse-only, so the writer operates on raw text to preserve user
 * comments and formatting.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolveGlobalSettingsPath } from "../../shared/settings.js";
import { resetSettingsCache } from "./loader.js";

/** Regex matching an [harnesses] table header (exact, not [harnesses.xxx]). */
const HARNESSES_HEADER_RE = /^\[harnesses\]\s*$/;

/** Regex matching any TOML table header [xxx]. */
const ANY_TABLE_HEADER_RE = /^\[.+\]\s*$/;

/** Regex matching an enabled = ... assignment. */
const ENABLED_KEY_RE = /^enabled\s*=/;

/**
 * Serialize a harness list into the TOML `enabled` value.
 * Produces `enabled = ["a", "b"]` or `enabled = []` for an empty array.
 */
function serializeEnabledLine(harnesses: readonly string[]): string {
	if (harnesses.length === 0) {
		return "enabled = []";
	}
	const quoted = harnesses.map((h) => `"${h}"`).join(", ");
	return `enabled = [${quoted}]`;
}

/**
 * Find the line range of a TOML table section.
 * Returns the header line index and the index of the last content line
 * before the next table header (or end of file).
 */
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

/**
 * Write harness selection into user-level settings.toml, preserving
 * existing content and comments.
 *
 * Behavior:
 * - If the file does not exist, creates it with the [harnesses] section.
 * - If the file exists but has no [harnesses] section, appends it at the end.
 * - If the file already has a [harnesses] section, replaces the `enabled` value
 *   in place (unlike arcade-writer which never overwrites -- harness selection
 *   is an active user choice that replaces the previous value).
 *
 * @param harnesses - Array of harness IDs to persist
 * @param globalSettingsPath - Override path to user-level settings file (defaults to ~/.config/rp1/settings.toml). Exposed for test isolation.
 */
export function writeHarnessSelection(
	harnesses: readonly string[],
	globalSettingsPath?: string,
): void {
	const filePath = globalSettingsPath ?? resolveGlobalSettingsPath();
	const enabledLine = serializeEnabledLine(harnesses);

	// Invalidate cached settings so subsequent reads see the new value.
	resetSettingsCache();

	if (!existsSync(filePath)) {
		const parentDir = dirname(filePath);
		mkdirSync(parentDir, { recursive: true });

		const sections = ["[harnesses]", enabledLine, ""];
		writeFileSync(filePath, sections.join("\n"), "utf-8");
		return;
	}

	const content = readFileSync(filePath, "utf-8");
	const lines = content.split("\n");

	const range = findSectionRange(lines, HARNESSES_HEADER_RE);

	if (range === null) {
		// No [harnesses] section -- append at end of file
		const appendLines: string[] = [];

		if (content.length > 0 && !content.endsWith("\n\n")) {
			if (!content.endsWith("\n")) {
				appendLines.push("");
			}
			appendLines.push("");
		}

		appendLines.push("[harnesses]");
		appendLines.push(enabledLine);
		appendLines.push("");

		writeFileSync(filePath, content + appendLines.join("\n"), "utf-8");
		return;
	}

	// [harnesses] section exists -- find and replace the enabled line,
	// or insert it if somehow absent.
	let replaced = false;
	for (let i = range.headerIndex + 1; i <= range.endIndex; i++) {
		if (ENABLED_KEY_RE.test(lines[i])) {
			lines[i] = enabledLine;
			replaced = true;
			break;
		}
	}

	if (!replaced) {
		// Section exists but no enabled key -- insert after header
		// (skip over any comment lines immediately after the header)
		let insertAt = range.headerIndex + 1;
		while (
			insertAt <= range.endIndex &&
			lines[insertAt].trim().startsWith("#")
		) {
			insertAt++;
		}
		lines.splice(insertAt, 0, enabledLine);
	}

	writeFileSync(filePath, lines.join("\n"), "utf-8");
}
