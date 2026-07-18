import { readdir, stat } from "node:fs/promises";
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

const isDirectory = async (path: string): Promise<boolean> => {
	try {
		const s = await stat(path);
		return s.isDirectory();
	} catch {
		return false;
	}
};

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
		if (await exists(join(targetDir, manifest))) {
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
		if (await isDirectory(join(targetDir, dir))) {
			return {
				name: "source-entry",
				pass: true,
				detail: `Found ${dir}/ directory`,
			};
		}
	}

	for (const file of SOURCE_ENTRY_FILES) {
		if (await exists(join(targetDir, file))) {
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
		if (await isDirectory(join(targetDir, dir))) {
			return {
				name: "test-file",
				pass: true,
				detail: `Found ${dir}/ directory`,
			};
		}
	}

	try {
		const entries = await readdir(targetDir);
		for (const entry of entries) {
			for (const pattern of TEST_PATTERNS) {
				if (pattern.test(entry)) {
					return {
						name: "test-file",
						pass: true,
						detail: `Found ${entry}`,
					};
				}
			}
		}
	} catch {
		// readdir failure handled by returning false below
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
