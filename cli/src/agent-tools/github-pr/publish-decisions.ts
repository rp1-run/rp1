/**
 * Pure decision logic for the publish-artifact comment upsert.
 *
 * These functions map a set of existing comments to an upsert action
 * (POST / PATCH / refuse), detect orphaned prior comments, and warn on stale
 * local artifacts. They never touch GitHub; the orchestration
 * (`publish-comment.ts`) feeds them data fetched via Octokit and acts on their
 * decisions.
 *
 * `mtimeWarning` interprets GitHub's `updated_at` as UTC (REQ-007): the trailing
 * `Z` is honored, so the staleness comparison does not skew by the local offset.
 */

/** Comment marker template; the rendered marker opens a published comment body. */
const MARKER_FMT = (key: string): string => `<!-- rp1-artifact: ${key} -->`;

/** Footer substring identifying a comment posted by this skill. */
const FOOTER_SOFT_MATCH = "Posted by `publish-artifact`";

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
