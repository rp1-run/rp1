/**
 * Comment fence utilities for managing injected content in markdown files.
 * Uses HTML comment markers: <!-- rp1:start --> and <!-- rp1:end -->
 */

export interface FencePosition {
  start: number;
  end: number;
  startMarkerEnd: number;
  endMarkerStart: number;
}

const START_MARKER = "<!-- rp1:start -->";
const END_MARKER = "<!-- rp1:end -->";

export function findFencedContent(content: string): FencePosition | null {
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

export function replaceFencedContent(
  content: string,
  newFencedContent: string,
): string {
  const position = findFencedContent(content);

  if (!position) {
    return appendFencedContent(content, newFencedContent);
  }

  const before = content.slice(0, position.start);
  const after = content.slice(position.end);

  return before + wrapWithFence(newFencedContent) + after;
}

export function appendFencedContent(
  content: string,
  newFencedContent: string,
): string {
  const trimmed = content.trimEnd();
  const separator = trimmed.length > 0 ? "\n\n" : "";
  return trimmed + separator + wrapWithFence(newFencedContent) + "\n";
}

export function wrapWithFence(content: string): string {
  const trimmed = content.trim();
  return `${START_MARKER}\n${trimmed}\n${END_MARKER}`;
}

export function extractFencedContent(content: string): string | null {
  const position = findFencedContent(content);
  if (!position) return null;

  return content.slice(position.startMarkerEnd, position.endMarkerStart).trim();
}

export function hasFencedContent(content: string): boolean {
  return findFencedContent(content) !== null;
}

export function validateFencing(content: string): {
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
