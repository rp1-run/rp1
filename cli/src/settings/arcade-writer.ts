/**
 * Comment-preserving writer for the [arcade] section of settings.toml.
 *
 * Uses targeted line edits (append/insert) rather than full-file serialization,
 * following the same pattern as rewriter.ts. smol-toml is parse-only, so the
 * writer operates on raw text to preserve user comments and formatting.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ArcadeSettings } from "./models.js";

/** Regex matching an [arcade] table header (exact, not [arcade.xxx]). */
const ARCADE_HEADER_RE = /^\[arcade\]\s*$/;

/** Regex matching an [arcade.downsampling] table header. */
const ARCADE_DOWNSAMPLING_HEADER_RE = /^\[arcade\.downsampling\]\s*$/;

/** Regex matching any TOML table header [xxx]. */
const ANY_TABLE_HEADER_RE = /^\[.+\]\s*$/;

/** Regex matching a theme = "..." assignment. */
const THEME_KEY_RE = /^theme\s*=/;

/** Regex matching a thresholdHours = ... assignment. */
const THRESHOLD_HOURS_KEY_RE = /^thresholdHours\s*=/;

/**
 * Serialize a Partial<ArcadeSettings> into TOML lines for the [arcade] section.
 * Returns separate line arrays for the main section and the downsampling sub-table.
 */
function serializeArcadeLines(settings: Partial<ArcadeSettings>): {
	mainLines: string[];
	downsamplingLines: string[];
} {
	const mainLines: string[] = [];
	const downsamplingLines: string[] = [];

	if (settings.theme !== undefined) {
		mainLines.push(`theme = "${settings.theme}"`);
	}

	if (settings.downsampling?.thresholdHours !== undefined) {
		downsamplingLines.push(
			`thresholdHours = ${settings.downsampling.thresholdHours}`,
		);
	}

	return { mainLines, downsamplingLines };
}

/**
 * Find the line range of a TOML table section.
 * Returns the header line index, and the index of the last content line
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
 * Check whether a key assignment already exists within a section's line range.
 */
function sectionHasKey(
	lines: string[],
	startIndex: number,
	endIndex: number,
	keyRe: RegExp,
): boolean {
	for (let i = startIndex; i <= endIndex; i++) {
		if (keyRe.test(lines[i])) return true;
	}
	return false;
}

/**
 * Find the insertion point within a section -- after the last non-empty
 * content line, before trailing blank lines or the next section header.
 */
function findInsertionPoint(
	lines: string[],
	headerIndex: number,
	endIndex: number,
): number {
	let insertAt = headerIndex + 1;
	for (let i = endIndex; i > headerIndex; i--) {
		if (lines[i].trim() !== "") {
			insertAt = i + 1;
			break;
		}
	}
	return insertAt;
}

/**
 * Write arcade settings into a TOML file, preserving existing content and comments.
 *
 * Behavior:
 * - If the file does not exist, creates it with the [arcade] section.
 * - If the file exists but has no [arcade] section, appends it at the end.
 * - If the file already has an [arcade] section, merges only missing keys
 *   (existing keys are never overwritten).
 *
 * @param filePath - Absolute path to the settings.toml file
 * @param settings - Partial arcade settings to write (only provided fields are written)
 */
export function writeArcadeSection(
	filePath: string,
	settings: Partial<ArcadeSettings>,
): void {
	const { mainLines, downsamplingLines } = serializeArcadeLines(settings);

	if (!existsSync(filePath)) {
		const parentDir = dirname(filePath);
		mkdirSync(parentDir, { recursive: true });

		const sections: string[] = ["[arcade]"];
		sections.push(...mainLines);

		if (downsamplingLines.length > 0) {
			sections.push("");
			sections.push("[arcade.downsampling]");
			sections.push(...downsamplingLines);
		}

		sections.push("");
		writeFileSync(filePath, sections.join("\n"), "utf-8");
		return;
	}

	const content = readFileSync(filePath, "utf-8");
	const lines = content.split("\n");

	const arcadeRange = findSectionRange(lines, ARCADE_HEADER_RE);

	if (arcadeRange === null) {
		// No [arcade] section exists -- append at end of file
		const appendLines: string[] = [];

		// Ensure blank line separator if file has content
		if (content.length > 0 && !content.endsWith("\n\n")) {
			if (!content.endsWith("\n")) {
				appendLines.push("");
			}
			appendLines.push("");
		}

		appendLines.push("[arcade]");
		appendLines.push(...mainLines);

		if (downsamplingLines.length > 0) {
			appendLines.push("");
			appendLines.push("[arcade.downsampling]");
			appendLines.push(...downsamplingLines);
		}

		appendLines.push("");
		writeFileSync(filePath, content + appendLines.join("\n"), "utf-8");
		return;
	}

	// [arcade] section exists -- merge missing keys
	const pendingMainInserts: string[] = [];
	for (const line of mainLines) {
		if (
			THEME_KEY_RE.test(line) &&
			sectionHasKey(
				lines,
				arcadeRange.headerIndex,
				arcadeRange.endIndex,
				THEME_KEY_RE,
			)
		) {
			continue;
		}
		pendingMainInserts.push(line);
	}

	// Insert missing main keys into the [arcade] section
	if (pendingMainInserts.length > 0) {
		const insertAt = findInsertionPoint(
			lines,
			arcadeRange.headerIndex,
			arcadeRange.endIndex,
		);
		lines.splice(insertAt, 0, ...pendingMainInserts);
	}

	// Handle [arcade.downsampling] sub-table
	if (downsamplingLines.length > 0) {
		const dsRange = findSectionRange(lines, ARCADE_DOWNSAMPLING_HEADER_RE);

		if (dsRange === null) {
			// No downsampling sub-table -- find end of all arcade-related sections and append
			const updatedArcadeRange = findSectionRange(lines, ARCADE_HEADER_RE);
			if (updatedArcadeRange) {
				// Find the true end of all arcade.* sections
				let arcadeEnd = updatedArcadeRange.endIndex;
				const existingDsCheck = findSectionRange(
					lines,
					ARCADE_DOWNSAMPLING_HEADER_RE,
				);
				if (existingDsCheck) {
					arcadeEnd = Math.max(arcadeEnd, existingDsCheck.endIndex);
				}

				const insertLines = ["", "[arcade.downsampling]", ...downsamplingLines];
				lines.splice(arcadeEnd + 1, 0, ...insertLines);
			}
		} else {
			// Downsampling section exists -- merge missing keys
			const pendingDsInserts: string[] = [];
			for (const line of downsamplingLines) {
				if (
					THRESHOLD_HOURS_KEY_RE.test(line) &&
					sectionHasKey(
						lines,
						dsRange.headerIndex,
						dsRange.endIndex,
						THRESHOLD_HOURS_KEY_RE,
					)
				) {
					continue;
				}
				pendingDsInserts.push(line);
			}

			if (pendingDsInserts.length > 0) {
				const insertAt = findInsertionPoint(
					lines,
					dsRange.headerIndex,
					dsRange.endIndex,
				);
				lines.splice(insertAt, 0, ...pendingDsInserts);
			}
		}
	}

	writeFileSync(filePath, lines.join("\n"), "utf-8");
}
