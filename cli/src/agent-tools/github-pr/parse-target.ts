/**
 * Pure parsing of a PR/issue target into structured fields.
 *
 * A bare number yields `kind: "unknown"` — the caller probes whether it is a PR
 * or an issue. A GitHub URL yields `kind` from its `/pull/` or `/issues/` path.
 */

/** Whether a parsed target is known to be a PR, an issue, or undetermined. */
export type TargetKind = "pr" | "issue" | "unknown";

/** A target resolved into the repo coordinates needed to address it. */
export interface ParsedTarget {
	readonly owner: string;
	readonly repo: string;
	readonly number: number;
	readonly kind: TargetKind;
}

/**
 * A GitHub PR/issue URL: owner, repo, the `pull`/`issues` segment, and number.
 * Trailing path segments (e.g. `/files`) are ignored.
 */
const URL_RE =
	/^https?:\/\/github\.com\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/(?<kind>pull|issues)\/(?<number>\d+)(?=$|[/?#])/;

/** A target consisting solely of digits. */
const BARE_NUMBER_RE = /^\d+$/;

/**
 * Parse a target into `{owner, repo, number, kind}`.
 *
 * `currentRepo` is `"owner/repo"`, used only for bare-number targets. Throws
 * when the input is neither a recognizable GitHub URL nor a bare number, or
 * when a bare number is given without a valid `currentRepo`.
 *
 * @param target - A bare PR/issue number or a GitHub PR/issue URL.
 * @param currentRepo - `"owner/repo"` context for bare-number targets.
 */
export const parse = (target: string, currentRepo: string): ParsedTarget => {
	const trimmed = target.trim();
	const m = URL_RE.exec(trimmed);
	if (m?.groups) {
		return {
			owner: m.groups.owner,
			repo: m.groups.repo,
			number: Number.parseInt(m.groups.number, 10),
			kind: m.groups.kind === "pull" ? "pr" : "issue",
		};
	}
	if (BARE_NUMBER_RE.test(trimmed)) {
		if (!currentRepo.includes("/")) {
			throw new Error("bare number requires a current repo (owner/repo)");
		}
		const slash = currentRepo.indexOf("/");
		return {
			owner: currentRepo.slice(0, slash),
			repo: currentRepo.slice(slash + 1),
			number: Number.parseInt(trimmed, 10),
			kind: "unknown",
		};
	}
	throw new Error(
		`Target must be a PR/issue number or a GitHub URL: ${JSON.stringify(target)}`,
	);
};
