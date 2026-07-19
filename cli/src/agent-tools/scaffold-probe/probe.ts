import type { Dirent } from "node:fs";
import { lstat, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import {
	type CLIError,
	notFoundError,
	runtimeError,
} from "../../../shared/errors.js";
import {
	PACKAGE_MANIFESTS,
	type ProbePoint,
	type ProbeResult,
	SOURCE_ENTRY_DIRS,
	SOURCE_ENTRY_FILES,
	TEST_DIRS,
	TEST_PATTERNS,
} from "./models.js";

const exists = async (path: string): Promise<boolean> => {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
};

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

// Bounded, no-follow search for at least one regular file under `dir`,
// optionally matching `match`. readdir's Dirent types come from lstat, so
// symlinks report as neither file nor directory and are skipped. An empty or
// symlink-only directory therefore does not count as populated (review H2).
const dirContainsRegularFile = async (
	dir: string,
	match?: (name: string) => boolean,
	depth = 5,
): Promise<boolean> => {
	let entries: Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return false;
	}

	for (const entry of entries) {
		if (entry.isFile() && (match ? match(entry.name) : true)) {
			return true;
		}
	}

	if (depth > 0) {
		for (const entry of entries) {
			if (
				entry.isDirectory() &&
				(await dirContainsRegularFile(join(dir, entry.name), match, depth - 1))
			) {
				return true;
			}
		}
	}

	return false;
};

const matchesTestPattern = (name: string): boolean =>
	TEST_PATTERNS.some((pattern) => pattern.test(name));

const checkGitCommit = async (targetDir: string): Promise<ProbePoint> => {
	const gitDir = join(targetDir, ".git");
	const gitExists = await exists(gitDir);

	if (!gitExists) {
		return {
			name: "git-commit",
			pass: false,
			detail: "No .git directory found",
		};
	}

	try {
		const proc = Bun.spawn(["git", "rev-parse", "HEAD"], {
			cwd: targetDir,
			stdout: "pipe",
			stderr: "pipe",
			env: {
				...process.env,
				GIT_DIR: undefined,
				GIT_WORK_TREE: undefined,
				GIT_INDEX_FILE: undefined,
				GIT_COMMON_DIR: undefined,
			},
		});
		const exitCode = await proc.exited;

		if (exitCode !== 0) {
			return {
				name: "git-commit",
				pass: false,
				detail: "Git repository has no commits",
			};
		}

		return {
			name: "git-commit",
			pass: true,
			detail: "Initial git commit exists",
		};
	} catch {
		return {
			name: "git-commit",
			pass: false,
			detail: "Failed to verify git history",
		};
	}
};

const checkPackageManifest = async (targetDir: string): Promise<ProbePoint> => {
	for (const manifest of PACKAGE_MANIFESTS) {
		if (await isRegularFile(join(targetDir, manifest))) {
			return {
				name: "package-manifest",
				pass: true,
				detail: `Found ${manifest}`,
			};
		}
	}

	return {
		name: "package-manifest",
		pass: false,
		detail: "No package manifest found",
	};
};

const checkSourceEntry = async (targetDir: string): Promise<ProbePoint> => {
	for (const dir of SOURCE_ENTRY_DIRS) {
		const dirPath = join(targetDir, dir);
		if (
			(await isDirectory(dirPath)) &&
			(await dirContainsRegularFile(dirPath))
		) {
			return {
				name: "source-entry",
				pass: true,
				detail: `Found source file in ${dir}/`,
			};
		}
	}

	for (const file of SOURCE_ENTRY_FILES) {
		if (await isRegularFile(join(targetDir, file))) {
			return {
				name: "source-entry",
				pass: true,
				detail: `Found ${file}`,
			};
		}
	}

	return {
		name: "source-entry",
		pass: false,
		detail: "No source entry point found",
	};
};

const checkTestFile = async (targetDir: string): Promise<ProbePoint> => {
	for (const dir of TEST_DIRS) {
		const dirPath = join(targetDir, dir);
		if (
			(await isDirectory(dirPath)) &&
			(await dirContainsRegularFile(dirPath))
		) {
			return {
				name: "test-file",
				pass: true,
				detail: `Found file in ${dir}/`,
			};
		}
	}

	// Root-level regular file matching a test naming pattern (top level only).
	if (await dirContainsRegularFile(targetDir, matchesTestPattern, 0)) {
		return {
			name: "test-file",
			pass: true,
			detail: "Found test file by naming pattern",
		};
	}

	return {
		name: "test-file",
		pass: false,
		detail: "No test file or test directory found",
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
					const points: ProbePoint[] = await Promise.all([
						checkGitCommit(canonicalDir),
						checkPackageManifest(canonicalDir),
						checkSourceEntry(canonicalDir),
						checkTestFile(canonicalDir),
					]);

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
