/**
 * Static gate for a rendered `lesson.html` (T6).
 *
 * These checks read the produced artifact (and the repo on disk) without a
 * browser, so they are fast and run anywhere. They guard the self-containment
 * and provenance contract of the lesson artifact (REQ-008, REQ-010):
 *
 * - Size stays within the ~1 MiB target (HYP-003).
 * - No fetchable external network reference (`src`/`href` pointing at
 *   `http(s):` or a protocol-relative `//` host). A naive `http://` substring
 *   scan would false-positive on the W3C XML namespace URIs that every inlined
 *   Mermaid `<svg>` legitimately carries, so the discriminating pattern matches
 *   fetchable attributes only (see the T4 field notes).
 * - No runtime rendering library: no external `<script src=>` and no `<script>`
 *   inside any inlined `<svg>` (the diagram is static markup — REQ-007).
 * - Repo `references[].path` spot-check: every cited repo reference resolves to
 *   a real file under the repo root, so fabricated `file:line` citations fail.
 * - References-present-when-research-used: if the lesson drew on web research,
 *   the rendered artifact must surface a references section.
 *
 * The dynamic, browser-backed half of the gate lives in {@link ./browser-checks}.
 */

import { readFile, stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { type GateCheck, type GateResult, gateResult } from "./types.js";

/** Default self-containment size budget: 1 MiB (HYP-003 measured well under this). */
export const DEFAULT_SIZE_LIMIT_BYTES = 1024 * 1024;

/** Options for the standalone self-containment assertion ({@link assertSelfContained}). */
export interface SelfContainmentOptions {
	/** Max self-contained artifact size in bytes (defaults to {@link DEFAULT_SIZE_LIMIT_BYTES}). */
	readonly sizeLimitBytes?: number;
}

/** Repo-relative context the static gate resolves references against. */
export interface StaticGateContext {
	/** Repo root that repo `references[].path` values resolve against. */
	readonly repoRoot: string;
	/**
	 * Whether the lesson used web research. Derived by the command from the
	 * parsed lesson model (any `references[].kind === "web"`), so the
	 * "references present when research used" check stays meaningful rather than
	 * tautological against the rendered HTML.
	 */
	readonly researchUsed: boolean;
	/** Max self-contained artifact size in bytes (defaults to {@link DEFAULT_SIZE_LIMIT_BYTES}). */
	readonly sizeLimitBytes?: number;
}

/** Matches a fetchable external `src=`/`href=` pointing at an absolute http(s) URL. */
const EXTERNAL_URL = /\b(?:src|href)\s*=\s*["']https?:/i;
/** Matches a fetchable external `src=`/`href=` pointing at a protocol-relative `//host`. */
const PROTOCOL_RELATIVE_URL = /\b(?:src|href)\s*=\s*["']\/\//i;
/** Matches an external `<script src=…>` (a runtime library reference). */
const EXTERNAL_SCRIPT = /<script\b[^>]*\bsrc\s*=/i;
/** Captures the value of every `data-ref-path` attribute (repo reference paths). */
const REF_PATH = /data-ref-path="([^"]*)"/g;
/** Captures paired data-ref-path and data-ref-lines from the same element. */
const REF_WITH_LINES = /data-ref-path="([^"]*)"[^>]*?data-ref-lines="([^"]*)"/g;
/** CSS url() pointing at an external http(s) resource. */
const CSS_URL_EXTERNAL = /url\(\s*['"]?https?:/i;
/** JS fetch() call with an http(s) URL argument. */
const JS_FETCH = /\bfetch\s*\(\s*['"`]https?:/i;
/** JS XMLHttpRequest usage. */
const JS_XHR = /\bXMLHttpRequest\b/;
/** JS URL constructor with an http(s) URL argument. */
const JS_URL_CTOR = /\bnew\s+URL\s*\(\s*['"`]https?:/i;
/** A fetchable src/href pointing at a relative file (e.g., src="./companion.js"). */
const RELATIVE_FILE_REF = /\b(?:src|href)\s*=\s*["']\.\//i;

/** Format a byte count as a compact KiB string for readable failure details. */
const kib = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KiB`;

/** Extract every distinct `data-ref-path` value from the rendered HTML. */
function extractRefPaths(html: string): string[] {
	const paths = new Set<string>();
	for (const match of html.matchAll(REF_PATH)) {
		if (match[1].length > 0) {
			paths.add(match[1]);
		}
	}
	return [...paths];
}

/** True when the artifact contains a `<script>` inside any inlined `<svg>`. */
function hasScriptInSvg(html: string): boolean {
	for (const svg of html.matchAll(/<svg\b[\s\S]*?<\/svg>/gi)) {
		if (/<script\b/i.test(svg[0])) {
			return true;
		}
	}
	return false;
}

/** Extract the concatenated text content of all `<style>` blocks. */
function extractStyleContent(html: string): string {
	const blocks: string[] = [];
	for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
		blocks.push(m[1]);
	}
	return blocks.join("\n");
}

/**
 * Extract the concatenated text content of inline `<script>` blocks,
 * skipping `type="application/json"` data blocks and external `src=` scripts.
 */
function extractInlineScriptContent(html: string): string {
	const blocks: string[] = [];
	for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
		const attrs = m[1];
		if (/type\s*=\s*["']application\/json["']/i.test(attrs)) continue;
		if (/\bsrc\s*=/i.test(attrs)) continue;
		blocks.push(m[2]);
	}
	return blocks.join("\n");
}

/** True when any `<style>` block contains a CSS `url()` with an http(s) URL. */
function hasCssExternalUrl(html: string): boolean {
	return CSS_URL_EXTERNAL.test(extractStyleContent(html));
}

/**
 * True when any inline `<script>` block contains fetch(), XMLHttpRequest,
 * or URL constructor targeting an http(s) URL.
 */
function hasJsFetchExternal(html: string): boolean {
	const js = extractInlineScriptContent(html);
	if (JS_FETCH.test(js)) return true;
	if (JS_URL_CTOR.test(js)) return true;
	if (JS_XHR.test(js) && /https?:\/\//i.test(js)) return true;
	return false;
}

/** True when any src/href attribute points at a relative file (e.g., `./companion.js`). */
function hasRelativeFileRef(html: string): boolean {
	return RELATIVE_FILE_REF.test(html);
}

/** Extract paired `data-ref-path` + `data-ref-lines` from the same elements. */
function extractRefLineEntries(
	html: string,
): Array<{ path: string; lines: string }> {
	const entries: Array<{ path: string; lines: string }> = [];
	for (const m of html.matchAll(REF_WITH_LINES)) {
		if (m[1].length > 0 && m[2].length > 0) {
			entries.push({ path: m[1], lines: m[2] });
		}
	}
	return entries;
}

/** Parse a line-range string (e.g., "40-72") and return the maximum cited line number. */
function maxCitedLine(linesAttr: string): number | null {
	const parts = linesAttr.split("-").map((s) => parseInt(s.trim(), 10));
	const valid = parts.filter((n) => !Number.isNaN(n));
	return valid.length > 0 ? Math.max(...valid) : null;
}

/** Count the number of lines in a file. Returns null if the file cannot be read. */
async function countFileLines(filePath: string): Promise<number | null> {
	try {
		const content = await readFile(filePath, "utf-8");
		if (content.length === 0) return 0;
		return content.endsWith("\n")
			? content.split("\n").length - 1
			: content.split("\n").length;
	} catch {
		return null;
	}
}

/**
 * Validate that every `data-ref-lines` attribute cites line numbers within
 * the actual length of the referenced file.
 */
async function validateLineRanges(
	html: string,
	repoRoot: string,
): Promise<GateCheck> {
	const entries = extractRefLineEntries(html);
	if (entries.length === 0) {
		return { name: "line-range-valid", passed: true };
	}

	const violations: string[] = [];
	for (const entry of entries) {
		const resolved = resolveRefPath(repoRoot, entry.path);
		if (resolved === null) {
			violations.push(`${entry.path}: absolute or escaped path`);
			continue;
		}

		const max = maxCitedLine(entry.lines);
		if (max === null) continue;

		const actualLines = await countFileLines(resolved);
		if (actualLines === null) continue;

		if (max > actualLines) {
			violations.push(
				`${entry.path}:${entry.lines} cites line ${max}, but the file has only ${actualLines} lines`,
			);
		}
	}

	return {
		name: "line-range-valid",
		passed: violations.length === 0,
		detail:
			violations.length === 0
				? undefined
				: `Line-range violations: ${violations.join("; ")}.`,
	};
}

/** Resolve a repo-relative reference path under the repo root, rejecting escapes. */
function resolveRefPath(repoRoot: string, refPath: string): string | null {
	if (isAbsolute(refPath)) {
		return null;
	}
	const root = resolve(repoRoot);
	const resolved = resolve(root, refPath);
	// Reject `../` traversal that escapes the repo root.
	if (resolved !== root && !resolved.startsWith(`${root}/`)) {
		return null;
	}
	return resolved;
}

/** True when `refPath` resolves to an existing file under the repo root. */
async function refResolves(
	repoRoot: string,
	refPath: string,
): Promise<boolean> {
	const resolved = resolveRefPath(repoRoot, refPath);
	if (resolved === null) {
		return false;
	}
	try {
		const info = await stat(resolved);
		return info.isFile();
	} catch {
		return false;
	}
}

/**
 * The synchronous self-containment checks: size budget, no fetchable external
 * network reference, and no runtime rendering library.
 *
 * These are the subset of the static gate that depends only on the artifact
 * bytes (no repo on disk and no parsed lesson), so both {@link runStaticGate}
 * (the full validate gate) and {@link assertSelfContained} (export's re-assertion)
 * compose them from this single source of truth — keeping the subtle, fetchable-
 * only URL discrimination (which must not false-positive on the W3C XML namespace
 * URIs in inlined `<svg>`s) defined once.
 */
function selfContainmentChecks(
	html: string,
	sizeLimitBytes: number,
): GateCheck[] {
	const size = Buffer.byteLength(html, "utf8");
	const hasExternalUrl =
		EXTERNAL_URL.test(html) || PROTOCOL_RELATIVE_URL.test(html);
	const hasRuntimeLibrary = EXTERNAL_SCRIPT.test(html) || hasScriptInSvg(html);
	const cssExternal = hasCssExternalUrl(html);
	const jsExternal = hasJsFetchExternal(html);
	const relativeRef = hasRelativeFileRef(html);

	return [
		{
			name: "size-within-budget",
			passed: size <= sizeLimitBytes,
			detail:
				size <= sizeLimitBytes
					? undefined
					: `Artifact is ${kib(size)}, over the ${kib(sizeLimitBytes)} budget.`,
		},
		{
			name: "no-external-network-references",
			passed: !hasExternalUrl,
			detail: hasExternalUrl
				? "Found a fetchable external src/href (http(s): or protocol-relative); the artifact must be self-contained."
				: undefined,
		},
		{
			name: "no-runtime-rendering-library",
			passed: !hasRuntimeLibrary,
			detail: hasRuntimeLibrary
				? "Found an external <script src> or a <script> inside an inlined <svg>; diagrams/code must be static (REQ-007)."
				: undefined,
		},
		{
			name: "css-url-external",
			passed: !cssExternal,
			detail: cssExternal
				? "Found a CSS url() referencing an external http(s) resource in an inline <style> block; all assets must be inlined."
				: undefined,
		},
		{
			name: "js-fetch-external",
			passed: !jsExternal,
			detail: jsExternal
				? "Found a fetch(), XMLHttpRequest, or URL constructor targeting an external http(s) URL in an inline <script> block."
				: undefined,
		},
		{
			name: "relative-file-ref",
			passed: !relativeRef,
			detail: relativeRef
				? 'Found a src/href pointing at a relative file (e.g., "./companion.js"); the artifact must be a single self-contained file.'
				: undefined,
		},
	];
}

/**
 * Assert that a rendered `lesson.html` string is self-contained (T7 `export`).
 *
 * Runs only the artifact-bytes checks (size budget, no fetchable external
 * network reference, no runtime rendering library) — the self-containment
 * subset of {@link runStaticGate}, without its repo-`file:line` provenance and
 * research-references checks, which depend on the repo on disk and the parsed
 * lesson that `export` does not have. Synchronous and never throws.
 */
export function assertSelfContained(
	html: string,
	options: SelfContainmentOptions = {},
): GateResult {
	const limit = options.sizeLimitBytes ?? DEFAULT_SIZE_LIMIT_BYTES;
	return gateResult(selfContainmentChecks(html, limit));
}

/**
 * Run the static gate against a rendered `lesson.html` string.
 *
 * Returns a {@link GateResult} naming each check; never throws (filesystem
 * errors during the `file:line` spot-check resolve to a failed check, not a
 * rejection). The command merges this with the browser gate and exits non-zero
 * when any check failed.
 */
export async function runStaticGate(
	html: string,
	context: StaticGateContext,
): Promise<GateResult> {
	const limit = context.sizeLimitBytes ?? DEFAULT_SIZE_LIMIT_BYTES;

	const refPaths = extractRefPaths(html);
	const unresolved: string[] = [];
	for (const refPath of refPaths) {
		if (!(await refResolves(context.repoRoot, refPath))) {
			unresolved.push(refPath);
		}
	}

	const hasReferencesSection = html.includes('class="tm-references"');
	const lineRangeCheck = await validateLineRanges(html, context.repoRoot);

	return gateResult([
		...selfContainmentChecks(html, limit),
		{
			name: "repo-references-resolve",
			passed: unresolved.length === 0,
			detail:
				unresolved.length === 0
					? undefined
					: `Cited repo reference(s) do not resolve under ${context.repoRoot}: ${unresolved.join(", ")}.`,
		},
		{
			name: "references-present-when-research-used",
			passed: !context.researchUsed || hasReferencesSection,
			detail:
				context.researchUsed && !hasReferencesSection
					? "Lesson used web research but the rendered artifact has no references section."
					: undefined,
		},
		lineRangeCheck,
	]);
}
