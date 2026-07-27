/**
 * Comment fence utilities for managing injected content in markdown files.
 * Uses HTML comment markers: <!-- rp1:start --> and <!-- rp1:end -->
 * Supports versioned markers: <!-- rp1:start:v0.7.1 --> and <!-- rp1:end:v0.7.1 -->
 */

export interface FencePosition {
	start: number;
	end: number;
	startMarkerEnd: number;
	endMarkerStart: number;
	version: string | null;
}

const START_PATTERN =
	/<!-- rp1:start(?::v(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?))? -->/;
const END_PATTERN = /<!-- rp1:end(?::v(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?))? -->/;

function makeStartMarker(version?: string): string {
	return version ? `<!-- rp1:start:v${version} -->` : "<!-- rp1:start -->";
}

function makeEndMarker(version?: string): string {
	return version ? `<!-- rp1:end:v${version} -->` : "<!-- rp1:end -->";
}

export function findFencedContent(content: string): FencePosition | null {
	const startMatch = START_PATTERN.exec(content);
	if (!startMatch) return null;

	const afterStart = startMatch.index + startMatch[0].length;
	const remaining = content.slice(afterStart);
	const endMatch = END_PATTERN.exec(remaining);
	if (!endMatch) return null;

	const endIdx = afterStart + endMatch.index;
	const version = startMatch[1] ?? null;

	return {
		start: startMatch.index,
		end: endIdx + endMatch[0].length,
		startMarkerEnd: afterStart,
		endMarkerStart: endIdx,
		version,
	};
}

export function extractFenceVersion(content: string): string | null {
	const position = findFencedContent(content);
	if (!position) return null;
	return position.version;
}

export function replaceFencedContent(
	content: string,
	newFencedContent: string,
	version?: string,
): string {
	const position = findFencedContent(content);

	if (!position) {
		return appendFencedContent(content, newFencedContent, version);
	}

	const before = content.slice(0, position.start);
	const after = content.slice(position.end);

	return before + wrapWithFence(newFencedContent, version) + after;
}

export function appendFencedContent(
	content: string,
	newFencedContent: string,
	version?: string,
): string {
	const trimmed = content.trimEnd();
	const separator = trimmed.length > 0 ? "\n\n" : "";
	return `${trimmed + separator + wrapWithFence(newFencedContent, version)}\n`;
}

export function wrapWithFence(content: string, version?: string): string {
	const trimmed = content.trim();
	return `${makeStartMarker(version)}\n${trimmed}\n${makeEndMarker(version)}`;
}

export function wrapWithVersionedFence(
	content: string,
	version: string,
): string {
	return wrapWithFence(content, version);
}

export function extractFencedContent(content: string): string | null {
	const position = findFencedContent(content);
	if (!position) return null;

	return content.slice(position.startMarkerEnd, position.endMarkerStart).trim();
}

export function hasFencedContent(content: string): boolean {
	return findFencedContent(content) !== null;
}

export function removeFencedContent(content: string): string {
	const position = findFencedContent(content);
	if (!position) return content;

	const before = content.slice(0, position.start).trimEnd();
	const after = content.slice(position.end).trimStart();

	// Keep a blank line between the surrounding blocks; concatenating directly
	// would glue the last line before the fence onto the first line after it.
	const separator = before.length > 0 && after.length > 0 ? "\n\n" : "";
	const result = (before + separator + after).trim();
	return result.length > 0 ? `${result}\n` : "";
}

export function validateFencing(content: string): {
	valid: boolean;
	error?: string;
} {
	const startPattern = new RegExp(START_PATTERN.source, "g");
	const endPattern = new RegExp(END_PATTERN.source, "g");

	const startCount = (content.match(startPattern) || []).length;
	const endCount = (content.match(endPattern) || []).length;

	if (startCount === 0 && endCount === 0) {
		return { valid: true };
	}

	if (startCount !== endCount) {
		return {
			valid: false,
			error: `Mismatched fence markers: found ${startCount} start marker(s) and ${endCount} end marker(s)`,
		};
	}

	if (startCount > 1) {
		return {
			valid: false,
			error: `Multiple fence sections found (${startCount}). Only one is supported.`,
		};
	}

	const startMatch = START_PATTERN.exec(content);
	const endMatch = END_PATTERN.exec(content);

	if (startMatch && endMatch && endMatch.index < startMatch.index) {
		return {
			valid: false,
			error: "End marker appears before start marker",
		};
	}

	return { valid: true };
}
