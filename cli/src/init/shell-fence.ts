/**
 * Shell comment fence utilities for managing injected content in shell-style files.
 * Uses hash comment markers: # rp1:start and # rp1:end
 * Supports versioned markers: # rp1:start:v0.7.1 and # rp1:end:v0.7.1
 * Designed for .gitignore and other shell-style configuration files.
 */

export interface ShellFencePosition {
	start: number;
	end: number;
	startMarkerEnd: number;
	endMarkerStart: number;
	version: string | null;
}

const START_PATTERN = /# rp1:start(?::v(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?))?/;
const END_PATTERN = /# rp1:end(?::v(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?))?/;

function makeStartMarker(version?: string): string {
	return version ? `# rp1:start:v${version}` : "# rp1:start";
}

function makeEndMarker(version?: string): string {
	return version ? `# rp1:end:v${version}` : "# rp1:end";
}

export function findShellFencedContent(
	content: string,
): ShellFencePosition | null {
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

export function extractShellFenceVersion(content: string): string | null {
	const position = findShellFencedContent(content);
	if (!position) return null;
	return position.version;
}

export function replaceShellFencedContent(
	content: string,
	newContent: string,
	version?: string,
): string {
	const position = findShellFencedContent(content);

	if (!position) {
		return appendShellFencedContent(content, newContent, version);
	}

	const before = content.slice(0, position.start);
	const after = content.slice(position.end);

	return before + wrapWithShellFence(newContent, version) + after;
}

export function appendShellFencedContent(
	content: string,
	newContent: string,
	version?: string,
): string {
	const trimmed = content.trimEnd();
	const separator = trimmed.length > 0 ? "\n\n" : "";
	return `${trimmed + separator + wrapWithShellFence(newContent, version)}\n`;
}

export function wrapWithShellFence(content: string, version?: string): string {
	const trimmed = content.trim();
	return `${makeStartMarker(version)}\n${trimmed}\n${makeEndMarker(version)}`;
}

export function wrapWithVersionedShellFence(
	content: string,
	version: string,
): string {
	return wrapWithShellFence(content, version);
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
