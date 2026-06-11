/**
 * Idempotent publish-comment upsert operation.
 *
 * Orchestration port of the publish-artifact skill's `publish.py` `main` plus its
 * `gh`-touching helpers. It resolves the PR/issue target, projects the artifact
 * into a deterministic comment body, scans existing comments for this artifact's
 * marker, and POSTs a new comment or PATCHes the existing one in place (or, on a
 * dry run, returns the projected body without writing). GitHub is reached only
 * via Octokit; repo identity and the current branch come from `git.ts`. The `gh`
 * subprocess is never spawned (REQ-001).
 *
 * The pure projection (`artifact-projection.ts`), target parsing
 * (`parse-target.ts`), and decision logic (`publish-decisions.ts`) live in their
 * own modules; this file threads the network-touching state between them and
 * assembles the JSON output contract.
 */

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Octokit } from "@octokit/rest";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { runtimeError, usageError } from "../../../shared/errors.js";
import { execGitCommand, getCurrentBranch } from "../git.js";
import type { ToolResult } from "../models.js";
import { successResult } from "../output.js";
import {
	checkSize,
	markerKey,
	project,
	splitFrontmatter,
} from "./artifact-projection.js";
import { createOctokitClient, withGitHubErrorHandling } from "./client.js";
import type { PublishCommentInput, PublishCommentOutput } from "./models.js";
import { parse, type TargetKind } from "./parse-target.js";
import {
	type ArtifactComment,
	decideAction,
	findMarkerMatches,
	mtimeWarning,
	softDetectOrphan,
} from "./publish-decisions.js";
import { parseJsonInput, validatePublishCommentInput } from "./validation.js";

const TOOL_NAME = "github-pr";

/** A resolved comment endpoint: owner/repo plus the issue/PR number and kind. */
interface ResolvedTarget {
	readonly owner: string;
	readonly repo: string;
	readonly number: number;
	readonly kind: TargetKind;
	readonly state: string;
}

/** Local artifact contents plus the repo-relative path used in projection. */
interface LoadedArtifact {
	readonly text: string;
	readonly relativePath: string;
	readonly mtime: number;
}

/**
 * Parse `owner/repo` out of an `origin` remote URL.
 *
 * Handles the SSH (`git@github.com:owner/repo.git`) and HTTPS
 * (`https://github.com/owner/repo.git`) forms and tolerates a missing `.git`
 * suffix. Replaces Python's `gh repo view --json nameWithOwner` (HYP-002).
 */
const parseRemoteRepo = (remoteUrl: string): string | null => {
	const url = remoteUrl.trim();
	const ssh = /^git@[^:]+:(?<owner>[^/]+)\/(?<repo>.+?)(?:\.git)?$/.exec(url);
	if (ssh?.groups) {
		return `${ssh.groups.owner}/${ssh.groups.repo}`;
	}
	const https =
		/^https?:\/\/[^/]+\/(?<owner>[^/]+)\/(?<repo>.+?)(?:\.git)?$/.exec(url);
	if (https?.groups) {
		return `${https.groups.owner}/${https.groups.repo}`;
	}
	return null;
};

/** Derive `owner/repo` for the current repository from `origin`. */
const resolveRepoFull = (cwd: string): TE.TaskEither<CLIError, string> =>
	pipe(
		execGitCommand(["remote", "get-url", "origin"], cwd),
		TE.chain((remoteUrl) => {
			const repoFull = parseRemoteRepo(remoteUrl);
			return repoFull
				? TE.right(repoFull)
				: TE.left(
						runtimeError(
							`Could not parse owner/repo from origin remote: ${remoteUrl}`,
						),
					);
		}),
	);

/**
 * Repo-relative path for the Source-path row and the `path:` marker key.
 *
 * Mirrors `relative_source_path`: resolve the repo root from the artifact's
 * directory and strip it; fall back to the input path when outside a repo.
 */
const relativeSourcePath = (
	artifactPath: string,
): TE.TaskEither<CLIError, string> => {
	const absolute = path.resolve(artifactPath);
	return pipe(
		execGitCommand(["rev-parse", "--show-toplevel"], path.dirname(absolute)),
		TE.map((root) =>
			root && absolute.startsWith(root + path.sep)
				? absolute.slice(root.length + 1)
				: artifactPath,
		),
		TE.orElse(() => TE.right(artifactPath)),
	);
};

/**
 * Resolve the target PR/issue and its open/closed state, applying the
 * closed/merged force gate.
 *
 * - No target: the current branch's open PR (`pulls.list({head})`).
 * - Bare number (`kind: "unknown"`): probe `issues.get().pull_request`.
 * - URL: kind is already known.
 *
 * `state` is uppercased to match the Python `gh` state strings used downstream.
 */
const resolveTarget = (
	client: Octokit,
	target: string | undefined,
	repoFull: string,
	cwd: string,
	force: boolean,
): TE.TaskEither<CLIError, ResolvedTarget> =>
	withGitHubErrorHandling(
		"publish-comment: resolve target",
		async (gh): Promise<ResolvedTarget> => {
			const [repoOwner, repoName] = splitRepoFull(repoFull);
			let owner = repoOwner;
			let repo = repoName;
			let number: number;
			let kind: TargetKind;

			if (!target || target.trim() === "") {
				const branch = await getCurrentBranch(cwd)();
				if (branch._tag === "Left" || !branch.right) {
					throw new Error(
						"No current branch. Pass an explicit PR/issue number or URL.",
					);
				}
				const prs = await gh.pulls.list({
					owner,
					repo,
					head: `${owner}:${branch.right}`,
					state: "open",
				});
				if (prs.data.length === 0) {
					throw new Error(
						"No open PR for current branch. Push and open a PR, or pass " +
							"an explicit PR/issue number or URL.",
					);
				}
				number = prs.data[0].number;
				kind = "pr";
			} else {
				const parsed = parse(target, repoFull);
				owner = parsed.owner;
				repo = parsed.repo;
				number = parsed.number;
				kind = parsed.kind;
			}

			if (kind === "unknown") {
				const issue = await gh.issues.get({
					owner,
					repo,
					issue_number: number,
				});
				kind = issue.data.pull_request ? "pr" : "issue";
			}

			let state: string;
			if (kind === "pr") {
				const pr = await gh.pulls.get({
					owner,
					repo,
					pull_number: number,
				});
				state = pr.data.merged ? "MERGED" : pr.data.state.toUpperCase();
				if ((state === "CLOSED" || state === "MERGED") && !force) {
					throw new Error(
						`PR #${number} is ${state}. Pass force to comment anyway.`,
					);
				}
			} else {
				const issue = await gh.issues.get({
					owner,
					repo,
					issue_number: number,
				});
				state = issue.data.state.toUpperCase();
				if (state === "CLOSED" && !force) {
					throw new Error(
						`Issue #${number} is CLOSED. Pass force to comment anyway.`,
					);
				}
			}

			return { owner, repo, number, kind, state };
		},
	)(client);

/** Split `owner/repo` on its first slash (mirrors Python `split("/", 1)`). */
const splitRepoFull = (repoFull: string): [string, string] => {
	const slash = repoFull.indexOf("/");
	return slash === -1
		? [repoFull, ""]
		: [repoFull.slice(0, slash), repoFull.slice(slash + 1)];
};

/**
 * Exhaustively page `issues.listComments` and map each comment into the fields
 * the decision logic depends on. Pagination must be complete: a missed page
 * could re-POST and orphan an existing comment.
 */
const fetchArtifactComments = (
	client: Octokit,
	owner: string,
	repo: string,
	number: number,
): TE.TaskEither<CLIError, ArtifactComment[]> =>
	withGitHubErrorHandling(
		"publish-comment: list comments",
		async (gh): Promise<ArtifactComment[]> => {
			const comments = await gh.paginate(gh.issues.listComments, {
				owner,
				repo,
				issue_number: number,
				per_page: 100,
			});
			return comments.map((c) => ({
				id: c.id,
				body: c.body ?? "",
				userLogin: c.user?.login ?? "",
				htmlUrl: c.html_url,
				updatedAt: c.updated_at,
			}));
		},
	)(client);

/** The authenticated user's login (replaces `gh api user --jq .login`). */
const authenticatedLogin = (client: Octokit): TE.TaskEither<CLIError, string> =>
	withGitHubErrorHandling(
		"publish-comment: authenticated user",
		async (gh): Promise<string> => {
			const me = await gh.users.getAuthenticated();
			return me.data.login;
		},
	)(client);

/** Create a new top-level comment; returns its html_url. */
const createComment = (
	client: Octokit,
	owner: string,
	repo: string,
	number: number,
	body: string,
): TE.TaskEither<CLIError, string> =>
	withGitHubErrorHandling(
		"publish-comment: create comment",
		async (gh): Promise<string> => {
			const res = await gh.issues.createComment({
				owner,
				repo,
				issue_number: number,
				body,
			});
			return res.data.html_url;
		},
	)(client);

/** Update an existing comment in place; returns its html_url. */
const updateComment = (
	client: Octokit,
	owner: string,
	repo: string,
	commentId: number,
	body: string,
): TE.TaskEither<CLIError, string> =>
	withGitHubErrorHandling(
		"publish-comment: update comment",
		async (gh): Promise<string> => {
			const res = await gh.issues.updateComment({
				owner,
				repo,
				comment_id: commentId,
				body,
			});
			return res.data.html_url;
		},
	)(client);

/** Read the artifact, derive its repo-relative path, and capture its mtime. */
const loadArtifact = (
	artifactPath: string,
): TE.TaskEither<CLIError, LoadedArtifact> =>
	pipe(
		TE.Do,
		TE.bind("stats", () =>
			TE.tryCatch(
				() => stat(artifactPath),
				() => usageError(`Artifact not found: ${path.resolve(artifactPath)}`),
			),
		),
		TE.bind("text", () =>
			TE.tryCatch(
				() => readFile(artifactPath, "utf-8"),
				(error) =>
					runtimeError(
						`Could not read artifact ${artifactPath}: ${
							error instanceof Error ? error.message : String(error)
						}`,
					),
			),
		),
		TE.bind("relativePath", () => relativeSourcePath(artifactPath)),
		TE.map(({ stats, text, relativePath }) => ({
			text,
			relativePath,
			mtime: stats.mtimeMs / 1000,
		})),
	);

/**
 * Execute the publish-comment upsert.
 *
 * @param input - Raw JSON input string matching {@link PublishCommentInput}.
 * @returns TaskEither with a ToolResult wrapping {@link PublishCommentOutput}.
 */
export const executePublishComment = (
	input: string,
): TE.TaskEither<CLIError, ToolResult<PublishCommentOutput>> => {
	const cwd = process.cwd();
	return pipe(
		parseJsonInput<unknown>(input),
		TE.fromEither,
		TE.chain((data) => TE.fromEither(validatePublishCommentInput(data))),
		TE.chain((validInput) =>
			pipe(
				TE.Do,
				TE.bind("artifact", () => loadArtifact(validInput.artifact_path)),
				TE.bind("client", () => createOctokitClient()),
				TE.bind("repoFull", () => resolveRepoFull(cwd)),
				TE.bind("target", ({ client, repoFull }) =>
					resolveTarget(
						client,
						validInput.target,
						repoFull,
						cwd,
						validInput.force ?? false,
					),
				),
				TE.chain((ctx) =>
					runUpsert(ctx.client, ctx.target, ctx.artifact, validInput),
				),
			),
		),
		TE.map((data) => successResult(TOOL_NAME, data)),
	);
};

/**
 * Project the body, scan comments, decide, and write (or dry-run) — the part of
 * the flow that runs after the target is resolved and the artifact is loaded.
 */
const runUpsert = (
	client: Octokit,
	target: ResolvedTarget,
	artifact: LoadedArtifact,
	input: PublishCommentInput,
): TE.TaskEither<CLIError, PublishCommentOutput> => {
	const force = input.force ?? false;
	const dryRun = input.dry_run ?? false;
	const warnings: string[] = [];

	if (!`${path.resolve(input.artifact_path)}/`.includes("/.rp1/work/")) {
		warnings.push(
			`WARNING: ${input.artifact_path} is outside .rp1/work/. The path-based ` +
				"idempotency key still works; this is informational.",
		);
	}

	const { fm } = splitFrontmatter(artifact.text);
	const { body, warnings: projectionWarnings } = project(
		artifact.text,
		artifact.relativePath,
	);
	warnings.push(...projectionWarnings);

	const sizeError = checkSize(body);
	if (sizeError) {
		return TE.left(runtimeError(sizeError));
	}

	const docKey = markerKey(fm, artifact.relativePath);
	const sizeBytes = new TextEncoder().encode(body).length;

	return pipe(
		TE.Do,
		TE.bind("comments", () =>
			fetchArtifactComments(client, target.owner, target.repo, target.number),
		),
		TE.bind("me", () => authenticatedLogin(client)),
		TE.chain(({ comments, me }) => {
			const matches = findMarkerMatches(comments, docKey);
			const decision = decideAction(matches, me, force);

			if (decision.action === "REFUSE") {
				return TE.left(runtimeError(decision.reason));
			}

			if (decision.action === "POST") {
				const orphan = softDetectOrphan(comments, me, docKey);
				if (orphan) {
					warnings.push(orphan);
				}
			} else if (matches.length > 0) {
				const warn = mtimeWarning(artifact.mtime, matches[0].updatedAt, force);
				if (warn) {
					warnings.push(warn);
				}
			}

			const action = decision.action === "POST" ? "post" : "patch";

			if (dryRun) {
				return TE.right<CLIError, PublishCommentOutput>({
					action,
					comment_url: null,
					doc_key: docKey,
					size_bytes: sizeBytes,
					warnings,
					dry_run: true,
					comment_body: body,
				});
			}

			const write =
				decision.action === "POST"
					? createComment(
							client,
							target.owner,
							target.repo,
							target.number,
							body,
						)
					: updateComment(
							client,
							target.owner,
							target.repo,
							decision.targetCommentId,
							body,
						);

			return pipe(
				write,
				TE.map(
					(htmlUrl): PublishCommentOutput => ({
						action,
						comment_url: htmlUrl,
						doc_key: docKey,
						size_bytes: sizeBytes,
						warnings,
						dry_run: false,
					}),
				),
			);
		}),
	);
};
