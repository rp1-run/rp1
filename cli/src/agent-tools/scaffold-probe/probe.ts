import type { Dirent } from "node:fs";
import { lstat, readdir, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import {
	type CLIError,
	notFoundError,
	runtimeError,
} from "../../../shared/errors.js";
import {
	MANIFEST_LANGUAGE,
	PACKAGE_MANIFESTS,
	type ProbePoint,
	type ProbeResult,
	SOURCE_ENTRY_DIRS,
	SOURCE_ENTRY_EXTENSIONS,
	SOURCE_ENTRY_FILES,
	TEST_DIRS,
	TEST_PATTERNS,
} from "./models.js";

// Result of a file-presence check: whether the point passed, a human-readable
// detail, and the repo-relative path that was accepted (used by the Git check
// to verify the file is actually committed to HEAD — review H2).
interface FileCheck {
	readonly point: ProbePoint;
	readonly acceptedPath?: string;
}

// lstat, not stat: a symlink must not masquerade as a directory (review H2).
const isDirectory = async (path: string): Promise<boolean> => {
	try {
		const s = await lstat(path);
		return s.isDirectory();
	} catch {
		return false;
	}
};

// lstat, not stat: a symlink or directory must not masquerade as a regular
// file (review H2).
const isRegularFile = async (path: string): Promise<boolean> => {
	try {
		const s = await lstat(path);
		return s.isFile();
	} catch {
		return false;
	}
};

// Bounded, no-follow search for the first regular file under `dir` that
// satisfies `match` (or any regular file when `match` is omitted). readdir's
// Dirent types come from lstat, so symlinks report as neither file nor
// directory and are skipped (review H2). Returns the absolute path of the
// matched file, or null.
const findRegularFile = async (
	dir: string,
	match?: (name: string) => boolean,
	depth = 5,
): Promise<string | null> => {
	let entries: Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return null;
	}

	for (const entry of entries) {
		if (entry.isFile() && (match ? match(entry.name) : true)) {
			return join(dir, entry.name);
		}
	}

	if (depth > 0) {
		for (const entry of entries) {
			if (entry.isDirectory()) {
				const found = await findRegularFile(
					join(dir, entry.name),
					match,
					depth - 1,
				);
				if (found) {
					return found;
				}
			}
		}
	}

	return null;
};

const matchesTestPattern = (name: string): boolean =>
	TEST_PATTERNS.some((pattern) => pattern.test(name));

// Recognize a test file *inside a test directory*, honoring language
// conventions. Rust integration tests are any `.rs` file directly under
// `tests/` regardless of name, so a Rust project accepts them; every other
// ecosystem uses filename patterns. This keeps `tests/integration.rs` valid
// while rejecting non-test helpers such as `tests/helper.ts` (review H2).
const isTestFileInDir = (name: string, language: string | null): boolean => {
	if (language === "rust" && extname(name).toLowerCase() === ".rs") {
		return true;
	}
	return matchesTestPattern(name);
};

// A source entry is a known entry-point filename or any file with a recognized
// source extension. Docs/config (`README.md`, `config.json`) do not qualify
// (review H2).
const isSourceEntryName = (name: string): boolean =>
	SOURCE_ENTRY_FILES.includes(name) ||
	SOURCE_ENTRY_EXTENSIONS.includes(extname(name).toLowerCase());

const gitEnv = {
	...process.env,
	GIT_DIR: undefined,
	GIT_WORK_TREE: undefined,
	GIT_INDEX_FILE: undefined,
	GIT_COMMON_DIR: undefined,
};

// True when `relPath` exists in the current HEAD commit tree. Ignored or merely
// working-tree files are absent from HEAD, so this is what proves the scaffold
// was actually committed (review H2).
const isTrackedInHead = async (
	targetDir: string,
	relPath: string,
): Promise<boolean> => {
	try {
		// `HEAD:./<path>` resolves the path relative to cwd (the target), not the
		// repository root. Bootstrap always `git init`s the target so root == cwd,
		// but the `./` prefix keeps this correct even if the target is ever a
		// subdirectory of a larger repo, where a bare `HEAD:<path>` would resolve
		// against the repo root tree instead (review H2, round-9 hardening).
		const proc = Bun.spawn(["git", "cat-file", "-e", `HEAD:./${relPath}`], {
			cwd: targetDir,
			stdout: "ignore",
			stderr: "ignore",
			env: gitEnv,
		});
		return (await proc.exited) === 0;
	} catch {
		return false;
	}
};

const checkGitCommit = async (
	targetDir: string,
	acceptedPaths: readonly string[],
): Promise<ProbePoint> => {
	const gitDir = join(targetDir, ".git");
	if (!(await isDirectory(gitDir)) && !(await isRegularFile(gitDir))) {
		return {
			name: "git-commit",
			pass: false,
			detail: "No .git directory found",
		};
	}

	try {
		const proc = Bun.spawn(["git", "rev-parse", "HEAD"], {
			cwd: targetDir,
			stdout: "ignore",
			stderr: "ignore",
			env: gitEnv,
		});
		if ((await proc.exited) !== 0) {
			return {
				name: "git-commit",
				pass: false,
				detail: "Git repository has no commits",
			};
		}

		// Every accepted scaffold file must be committed to HEAD. Ignored or
		// untracked files are invisible to `git status --porcelain`, so a clean
		// tree alone cannot prove the scaffold was committed (review H2).
		const untracked: string[] = [];
		for (const relPath of acceptedPaths) {
			if (!(await isTrackedInHead(targetDir, relPath))) {
				untracked.push(relPath);
			}
		}
		if (untracked.length > 0) {
			return {
				name: "git-commit",
				pass: false,
				detail: `Scaffold files are not committed to HEAD: ${untracked.join(", ")}`,
			};
		}

		// Clean-tree check as an additional invariant (not proof of tracking):
		// the committed scaffold should leave no pending changes.
		const statusProc = Bun.spawn(["git", "status", "--porcelain"], {
			cwd: targetDir,
			stdout: "pipe",
			stderr: "ignore",
			env: gitEnv,
		});
		const statusExit = await statusProc.exited;
		const statusOutput = (await new Response(statusProc.stdout).text()).trim();

		if (statusExit !== 0) {
			return {
				name: "git-commit",
				pass: false,
				detail: "Failed to inspect git working tree",
			};
		}

		if (statusOutput.length > 0) {
			return {
				name: "git-commit",
				pass: false,
				detail: "Scaffold files are not committed (working tree is dirty)",
			};
		}

		return {
			name: "git-commit",
			pass: true,
			detail:
				"Initial git commit includes the scaffold (tracked in HEAD, clean working tree)",
		};
	} catch {
		return {
			name: "git-commit",
			pass: false,
			detail: "Failed to verify git history",
		};
	}
};

const checkPackageManifest = async (targetDir: string): Promise<FileCheck> => {
	for (const manifest of PACKAGE_MANIFESTS) {
		if (await isRegularFile(join(targetDir, manifest))) {
			return {
				point: {
					name: "package-manifest",
					pass: true,
					detail: `Found ${manifest}`,
				},
				acceptedPath: manifest,
			};
		}
	}

	return {
		point: {
			name: "package-manifest",
			pass: false,
			detail: "No package manifest found",
		},
	};
};

const checkSourceEntry = async (targetDir: string): Promise<FileCheck> => {
	for (const dir of SOURCE_ENTRY_DIRS) {
		const dirPath = join(targetDir, dir);
		if (await isDirectory(dirPath)) {
			const found = await findRegularFile(dirPath, isSourceEntryName);
			if (found) {
				const rel = relative(targetDir, found).split("\\").join("/");
				return {
					point: {
						name: "source-entry",
						pass: true,
						detail: `Found source entry ${rel}`,
					},
					acceptedPath: rel,
				};
			}
		}
	}

	for (const file of SOURCE_ENTRY_FILES) {
		if (await isRegularFile(join(targetDir, file))) {
			return {
				point: {
					name: "source-entry",
					pass: true,
					detail: `Found ${file}`,
				},
				acceptedPath: file,
			};
		}
	}

	return {
		point: {
			name: "source-entry",
			pass: false,
			detail: "No source entry point found",
		},
	};
};

const checkTestFile = async (
	targetDir: string,
	language: string | null,
): Promise<FileCheck> => {
	const matcher = (name: string): boolean => isTestFileInDir(name, language);
	for (const dir of TEST_DIRS) {
		const dirPath = join(targetDir, dir);
		if (await isDirectory(dirPath)) {
			const found = await findRegularFile(dirPath, matcher);
			if (found) {
				const rel = relative(targetDir, found).split("\\").join("/");
				return {
					point: {
						name: "test-file",
						pass: true,
						detail: `Found test file ${rel}`,
					},
					acceptedPath: rel,
				};
			}
		}
	}

	// Root-level regular file matching a test naming pattern (top level only).
	const rootTest = await findRegularFile(targetDir, matchesTestPattern, 0);
	if (rootTest) {
		const rel = relative(targetDir, rootTest).split("\\").join("/");
		return {
			point: {
				name: "test-file",
				pass: true,
				detail: `Found test file ${rel}`,
			},
			acceptedPath: rel,
		};
	}

	return {
		point: {
			name: "test-file",
			pass: false,
			detail: "No test file or test directory found",
		},
	};
};

export const probeScaffold = (
	targetDir: string,
): TE.TaskEither<CLIError, ProbeResult> => {
	if (!targetDir || targetDir.trim() === "") {
		return TE.left(
			notFoundError("Target directory", "Provide a valid --target-dir path."),
		);
	}

	const canonicalDir = resolve(targetDir);

	return pipe(
		TE.tryCatch(
			async () => {
				const s = await stat(canonicalDir);
				if (!s.isDirectory()) {
					throw new Error(`Path is not a directory: ${canonicalDir}`);
				}
			},
			(error): CLIError => {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") {
					return notFoundError(
						`Target directory at ${canonicalDir}`,
						"The target directory does not exist.",
					);
				}
				return runtimeError(
					`Failed to access target directory: ${error instanceof Error ? error.message : String(error)}`,
					error,
				);
			},
		),
		TE.chain(() =>
			TE.tryCatch(
				async () => {
					// Resolve the manifest first: its language drives test-file
					// recognition (e.g. Rust integration tests) — review H2.
					const manifest = await checkPackageManifest(canonicalDir);
					const language = manifest.acceptedPath
						? (MANIFEST_LANGUAGE[manifest.acceptedPath] ?? null)
						: null;

					// Then the remaining file-presence checks, followed by the Git
					// check. The Git check depends on which concrete paths were
					// accepted, so it cannot run in parallel with them.
					const [source, test] = await Promise.all([
						checkSourceEntry(canonicalDir),
						checkTestFile(canonicalDir, language),
					]);

					const acceptedPaths = [manifest, source, test]
						.map((c) => c.acceptedPath)
						.filter((p): p is string => p !== undefined);

					const git = await checkGitCommit(canonicalDir, acceptedPaths);

					const points: ProbePoint[] = [
						git,
						manifest.point,
						source.point,
						test.point,
					];

					const pass = points.every((p) => p.pass);

					return { pass, points };
				},
				(error): CLIError =>
					runtimeError(
						`Scaffold probe failed: ${error instanceof Error ? error.message : String(error)}`,
						error,
					),
			),
		),
	);
};
