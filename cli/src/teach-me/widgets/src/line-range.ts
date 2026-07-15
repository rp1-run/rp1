/**
 * Pure line-range parsing for the code-walkthrough widget.
 *
 * Kept DOM-free (no custom-element references) so it is independently testable
 * and reusable: it is the only non-DOM logic in the widget set and the most
 * regression-prone (1-based indexing, reversed ranges, clamping).
 */

/**
 * Parse a 1-based line-range spec (`"3"`, `"3-7"`, `"3,5,9-11"`) into the set of
 * line numbers it covers, clamped to `[1, max]`. Reversed ranges (`"7-3"`) are
 * normalized; malformed fragments are ignored so a bad spec degrades to
 * highlighting nothing rather than throwing.
 */
export function parseLineRange(spec: string, max: number): Set<number> {
	const lines = new Set<number>();
	for (const part of spec.split(",")) {
		const range = part.trim().match(/^(\d+)(?:-(\d+))?$/);
		if (!range) {
			continue;
		}
		const start = Number(range[1]);
		const end = range[2] ? Number(range[2]) : start;
		for (let n = Math.min(start, end); n <= Math.max(start, end); n++) {
			if (n >= 1 && n <= max) {
				lines.add(n);
			}
		}
	}
	return lines;
}
