import { existsSync } from "node:fs";
import {
	mkdir,
	readdir,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import path from "node:path";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { runtimeError } from "../../../shared/errors.js";
import { isSupportedSourcePath } from "../comment-extract/patterns.js";
import { execGitCommand, execGitCommandMayFail } from "../git.js";
import {
	type BaselineSnapshot,
	CHANGE_MANIFEST_VERSION,
	type ChangeManifest,
	type ChangeManifestFile,
	type ChangeManifestHunk,
	type GenerateChangeManifestOptions,
	type GenerateChangeManifestResult,
	type ManifestSkipReason,
	type ManifestStatus,
	type SnapshotOptions,
	type SnapshotResult,
} from "./models.js";

type HunkMap = Map<string, ChangeManifestHunk[]>;

const isoNow = (now: (() => Date) | undefined): string =>
	(now ? now() : new Date()).toISOString();

const toJson = (value: unknown): string =>
	`${JSON.stringify(value, null, 2)}\n`;

const writeJson = async (filePath: string, value: unknown): Promise<void> => {
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, toJson(value), "utf-8");
};

const removeIfExists = async (filePath: string): Promise<void> => {
	await rm(filePath, { force: true });
};

const normalizePath = (filePath: string): string =>
	filePath.replace(/\\/g, "/").split(path.sep).join("/").replace(/^\.\//, "");

const cliErrorMessage = (error: CLIError): string => {
	if ("message" in error) {
		return error.message;
	}
	if ("resource" in error) {
		return `${error.resource} not found`;
	}
	return error._tag;
};

const resolveInsideCodeRoot = (
	codeRoot: string,
	filePath: string,
): string | null => {
	const resolved = path.isAbsolute(filePath)
		? path.resolve(filePath)
		: path.resolve(codeRoot, filePath);
	const relative = path.relative(codeRoot, resolved);
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		return null;
	}
	return resolved;
};

const relativeToCodeRoot = (
	codeRoot: string,
	filePath: string,
): string | null => {
	const resolved = resolveInsideCodeRoot(codeRoot, filePath);
	if (!resolved) {
		return null;
	}
	return normalizePath(path.relative(codeRoot, resolved));
};

const addHunk = (
	hunksByPath: HunkMap,
	relativePath: string,
	hunk: ChangeManifestHunk,
): void => {
	if (hunk.startLine < 1 || hunk.endLine < hunk.startLine) {
		return;
	}
	const hunks = hunksByPath.get(relativePath) ?? [];
	hunks.push(hunk);
	hunksByPath.set(relativePath, hunks);
};

const mergeHunks = (
	hunks: readonly ChangeManifestHunk[],
): readonly ChangeManifestHunk[] => {
	const sorted = [...hunks].sort(
		(a, b) => a.startLine - b.startLine || a.endLine - b.endLine,
	);
	const merged: ChangeManifestHunk[] = [];
	for (const hunk of sorted) {
		const previous = merged.at(-1);
		if (!previous || hunk.startLine > previous.endLine + 1) {
			merged.push({ ...hunk });
			continue;
		}
		merged[merged.length - 1] = {
			startLine: previous.startLine,
			endLine: Math.max(previous.endLine, hunk.endLine),
		};
	}
	return merged;
};

const ownedLineCount = (files: readonly ChangeManifestFile[]): number =>
	files.reduce(
		(total, file) =>
			total +
			file.ownedHunks.reduce(
				(fileTotal, hunk) => fileTotal + hunk.endLine - hunk.startLine + 1,
				0,
			),
		0,
	);

const buildManifestFiles = (hunksByPath: HunkMap): ChangeManifestFile[] =>
	Array.from(hunksByPath.entries())
		.map(([filePath, hunks]) => ({
			path: filePath,
			ownedHunks: mergeHunks(hunks),
			allowedOperations: ["remove_comments"] as const,
		}))
		.filter((file) => file.ownedHunks.length > 0)
		.sort((a, b) => a.path.localeCompare(b.path));

const recordSkip = async (
	options: GenerateChangeManifestOptions,
	codeRoot: string,
	reason: ManifestSkipReason,
	details: {
		readonly dirtyPaths?: readonly string[];
		readonly overlappedDirtyPaths?: readonly string[];
	} = {},
): Promise<GenerateChangeManifestResult> => {
	const statusPath = path.resolve(options.statusOut);
	const status: ManifestStatus = {
		version: CHANGE_MANIFEST_VERSION,
		status: "skipped",
		source: options.source,
		codeRoot,
		generatedAt: isoNow(options.now),
		manifestPath: null,
		files: 0,
		ownedLineCount: 0,
		skipReason: reason,
		...details,
	};
	await removeIfExists(path.resolve(options.out));
	await writeJson(statusPath, status);
	return {
		status: "skipped",
		manifestPath: null,
		statusPath,
		files: 0,
		ownedLineCount: 0,
		skipReason: reason,
	};
};

const recordCreated = async (
	options: GenerateChangeManifestOptions,
	codeRoot: string,
	files: readonly ChangeManifestFile[],
	dirtyPaths: readonly string[] = [],
): Promise<GenerateChangeManifestResult> => {
	const manifestPath = path.resolve(options.out);
	const statusPath = path.resolve(options.statusOut);
	const lineCount = ownedLineCount(files);
	const generatedAt = isoNow(options.now);
	const manifest: ChangeManifest = {
		version: CHANGE_MANIFEST_VERSION,
		source: options.source,
		codeRoot,
		generatedAt,
		files,
	};
	const status: ManifestStatus = {
		version: CHANGE_MANIFEST_VERSION,
		status: "created",
		source: options.source,
		codeRoot,
		generatedAt,
		manifestPath,
		files: files.length,
		ownedLineCount: lineCount,
		skipReason: null,
		dirtyPaths,
	};
	await writeJson(manifestPath, manifest);
	await writeJson(statusPath, status);
	return {
		status: "created",
		manifestPath,
		statusPath,
		files: files.length,
		ownedLineCount: lineCount,
		skipReason: null,
	};
};

const parseDirtyPaths = (statusOutput: string): readonly string[] => {
	const paths = new Set<string>();
	for (const line of statusOutput.split("\n")) {
		if (!line.trim()) {
			continue;
		}
		const match = line.match(/^(?:[ MADRCU?!]{1,2})\s+(.+)$/);
		const rawPath = (match?.[1] ?? line).trim();
		if (!rawPath) {
			continue;
		}
		const renameParts = rawPath.split(" -> ");
		for (const part of renameParts) {
			paths.add(normalizePath(part));
		}
	}
	return Array.from(paths).sort();
};

const dirtyPathOverlapsCandidate = (
	dirtyPath: string,
	candidatePath: string,
): boolean => {
	const dirty = normalizePath(dirtyPath).replace(/\/+$/, "");
	const candidate = normalizePath(candidatePath);
	return (
		dirty !== "" && (candidate === dirty || candidate.startsWith(`${dirty}/`))
	);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isPositiveInteger = (value: unknown): value is number =>
	Number.isInteger(value) && Number(value) > 0;

const isValidHead = (value: string): boolean => /^[0-9a-f]{7,40}$/i.test(value);

const parseBaselineSnapshot = (
	content: string,
	expectedCodeRoot: string,
): BaselineSnapshot | ManifestSkipReason => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(content);
	} catch {
		return "invalid_baseline";
	}
	if (
		!isRecord(parsed) ||
		parsed.version !== CHANGE_MANIFEST_VERSION ||
		typeof parsed.codeRoot !== "string" ||
		typeof parsed.head !== "string" ||
		typeof parsed.generatedAt !== "string" ||
		!Array.isArray(parsed.dirtyPaths) ||
		!parsed.dirtyPaths.every((item) => typeof item === "string") ||
		!isValidHead(parsed.head)
	) {
		return "invalid_baseline";
	}
	if (path.resolve(parsed.codeRoot) !== expectedCodeRoot) {
		return "baseline_code_root_mismatch";
	}
	return {
		version: CHANGE_MANIFEST_VERSION,
		codeRoot: expectedCodeRoot,
		head: parsed.head,
		dirtyPaths: parsed.dirtyPaths.map(normalizePath).sort(),
		generatedAt: parsed.generatedAt,
	};
};

const loadBaselineSnapshot = async (
	baselinePath: string | undefined,
	codeRoot: string,
): Promise<BaselineSnapshot | ManifestSkipReason> => {
	if (!baselinePath) {
		return "missing_baseline";
	}
	const resolved = path.resolve(baselinePath);
	if (!existsSync(resolved)) {
		return "missing_baseline";
	}
	const content = await readFile(resolved, "utf-8");
	const baseline = parseBaselineSnapshot(content, codeRoot);
	if (typeof baseline === "string") {
		return baseline;
	}
	const headExists = await execGitCommandMayFail(
		["cat-file", "-e", `${baseline.head}^{commit}`],
		codeRoot,
	)();
	if (headExists._tag === "Left" || !headExists.right.success) {
		return "invalid_baseline";
	}
	return baseline;
};

export const parseUnifiedDiffHunks = (
	diff: string,
	codeRoot: string,
): HunkMap => {
	const hunksByPath: HunkMap = new Map();
	let currentPath: string | null = null;

	for (const line of diff.split("\n")) {
		if (line.startsWith("+++ /dev/null")) {
			currentPath = null;
			continue;
		}
		if (line.startsWith("+++ b/")) {
			const relativePath = relativeToCodeRoot(codeRoot, line.slice(6));
			currentPath =
				relativePath && isSupportedSourcePath(relativePath)
					? relativePath
					: null;
			continue;
		}
		if (!line.startsWith("@@") || !currentPath) {
			continue;
		}
		const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
		if (!match) {
			continue;
		}
		const startLine = Number.parseInt(match[1], 10);
		const count = match[2] ? Number.parseInt(match[2], 10) : 1;
		if (count > 0) {
			addHunk(hunksByPath, currentPath, {
				startLine,
				endLine: startLine + count - 1,
			});
		}
	}

	return hunksByPath;
};

const mergeHunkMaps = (target: HunkMap, source: HunkMap): void => {
	for (const [filePath, hunks] of source) {
		for (const hunk of hunks) {
			addHunk(target, filePath, hunk);
		}
	}
};

const lineCount = (content: string): number => {
	if (content.length === 0) {
		return 0;
	}
	const lines = content.split(/\r?\n/);
	return content.endsWith("\n") || content.endsWith("\r\n")
		? lines.length - 1
		: lines.length;
};

const addFullFileHunk = async (
	hunksByPath: HunkMap,
	codeRoot: string,
	filePath: string,
): Promise<"added" | "outside" | "skipped"> => {
	const relativePath = relativeToCodeRoot(codeRoot, filePath);
	if (!relativePath) {
		return "outside";
	}
	if (!isSupportedSourcePath(relativePath)) {
		return "skipped";
	}
	const resolved = path.resolve(codeRoot, relativePath);
	const content = await readFile(resolved, "utf-8");
	const count = lineCount(content);
	if (count < 1) {
		return "skipped";
	}
	addHunk(hunksByPath, relativePath, { startLine: 1, endLine: count });
	return "added";
};

const addDirectoryHunks = async (
	hunksByPath: HunkMap,
	codeRoot: string,
	dirPath: string,
): Promise<"added" | "outside" | "skipped"> => {
	const resolved = resolveInsideCodeRoot(codeRoot, dirPath);
	if (!resolved) {
		return "outside";
	}
	let added = false;
	const entries = await readdir(resolved, { withFileTypes: true });
	for (const entry of entries) {
		const child = path.join(resolved, entry.name);
		const relativePath = path.relative(codeRoot, child);
		if (entry.isDirectory()) {
			if (isSupportedSourcePath(path.join(relativePath, "placeholder.ts"))) {
				const result = await addDirectoryHunks(hunksByPath, codeRoot, child);
				added ||= result === "added";
			}
			continue;
		}
		if (!entry.isFile()) {
			continue;
		}
		const result = await addFullFileHunk(hunksByPath, codeRoot, child);
		if (result === "outside") {
			return "outside";
		}
		added ||= result === "added";
	}
	return added ? "added" : "skipped";
};

const parseExistingManifestHunks = async (
	hunksByPath: HunkMap,
	codeRoot: string,
	manifestPath: string,
): Promise<"added" | "outside" | "invalid" | "skipped"> => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(await readFile(manifestPath, "utf-8"));
	} catch {
		return "invalid";
	}
	if (
		!isRecord(parsed) ||
		parsed.version !== CHANGE_MANIFEST_VERSION ||
		!Array.isArray(parsed.files)
	) {
		return "invalid";
	}
	const manifestCodeRoot =
		typeof parsed.codeRoot === "string"
			? path.resolve(parsed.codeRoot)
			: codeRoot;
	let added = false;
	for (const file of parsed.files) {
		if (!isRecord(file) || typeof file.path !== "string" || !file.path) {
			return "invalid";
		}
		if (
			file.allowedOperations !== undefined &&
			!Array.isArray(file.allowedOperations)
		) {
			return "invalid";
		}
		if (
			Array.isArray(file.allowedOperations) &&
			!file.allowedOperations.includes("remove_comments") &&
			!file.allowedOperations.includes("comment_cleanup")
		) {
			return "invalid";
		}
		const resolvedFile = resolveInsideCodeRoot(manifestCodeRoot, file.path);
		if (!resolvedFile) {
			return "outside";
		}
		const relativePath = relativeToCodeRoot(codeRoot, resolvedFile);
		if (!relativePath) {
			return "outside";
		}
		if (!isSupportedSourcePath(relativePath)) {
			continue;
		}
		const lines = new Set<number>();
		if (file.ownedLines !== undefined) {
			if (
				!Array.isArray(file.ownedLines) ||
				!file.ownedLines.every(isPositiveInteger)
			) {
				return "invalid";
			}
			for (const line of file.ownedLines) {
				lines.add(line);
			}
		}
		if (file.ownedHunks !== undefined) {
			if (!Array.isArray(file.ownedHunks)) {
				return "invalid";
			}
			for (const hunk of file.ownedHunks) {
				if (
					!isRecord(hunk) ||
					!isPositiveInteger(hunk.startLine) ||
					!isPositiveInteger(hunk.endLine) ||
					hunk.endLine < hunk.startLine
				) {
					return "invalid";
				}
				addHunk(hunksByPath, relativePath, {
					startLine: hunk.startLine,
					endLine: hunk.endLine,
				});
				added = true;
			}
		}
		for (const line of lines) {
			addHunk(hunksByPath, relativePath, { startLine: line, endLine: line });
			added = true;
		}
		if (!lines.size && file.ownedHunks === undefined) {
			return "invalid";
		}
	}
	return added ? "added" : "skipped";
};

const collectUntrackedHunks = async (codeRoot: string): Promise<HunkMap> => {
	const result = await execGitCommandMayFail(
		["ls-files", "--others", "--exclude-standard", "-z"],
		codeRoot,
	)();
	if (result._tag === "Left" || !result.right.stdout) {
		return new Map();
	}
	const hunksByPath: HunkMap = new Map();
	for (const filePath of result.right.stdout.split("\0").filter(Boolean)) {
		await addFullFileHunk(hunksByPath, codeRoot, filePath);
	}
	return hunksByPath;
};

const collectBuildHunks = async (
	codeRoot: string,
	baseline: BaselineSnapshot,
): Promise<HunkMap> => {
	const hunksByPath: HunkMap = new Map();
	for (const args of [
		["diff", "-U0", "--no-color", `${baseline.head}..HEAD`],
		["diff", "--cached", "-U0", "--no-color"],
		["diff", "-U0", "--no-color"],
	] as const) {
		const result = await execGitCommandMayFail(args, codeRoot)();
		if (result._tag === "Right" && result.right.stdout) {
			mergeHunkMaps(
				hunksByPath,
				parseUnifiedDiffHunks(result.right.stdout, codeRoot),
			);
		}
	}
	mergeHunkMaps(hunksByPath, await collectUntrackedHunks(codeRoot));
	return hunksByPath;
};

const collectScopeHunks = async (
	codeRoot: string,
	scope: string | undefined,
): Promise<HunkMap | ManifestSkipReason> => {
	if (!scope || !scope.trim()) {
		return "invalid_scope";
	}
	const hunksByPath: HunkMap = new Map();
	const resolvedScope = path.isAbsolute(scope)
		? path.resolve(scope)
		: path.resolve(codeRoot, scope);

	if (existsSync(resolvedScope)) {
		const scopeStat = await stat(resolvedScope);
		if (
			scopeStat.isFile() &&
			path.extname(resolvedScope).toLowerCase() === ".json"
		) {
			const result = await parseExistingManifestHunks(
				hunksByPath,
				codeRoot,
				resolvedScope,
			);
			if (result === "invalid") {
				return "invalid_scope";
			}
			if (result === "outside") {
				return "scope_outside_code_root";
			}
			return hunksByPath;
		}
		if (scopeStat.isFile()) {
			const result = await addFullFileHunk(
				hunksByPath,
				codeRoot,
				resolvedScope,
			);
			return result === "outside" ? "scope_outside_code_root" : hunksByPath;
		}
		if (scopeStat.isDirectory()) {
			const result = await addDirectoryHunks(
				hunksByPath,
				codeRoot,
				resolvedScope,
			);
			return result === "outside" ? "scope_outside_code_root" : hunksByPath;
		}
		return "unsupported_scope";
	}

	const args = scope.includes("..")
		? ["diff", "-U0", "--no-color", scope]
		: ["diff", "-U0", "--no-color", `${scope}...HEAD`];
	const result = await execGitCommandMayFail(args, codeRoot)();
	if (result._tag === "Left" || !result.right.success) {
		return "unsupported_scope";
	}
	mergeHunkMaps(
		hunksByPath,
		parseUnifiedDiffHunks(result.right.stdout, codeRoot),
	);
	return hunksByPath;
};

export const createBaselineSnapshot = (
	options: SnapshotOptions,
): TE.TaskEither<CLIError, SnapshotResult> =>
	pipe(
		TE.tryCatch(
			async () => {
				const codeRoot = path.resolve(options.codeRoot);
				const head = await execGitCommand(["rev-parse", "HEAD"], codeRoot)();
				if (head._tag === "Left") {
					throw new Error(cliErrorMessage(head.left));
				}
				const status = await execGitCommand(
					["status", "--porcelain", "--untracked-files=normal"],
					codeRoot,
				)();
				if (status._tag === "Left") {
					throw new Error(cliErrorMessage(status.left));
				}
				const snapshot: BaselineSnapshot = {
					version: CHANGE_MANIFEST_VERSION,
					codeRoot,
					head: head.right,
					dirtyPaths: parseDirtyPaths(status.right),
					generatedAt: isoNow(options.now),
				};
				const snapshotPath = path.resolve(options.out);
				await writeJson(snapshotPath, snapshot);
				return {
					snapshotPath,
					codeRoot,
					head: snapshot.head,
					dirtyPaths: snapshot.dirtyPaths,
				};
			},
			(error) =>
				runtimeError(
					`Failed to create change manifest baseline: ${
						error instanceof Error ? error.message : String(error)
					}`,
				),
		),
	);

export const generateChangeManifest = (
	options: GenerateChangeManifestOptions,
): TE.TaskEither<CLIError, GenerateChangeManifestResult> =>
	pipe(
		TE.tryCatch(
			async () => {
				const codeRoot = path.resolve(options.codeRoot);
				const hunksByPath =
					options.baseline !== undefined
						? await (async () => {
								const baseline = await loadBaselineSnapshot(
									options.baseline,
									codeRoot,
								);
								if (typeof baseline === "string") {
									return baseline;
								}
								return collectBuildHunks(codeRoot, baseline).then((hunks) => ({
									hunks,
									baseline,
								}));
							})()
						: await collectScopeHunks(codeRoot, options.scope);

				if (typeof hunksByPath === "string") {
					return recordSkip(options, codeRoot, hunksByPath);
				}

				const baseline =
					"hunks" in hunksByPath ? hunksByPath.baseline : undefined;
				const hunkMap =
					"hunks" in hunksByPath ? hunksByPath.hunks : hunksByPath;
				const files = buildManifestFiles(hunkMap);

				if (baseline) {
					const overlappedDirtyPaths = baseline.dirtyPaths.filter((dirtyPath) =>
						files.some((file) =>
							dirtyPathOverlapsCandidate(dirtyPath, file.path),
						),
					);
					if (overlappedDirtyPaths.length > 0) {
						return recordSkip(
							options,
							codeRoot,
							"pre_existing_dirty_paths_overlap",
							{
								dirtyPaths: baseline.dirtyPaths,
								overlappedDirtyPaths,
							},
						);
					}
					if (files.length === 0) {
						return recordSkip(options, codeRoot, "no_supported_source_hunks", {
							dirtyPaths: baseline.dirtyPaths,
						});
					}
					return recordCreated(options, codeRoot, files, baseline.dirtyPaths);
				}

				if (files.length === 0) {
					return recordSkip(options, codeRoot, "no_supported_source_hunks");
				}
				return recordCreated(options, codeRoot, files);
			},
			(error) =>
				runtimeError(
					`Failed to generate change manifest: ${
						error instanceof Error ? error.message : String(error)
					}`,
				),
		),
	);
