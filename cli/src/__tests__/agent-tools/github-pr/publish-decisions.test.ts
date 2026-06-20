/**
 * Unit tests for the publish-artifact decision logic (publish-decisions.ts).
 *
 * The bulk of this suite exercises the decision functions with in-memory
 * `ArtifactComment` fixtures and asserts the upsert decision, soft-orphan
 * detection, and the UTC-correct mtime warning (REQ-007).
 *
 * A final block exercises `executePublishComment`'s create-vs-update branch
 * against a mocked Octokit to confirm POST calls `issues.createComment`, PATCH
 * calls `issues.updateComment`, and — with Bun.spawn stubbed to throw — that no
 * `gh` subprocess is spawned (REQ-001).
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as E from "fp-ts/lib/Either.js";
import * as realGitModule from "../../../agent-tools/git.js";
import {
	type ArtifactComment,
	decideAction,
	findMarkerMatches,
	mtimeWarning,
	softDetectOrphan,
} from "../../../agent-tools/github-pr/publish-decisions.js";

// Snapshot the real git.js exports at load time (before any mock.module call),
// so the mocked block can spread a COMPLETE module and fully restore it after.
// Bun's mock.restore() does not undo mock.module(), so without this an
// incomplete git.js stub leaks into later test files (e.g. comment-extract /
// change-manifest), breaking their imports and git lookups.
const REAL_GIT = { ...realGitModule };

const ME = "octocat";
const DOC_KEY = "path:.rp1/work/features/x/report.md";
const MARKER = `<!-- rp1-artifact: ${DOC_KEY} -->`;
const FOOTER = "Posted by `publish-artifact`";

/** Build an ArtifactComment fixture with sensible defaults. */
const comment = (over: Partial<ArtifactComment> = {}): ArtifactComment => ({
	id: 1,
	body: `${MARKER}\nbody\n${FOOTER}`,
	userLogin: ME,
	htmlUrl: "https://github.com/o/r/issues/1#issuecomment-1",
	updatedAt: "2026-06-11T00:00:00Z",
	...over,
});

describe("decideAction", () => {
	test("0 matches -> POST with null target id", () => {
		const decision = decideAction([], ME, false);
		expect(decision).toEqual({ action: "POST", targetCommentId: null });
	});

	test("1 match owned by me -> PATCH targeting that comment", () => {
		const mine = comment({ id: 42, userLogin: ME });
		const decision = decideAction([mine], ME, false);
		expect(decision).toEqual({ action: "PATCH", targetCommentId: 42 });
	});

	test("1 foreign match without force -> REFUSE", () => {
		const foreign = comment({
			id: 7,
			userLogin: "stranger",
			htmlUrl: "https://github.com/o/r/issues/1#issuecomment-7",
		});
		const decision = decideAction([foreign], ME, false);
		expect(decision.action).toBe("REFUSE");
		if (decision.action === "REFUSE") {
			expect(decision.reason).toBe(
				"Comment is owned by @stranger " +
					"(https://github.com/o/r/issues/1#issuecomment-7). " +
					"Pass --force to overwrite, or coordinate with them.",
			);
		}
	});

	test("1 foreign match with force -> PATCH (force overrides ownership)", () => {
		const foreign = comment({ id: 9, userLogin: "stranger" });
		const decision = decideAction([foreign], ME, true);
		expect(decision).toEqual({ action: "PATCH", targetCommentId: 9 });
	});

	test(">=2 matches -> REFUSE even with force (manual dedup)", () => {
		const a = comment({
			id: 1,
			htmlUrl: "https://github.com/o/r/issues/1#issuecomment-1",
		});
		const b = comment({
			id: 2,
			htmlUrl: "https://github.com/o/r/issues/1#issuecomment-2",
		});
		const decision = decideAction([a, b], ME, true);
		expect(decision.action).toBe("REFUSE");
		if (decision.action === "REFUSE") {
			expect(decision.reason).toBe(
				"Found 2 comments matching this artifact:\n" +
					"  https://github.com/o/r/issues/1#issuecomment-1\n" +
					"  https://github.com/o/r/issues/1#issuecomment-2\n" +
					"Delete duplicates manually, then re-run.",
			);
		}
	});
});

describe("findMarkerMatches", () => {
	test("matches only comments whose body opens with this doc_key marker", () => {
		const match = comment({ id: 1 });
		const otherKey = comment({
			id: 2,
			body: "<!-- rp1-artifact: path:other.md -->\nbody",
		});
		const noMarker = comment({ id: 3, body: "plain comment" });
		const matches = findMarkerMatches([match, otherKey, noMarker], DOC_KEY);
		expect(matches.map((c) => c.id)).toEqual([1]);
	});

	test("marker must be at the start of the body, not mid-body", () => {
		const midBody = comment({ id: 1, body: `intro\n${MARKER}\nbody` });
		expect(findMarkerMatches([midBody], DOC_KEY)).toEqual([]);
	});
});

describe("softDetectOrphan", () => {
	test("fires when a prior publish-artifact comment by me has no marker match", () => {
		const orphan = comment({ id: 1, body: `stale body\n${FOOTER}` });
		const warning = softDetectOrphan([orphan], ME, DOC_KEY);
		expect(warning).toBe(
			"WARNING: found 1 prior publish-artifact comment(s) but no " +
				`marker for doc_key ${DOC_KEY}. Idempotency is broken — a new ` +
				"comment will be posted, orphaning the old one(s).",
		);
	});

	test("does not fire for a foreign-authored prior comment", () => {
		const foreign = comment({ body: `x\n${FOOTER}`, userLogin: "stranger" });
		expect(softDetectOrphan([foreign], ME, DOC_KEY)).toBeNull();
	});

	test("does not fire when no footer-bearing comment exists", () => {
		const noFooter = comment({ body: "just a comment" });
		expect(softDetectOrphan([noFooter], ME, DOC_KEY)).toBeNull();
	});
});

describe("mtimeWarning", () => {
	// "2026-06-11T00:00:00Z" is 1781136000 epoch seconds when the trailing Z is
	// honored as UTC (matching the commentTs constant below). Pinning both sides
	// of the comparison to fixed epoch seconds keeps these assertions
	// timezone-independent.
	const updatedAt = "2026-06-11T00:00:00Z";
	const commentTs = 1781136000;

	test("warns when local artifact predates the comment (UTC compare)", () => {
		expect(mtimeWarning(commentTs - 1, updatedAt, false)).toBe(
			"WARNING: local artifact is older than the existing comment. " +
				"Continuing — pass --force to suppress this warning.",
		);
	});

	test("does not warn when local artifact is newer than the comment", () => {
		expect(mtimeWarning(commentTs + 1, updatedAt, false)).toBeNull();
	});

	test("does not warn when local mtime equals the comment timestamp", () => {
		expect(mtimeWarning(commentTs, updatedAt, false)).toBeNull();
	});

	test("force suppresses the warning regardless of staleness", () => {
		expect(mtimeWarning(commentTs - 1000, updatedAt, true)).toBeNull();
	});
});

/**
 * Create-vs-update against a mocked Octokit (REQ-001).
 *
 * `executePublishComment` builds its Octokit client from `@octokit/rest` and
 * resolves repo identity / current branch via `git.ts`. We mock those modules so
 * the orchestration runs end-to-end without any network, and stub Bun.spawn
 * (git.ts's subprocess mechanism) to throw, then assert the POST path calls
 * `issues.createComment` (not `updateComment`), the PATCH path calls
 * `issues.updateComment` (not `createComment`), and neither spawned a subprocess.
 */
describe("executePublishComment create-vs-update (mocked Octokit)", () => {
	let tmpRoot: string;
	let artifactPath: string;
	let createComment: ReturnType<typeof mock>;
	let updateComment: ReturnType<typeof mock>;
	let listCommentsResult: ArtifactComment[];
	let originalToken: string | undefined;
	let originalSpawn: typeof Bun.spawn;
	let spawnCalls: number;

	const HTML_URL = "https://github.com/o/r/issues/123#issuecomment-1";

	const loadExecute = async () => {
		const mod = await import(
			"../../../agent-tools/github-pr/publish-comment.js"
		);
		return mod.executePublishComment;
	};

	beforeEach(() => {
		// A real artifact under a `.rp1/work/` path: satisfies fs reads and the
		// path-based idempotency check without mocking the filesystem.
		tmpRoot = mkdtempSync(path.join(tmpdir(), "publish-decisions-"));
		const workDir = path.join(tmpRoot, ".rp1", "work");
		mkdirSync(workDir, { recursive: true });
		artifactPath = path.join(workDir, "report.md");
		writeFileSync(
			artifactPath,
			"---\nartifact: investigation-report\n---\n# Report\n\nBody text.\n",
		);

		createComment = mock(async () => ({ data: { html_url: HTML_URL } }));
		updateComment = mock(async () => ({ data: { html_url: HTML_URL } }));
		listCommentsResult = [];

		const fakeOctokit = {
			paginate: mock(async () =>
				listCommentsResult.map((c) => ({
					id: c.id,
					body: c.body,
					user: { login: c.userLogin },
					html_url: c.htmlUrl,
					updated_at: c.updatedAt,
				})),
			),
			users: {
				getAuthenticated: mock(async () => ({ data: { login: ME } })),
			},
			issues: {
				get: mock(async () => ({ data: { pull_request: {} } })),
				listComments: mock(async () => ({ data: [] })),
				createComment,
				updateComment,
			},
			pulls: {
				get: mock(async () => ({
					data: { merged: false, state: "open" },
				})),
				list: mock(async () => ({ data: [{ number: 123 }] })),
			},
		};

		mock.module("@octokit/rest", () => ({
			Octokit: class {
				constructor() {
					Object.assign(this, fakeOctokit);
				}
			},
		}));
		mock.module("../../../agent-tools/git.js", () => ({
			...REAL_GIT,
			// origin remote -> owner/repo; show-toplevel -> the temp repo root so
			// the artifact's repo-relative path (and thus doc_key) is deterministic.
			execGitCommand: (args: readonly string[]) => async () =>
				args.includes("get-url")
					? E.right("git@github.com:o/r.git")
					: E.right(tmpRoot),
			getCurrentBranch: () => async () => E.right("feature"),
		}));

		originalToken = process.env.GITHUB_TOKEN;
		process.env.GITHUB_TOKEN = "test-token-for-mocking";

		// REQ-001 guard: git.ts shells out via Bun.spawn, so stub it to record
		// (spawnCalls) and throw — a regression that runs `gh` fails loudly here
		// instead of passing silently as it would when only Octokit is mocked.
		spawnCalls = 0;
		originalSpawn = Bun.spawn;
		Bun.spawn = ((): never => {
			spawnCalls++;
			throw new Error("publish-comment must not spawn a subprocess");
		}) as unknown as typeof Bun.spawn;
	});

	afterEach(() => {
		rmSync(tmpRoot, { recursive: true, force: true });
		Bun.spawn = originalSpawn;
		if (originalToken !== undefined) {
			process.env.GITHUB_TOKEN = originalToken;
		} else {
			delete process.env.GITHUB_TOKEN;
		}
		mock.restore();
		// mock.restore() does not undo mock.module(); restore the real git.js
		// explicitly so this file's stub never leaks into other test files.
		mock.module("../../../agent-tools/git.js", () => REAL_GIT);
	});

	test("POST path calls issues.createComment and not updateComment", async () => {
		const executePublishComment = await loadExecute();
		listCommentsResult = []; // no existing marker match -> POST

		const result = await executePublishComment(
			JSON.stringify({ artifact_path: artifactPath, target: "123" }),
		)();

		expect(E.isRight(result)).toBe(true);
		expect(createComment).toHaveBeenCalledTimes(1);
		expect(updateComment).toHaveBeenCalledTimes(0);
		expect(spawnCalls).toBe(0);
		if (E.isRight(result)) {
			expect(result.right.data.action).toBe("post");
			expect(result.right.data.comment_url).toBe(HTML_URL);
		}
	});

	test("PATCH path calls issues.updateComment and not createComment", async () => {
		const executePublishComment = await loadExecute();
		// Determine the doc_key the orchestration derives so the existing comment's
		// marker matches and resolves to a PATCH owned by ME.
		const docKey = `path:${path.relative(tmpRoot, artifactPath)}`;
		listCommentsResult = [
			comment({
				id: 99,
				userLogin: ME,
				body: `<!-- rp1-artifact: ${docKey} -->\nold body`,
			}),
		];

		const result = await executePublishComment(
			JSON.stringify({ artifact_path: artifactPath, target: "123" }),
		)();

		expect(E.isRight(result)).toBe(true);
		expect(updateComment).toHaveBeenCalledTimes(1);
		expect(createComment).toHaveBeenCalledTimes(0);
		expect(spawnCalls).toBe(0);
		if (E.isRight(result)) {
			expect(result.right.data.action).toBe("patch");
		}
		// The update targeted the matched comment id, never the gh subprocess.
		expect(updateComment.mock.calls[0]?.[0]?.comment_id).toBe(99);
	});
});
