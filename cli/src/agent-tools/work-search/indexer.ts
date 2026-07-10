import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import {
	type ResolvedDirectorySet,
	resolveDirectorySet,
} from "../../../shared/directory-resolution.js";
import type { CLIError } from "../../../shared/errors.js";
import { runtimeError } from "../../../shared/errors.js";
import {
	deleteMissingWorkDocuments,
	getWorkDocument,
	getWorkSearchDatabase,
	replaceWorkDocument,
	updateWorkDocumentMetadata,
	upsertProjectScope,
	type WorkSearchChunkInput,
	type WorkSearchDocumentInput,
} from "./database.js";
import {
	createCanonicalArtifactMetadataLookup,
	extractWorkSearchMetadata,
} from "./metadata.js";
import type {
	WorkSearchProjectScope,
	WorkSearchRefreshSummary,
} from "./models.js";

const MARKDOWN_EXTENSION = ".md";
const MAX_CHUNK_CHARACTERS = 4000;

interface MarkdownWorkFile {
	readonly absolutePath: string;
	readonly relativePath: string;
	readonly displayPath: string;
	readonly sizeBytes: number;
	readonly mtimeMs: number;
}

export interface WorkSearchRefreshOptions {
	readonly project?: string;
	readonly dbPath?: string;
}

export interface WorkSearchRefreshOutput {
	readonly project: WorkSearchProjectScope;
	readonly refresh: WorkSearchRefreshSummary;
}

const normalizeRelativePath = (path: string): string =>
	path.split(sep).join("/");

const isWithinRoot = (candidatePath: string, rootPath: string): boolean => {
	const relativePath = relative(resolve(rootPath), resolve(candidatePath));
	return (
		relativePath === "" ||
		(!relativePath.startsWith("..") && !isAbsolute(relativePath))
	);
};

const toProjectScope = (
	directories: ResolvedDirectorySet,
): E.Either<CLIError, WorkSearchProjectScope> =>
	directories.projectId
		? E.right({
				projectId: directories.projectId,
				projectRoot: directories.projectRoot,
				workRoot: directories.workRoot,
			})
		: E.left(
				runtimeError(
					`Unable to resolve rp1 project id for ${directories.projectRoot}`,
				),
			);

export const resolveWorkSearchProjectScope = (
	projectPath?: string,
): TE.TaskEither<CLIError, WorkSearchProjectScope> =>
	TE.fromEither(
		pipe(
			resolveDirectorySet(projectPath ?? process.cwd(), {
				requireProjectId: true,
			}),
			E.chain(toProjectScope),
		),
	);

/**
 * Computes a human-readable display prefix for work artifact paths.
 *
 * Local mode (workRoot inside projectRoot): returns the project-relative path (e.g. `.rp1/work`).
 * Central mode (workRoot outside projectRoot): returns a `~`-prefixed home-relative path
 * (e.g. `~/.rp1/projects/{id}/work`), falling back to the absolute path when workRoot
 * is not under the home directory.
 */
export const computeDisplayPrefix = (
	workRoot: string,
	projectRoot: string,
	homeDir?: string,
): string => {
	const resolvedWorkRoot = resolve(workRoot);
	const resolvedProjectRoot = resolve(projectRoot);

	if (isWithinRoot(resolvedWorkRoot, resolvedProjectRoot)) {
		return normalizeRelativePath(
			relative(resolvedProjectRoot, resolvedWorkRoot),
		);
	}

	const home = homeDir ?? homedir();
	if (resolvedWorkRoot.startsWith(home + sep) || resolvedWorkRoot === home) {
		return `~${normalizeRelativePath(resolvedWorkRoot.slice(home.length))}`;
	}

	return normalizeRelativePath(resolvedWorkRoot);
};

const collectMarkdownFiles = async (
	workRoot: string,
	currentDir: string,
	files: MarkdownWorkFile[],
	displayPrefix: string,
): Promise<void> => {
	let entries: string[];
	try {
		entries = await readdir(currentDir);
	} catch {
		return;
	}

	for (const entry of entries) {
		const absolutePath = join(currentDir, entry);
		if (!isWithinRoot(absolutePath, workRoot)) {
			continue;
		}

		let stat: Awaited<ReturnType<typeof lstat>>;
		try {
			stat = await lstat(absolutePath);
		} catch {
			continue;
		}

		if (stat.isSymbolicLink()) {
			continue;
		}

		if (stat.isDirectory()) {
			await collectMarkdownFiles(workRoot, absolutePath, files, displayPrefix);
			continue;
		}

		if (!stat.isFile() || extname(entry).toLowerCase() !== MARKDOWN_EXTENSION) {
			continue;
		}

		const relativePath = normalizeRelativePath(
			relative(workRoot, absolutePath),
		);
		if (relativePath.startsWith("../") || relativePath === "..") {
			continue;
		}

		files.push({
			absolutePath,
			relativePath,
			displayPath: `${displayPrefix}/${relativePath}`,
			sizeBytes: stat.size,
			mtimeMs: Math.round(stat.mtimeMs),
		});
	}
};

export const scanMarkdownWorkFiles = async (
	workRoot: string,
	projectRoot?: string,
	homeDir?: string,
): Promise<readonly MarkdownWorkFile[]> => {
	let rootStat: Awaited<ReturnType<typeof lstat>>;
	try {
		rootStat = await lstat(workRoot);
	} catch {
		return [];
	}

	if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
		return [];
	}

	const displayPrefix = projectRoot
		? computeDisplayPrefix(workRoot, projectRoot, homeDir)
		: ".rp1/work";

	const files: MarkdownWorkFile[] = [];
	await collectMarkdownFiles(workRoot, workRoot, files, displayPrefix);
	return files.sort((left, right) =>
		left.relativePath.localeCompare(right.relativePath),
	);
};

const hashContent = (content: string): string =>
	createHash("sha256").update(content).digest("hex");

const parseHeading = (
	line: string,
): { readonly level: number; readonly title: string } | null => {
	const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
	if (!match) {
		return null;
	}

	return {
		level: match[1].length,
		title: match[2].trim(),
	};
};

export const chunkMarkdown = (
	content: string,
	maxCharacters: number = MAX_CHUNK_CHARACTERS,
): readonly WorkSearchChunkInput[] => {
	const lines = content.split(/\r?\n/);
	const chunks: WorkSearchChunkInput[] = [];
	const headingStack: string[] = [];
	let currentLines: string[] = [];
	let currentStartLine = 1;
	let currentHeading: string | undefined;
	let currentLength = 0;

	const flushChunk = (endLine: number): void => {
		if (currentLines.length === 0) {
			return;
		}

		chunks.push({
			chunkIndex: chunks.length,
			...(currentHeading ? { heading: currentHeading } : {}),
			content: currentLines.join("\n"),
			startLine: currentStartLine,
			endLine,
		});

		currentLines = [];
		currentLength = 0;
	};

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		const lineNumber = index + 1;
		const heading = parseHeading(line);

		if (heading) {
			flushChunk(lineNumber - 1);
			headingStack.length = heading.level - 1;
			headingStack[heading.level - 1] = heading.title;
			currentHeading = headingStack.filter(Boolean).join(" > ");
			currentStartLine = lineNumber;
			currentLines = [];
			currentLength = 0;
		} else if (
			currentLines.length > 0 &&
			currentLength + line.length + 1 > maxCharacters
		) {
			flushChunk(lineNumber - 1);
			currentStartLine = lineNumber;
		}

		currentLines.push(line);
		currentLength += line.length + (currentLines.length > 1 ? 1 : 0);
	}

	flushChunk(lines.length);

	if (chunks.length === 0) {
		return [
			{
				chunkIndex: 0,
				content,
				startLine: 1,
				endLine: 1,
			},
		];
	}

	return chunks;
};

const refreshFile = async (
	db: Database,
	project: WorkSearchProjectScope,
	file: MarkdownWorkFile,
	artifactLookup: ReturnType<typeof createCanonicalArtifactMetadataLookup>,
): Promise<"indexed" | "skipped"> => {
	const content = await readFile(file.absolutePath, "utf-8");
	const contentHash = hashContent(content);
	const metadata = extractWorkSearchMetadata({
		project,
		relativePath: file.relativePath,
		content,
		artifactLookup,
	});
	const documentInput: WorkSearchDocumentInput = {
		project,
		relativePath: file.relativePath,
		displayPath: file.displayPath,
		contentHash,
		sizeBytes: file.sizeBytes,
		mtimeMs: file.mtimeMs,
		metadata,
	};
	const existing = getWorkDocument(db, project.projectId, file.relativePath);

	if (existing?.contentHash === contentHash) {
		updateWorkDocumentMetadata(db, documentInput);
		return "skipped";
	}

	replaceWorkDocument(db, documentInput, chunkMarkdown(content));
	return "indexed";
};

const refreshProjectDocuments = async (
	db: Database,
	project: WorkSearchProjectScope,
	files: readonly MarkdownWorkFile[],
): Promise<WorkSearchRefreshSummary> => {
	upsertProjectScope(db, project);

	const artifactLookup = createCanonicalArtifactMetadataLookup();
	let indexedDocuments = 0;
	let skippedDocuments = 0;
	let failedDocuments = 0;

	try {
		for (const file of files) {
			try {
				const result = await refreshFile(db, project, file, artifactLookup);
				if (result === "indexed") {
					indexedDocuments += 1;
				} else {
					skippedDocuments += 1;
				}
			} catch {
				failedDocuments += 1;
			}
		}
	} finally {
		artifactLookup.close();
	}

	const deletedDocuments = deleteMissingWorkDocuments(
		db,
		project.projectId,
		files.map((file) => file.relativePath),
	);

	return {
		scannedDocuments: files.length,
		indexedDocuments,
		skippedDocuments,
		deletedDocuments,
		failedDocuments,
		indexedAt: new Date().toISOString(),
	};
};

export const refreshWorkSearchIndex = (
	options: WorkSearchRefreshOptions = {},
): TE.TaskEither<CLIError, WorkSearchRefreshOutput> =>
	pipe(
		resolveWorkSearchProjectScope(options.project),
		TE.chain((project) =>
			pipe(
				TE.tryCatch(
					() => scanMarkdownWorkFiles(project.workRoot, project.projectRoot),
					(error) =>
						runtimeError(
							`Failed to scan work-search markdown files: ${error instanceof Error ? error.message : String(error)}`,
							error,
						),
				),
				TE.chain((files) =>
					pipe(
						getWorkSearchDatabase(project.projectRoot, options.dbPath),
						TE.chain((db) =>
							TE.tryCatch(
								async () => ({
									project,
									refresh: await refreshProjectDocuments(db, project, files),
								}),
								(error) =>
									runtimeError(
										`Failed to refresh work-search index: ${error instanceof Error ? error.message : String(error)}`,
										error,
									),
							),
						),
					),
				),
			),
		),
	);
