/**
 * Pure decision logic for the publish-artifact comment upsert.
 *
 * Network-free TypeScript port of the decision functions in the publish-artifact
 * skill's `publish.py`. These functions map a set of existing comments to an
 * upsert action (POST / PATCH / refuse), detect orphaned prior comments, warn on
 * stale local artifacts, and render the dry-run diagnostic and success blocks.
 * They never touch GitHub; the orchestration (`publish-comment.ts`) feeds them
 * data fetched via Octokit and acts on their decisions.
 *
 * One intentional, documented deviation from the Python implementation:
 *  - `mtimeWarning` interprets GitHub's `updated_at` as UTC (REQ-007). Python
 *    stripped the trailing `Z` and parsed the timestamp as naive-local, which
 *    skewed the staleness comparison by the local UTC offset.
 */

import { MAX_BYTES } from "./artifact-projection.js";
import type { TargetKind } from "./parse-target.js";

/** Comment marker template; the rendered marker opens a published comment body. */
const MARKER_FMT = (key: string): string => `<!-- rp1-artifact: ${key} -->`;

/** Footer substring identifying a comment posted by this skill. */
const FOOTER_SOFT_MATCH = "Posted by `publish-artifact`";

/** Python `str.strip()`: strip leading and trailing ASCII whitespace. */
const strip = (s: string): string =>
	s.replace(/^[ \t\n\r\f\v]+/, "").replace(/[ \t\n\r\f\v]+$/, "");

/**
 * The fields of an existing PR/issue comment the decision logic depends on.
 * The orchestration assembles these from the GitHub REST comment payload.
 */
export interface ArtifactComment {
	readonly id: number;
	readonly body: string;
	readonly userLogin: string;
	readonly htmlUrl: string;
	readonly updatedAt: string;
}

/** POST: no existing comment matches; a new comment will be created. */
export interface PostDecision {
	readonly action: "POST";
	readonly targetCommentId: null;
}

/** PATCH: exactly one matching comment will be updated in place. */
export interface PatchDecision {
	readonly action: "PATCH";
	readonly targetCommentId: number;
}

/**
 * A deliberate, non-destructive stop (foreign single comment without force, or
 * two-or-more duplicates). `reason` is the user-facing explanation.
 */
export interface Refusal {
	readonly action: "REFUSE";
	readonly reason: string;
}

/** The outcome of {@link decideAction}: an upsert action or a refusal. */
export type Decision = PostDecision | PatchDecision | Refusal;

/**
 * Comments whose body opens with this artifact's marker (always line 1).
 */
export const findMarkerMatches = (
	allComments: readonly ArtifactComment[],
	docKey: string,
): ArtifactComment[] => {
	const marker = MARKER_FMT(docKey);
	return allComments.filter((c) => c.body.startsWith(marker));
};

/**
 * Warn if we previously posted here but the marker for this key is gone.
 *
 * Returns a warning string or null. Only meaningful when there are 0 marker
 * matches (broken idempotency: a fresh comment will orphan the old one).
 */
export const softDetectOrphan = (
	allComments: readonly ArtifactComment[],
	me: string,
	docKey: string,
): string | null => {
	const soft = allComments.filter(
		(c) => c.body.includes(FOOTER_SOFT_MATCH) && c.userLogin === me,
	);
	if (soft.length === 0) {
		return null;
	}
	return (
		`WARNING: found ${soft.length} prior publish-artifact comment(s) but no ` +
		`marker for doc_key ${docKey}. Idempotency is broken — a new comment will ` +
		`be posted, orphaning the old one(s).`
	);
};

/**
 * Map marker matches to an upsert action per edge-cases.md.
 *
 *   0 matches        -> POST
 *   1 match, mine     -> PATCH
 *   1 match, foreign  -> PATCH only with force, else refuse
 *   >= 2 matches      -> refuse (manual dedup; force does NOT override)
 */
export const decideAction = (
	matches: readonly ArtifactComment[],
	me: string,
	force: boolean,
): Decision => {
	if (matches.length === 0) {
		return { action: "POST", targetCommentId: null };
	}
	if (matches.length === 1) {
		const only = matches[0];
		if (only.userLogin === me) {
			return { action: "PATCH", targetCommentId: only.id };
		}
		if (!force) {
			return {
				action: "REFUSE",
				reason:
					`Comment is owned by @${only.userLogin} (${only.htmlUrl}). ` +
					"Pass --force to overwrite, or coordinate with them.",
			};
		}
		return { action: "PATCH", targetCommentId: only.id };
	}
	const urls = matches.map((c) => c.htmlUrl).join("\n  ");
	return {
		action: "REFUSE",
		reason:
			`Found ${matches.length} comments matching this artifact:\n  ${urls}\n` +
			"Delete duplicates manually, then re-run.",
	};
};

/**
 * Warn (but allow) when the local artifact predates the existing comment.
 *
 * `localMtime` and the returned comparison are in Unix seconds. GitHub's
 * `updatedAt` is an ISO-8601 UTC timestamp (trailing `Z`); it is parsed as UTC
 * here (REQ-007), unlike the Python original which treated it as naive-local.
 */
export const mtimeWarning = (
	localMtime: number,
	commentUpdatedAt: string,
	force: boolean,
): string | null => {
	if (force) {
		return null;
	}
	const commentTs = Date.parse(commentUpdatedAt) / 1000;
	if (localMtime < commentTs) {
		return (
			"WARNING: local artifact is older than the existing comment. " +
			"Continuing — pass --force to suppress this warning."
		);
	}
	return null;
};

/** The dry-run diagnostic's `Target:` line (a PR carries base/head). */
export const targetLine = (
	kind: TargetKind,
	number: number,
	state: string,
	baseRef: string,
	headRef: string,
): string =>
	kind === "pr"
		? `#${number} (${state}, base: ${baseRef}, head: ${headRef})`
		: `#${number} (${state}, issue)`;

/** Inputs for the dry-run diagnostic header. */
export interface DiagnosticInput {
	readonly relativePath: string;
	readonly docKey: string;
	readonly kind: TargetKind;
	readonly number: number;
	readonly state: string;
	readonly baseRef: string;
	readonly headRef: string;
	readonly sizeBytes: number;
	readonly action: string;
	readonly matchedUrl: string;
}

/**
 * The stderr diagnostic header for `--dry-run` (the projected body follows it
 * on stdout).
 */
export const buildDiagnostic = (d: DiagnosticInput): string =>
	"=== publish-artifact (dry run) ===\n" +
	`Artifact: ${d.relativePath}\n` +
	`Doc key:  ${d.docKey}\n` +
	`Target:   ${targetLine(d.kind, d.number, d.state, d.baseRef, d.headRef)}\n` +
	`Size:     ${d.sizeBytes} / ${MAX_BYTES} bytes\n` +
	`Action:   would ${d.action} (matched comment: ${d.matchedUrl})\n` +
	"\n--- projected comment body ---\n";

/** Inputs for the final user-facing success block. */
export interface SuccessInput {
	readonly action: "POST" | "PATCH";
	readonly kind: TargetKind;
	readonly number: number;
	readonly fm: Record<string, string>;
	readonly docKey: string;
	readonly htmlUrl: string;
	readonly sizeBytes: number;
}

/** The final user-facing confirmation block for a real POST/PATCH. */
export const formatSuccess = (s: SuccessInput): string => {
	const verb = s.action === "POST" ? "Posted" : "Updated";
	const where = s.kind === "pr" ? "PR" : "issue";
	const atype =
		strip(s.fm.artifact ?? "") || strip(s.fm.type ?? "") || "(untyped)";
	const issue = strip(s.fm.issue_id ?? "") || "—";
	const kb = `${(s.sizeBytes / 1024).toFixed(1)} KB`;
	return (
		`✓ ${verb} rp1 artifact on ${where} #${s.number}\n` +
		`  Artifact: ${atype} / ${issue} (doc_key ${s.docKey})\n` +
		`  Comment:  ${s.htmlUrl}\n` +
		`  Size:     ${kb} / 65 KB cap`
	);
};
