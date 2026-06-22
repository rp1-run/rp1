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

import { stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { type GateResult, gateResult } from "./types.js";

/** Default self-containment size budget: 1 MiB (HYP-003 measured well under this). */
export const DEFAULT_SIZE_LIMIT_BYTES = 1024 * 1024;

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
	const size = Buffer.byteLength(html, "utf8");

	const refPaths = extractRefPaths(html);
	const unresolved: string[] = [];
	for (const refPath of refPaths) {
		if (!(await refResolves(context.repoRoot, refPath))) {
			unresolved.push(refPath);
		}
	}

	const hasExternalUrl =
		EXTERNAL_URL.test(html) || PROTOCOL_RELATIVE_URL.test(html);
	const hasReferencesSection = html.includes('class="tm-references"');

	return gateResult([
		{
			name: "size-within-budget",
			passed: size <= limit,
			detail:
				size <= limit
					? undefined
					: `Artifact is ${kib(size)}, over the ${kib(limit)} budget.`,
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
			passed: !EXTERNAL_SCRIPT.test(html) && !hasScriptInSvg(html),
			detail:
				EXTERNAL_SCRIPT.test(html) || hasScriptInSvg(html)
					? "Found an external <script src> or a <script> inside an inlined <svg>; diagrams/code must be static (REQ-007)."
					: undefined,
		},
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
	]);
}
