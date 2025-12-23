/**
 * Shell comment fence utilities for managing injected content in shell-style files.
 * Uses hash comment markers: # rp1:start and # rp1:end
 * Designed for .gitignore and other shell-style configuration files.
 */

export interface ShellFencePosition {
	start: number;
	end: number;
	startMarkerEnd: number;
	endMarkerStart: number;
}

const START_MARKER = "# rp1:start";
const END_MARKER = "# rp1:end";

export function findShellFencedContent(
	content: string,
): ShellFencePosition | null {
	const startIdx = content.indexOf(START_MARKER);
	if (startIdx === -1) return null;

	const endIdx = content.indexOf(END_MARKER, startIdx);
	if (endIdx === -1) return null;

	return {
		start: startIdx,
		end: endIdx + END_MARKER.length,
		startMarkerEnd: startIdx + START_MARKER.length,
		endMarkerStart: endIdx,
	};
}

export function replaceShellFencedContent(
	content: string,
	newContent: string,
): string {
	const position = findShellFencedContent(content);

	if (!position) {
		return appendShellFencedContent(content, newContent);
	}

	const before = content.slice(0, position.start);
	const after = content.slice(position.end);

	return before + wrapWithShellFence(newContent) + after;
}

export function appendShellFencedContent(
	content: string,
	newContent: string,
): string {
	const trimmed = content.trimEnd();
	const separator = trimmed.length > 0 ? "\n\n" : "";
	return `${trimmed + separator + wrapWithShellFence(newContent)}\n`;
}

export function wrapWithShellFence(content: string): string {
	const trimmed = content.trim();
	return `${START_MARKER}\n${trimmed}\n${END_MARKER}`;
}

export function extractShellFencedContent(content: string): string | null {
	const position = findShellFencedContent(content);
	if (!position) return null;

	return content.slice(position.startMarkerEnd, position.endMarkerStart).trim();
}

export function hasShellFencedContent(content: string): boolean {
	return findShellFencedContent(content) !== null;
}

export function validateShellFencing(content: string): {
	valid: boolean;
	error?: string;
} {
	const startCount = (content.match(new RegExp(START_MARKER, "g")) || [])
		.length;
	const endCount = (content.match(new RegExp(END_MARKER, "g")) || []).length;

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

	const startIdx = content.indexOf(START_MARKER);
	const endIdx = content.indexOf(END_MARKER);

	if (endIdx < startIdx) {
		return {
			valid: false,
			error: "End marker appears before start marker",
		};
	}

	return { valid: true };
}
