import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { runtimeError } from "../../../shared/errors.js";
import type { ChangeManifest } from "./models.js";

export interface ManifestExtractionScope {
	readonly manifestPath: string;
	readonly codeRoot: string;
	readonly files: readonly string[];
	readonly ownedLines: ReadonlyMap<string, ReadonlySet<number>>;
	readonly ownedLineCount: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isPositiveInteger = (value: unknown): value is number =>
	Number.isInteger(value) && Number(value) > 0;

const asStringArray = (value: unknown): readonly string[] | undefined =>
	Array.isArray(value) && value.every((item) => typeof item === "string")
		? value
		: undefined;

const resolveInsideRoot = (
	codeRoot: string,
	filePath: string,
): string | undefined => {
	const resolved = path.isAbsolute(filePath)
		? path.resolve(filePath)
		: path.resolve(codeRoot, filePath);
	const relative = path.relative(codeRoot, resolved);
	if (
		relative === "" ||
		(!relative.startsWith("..") && !path.isAbsolute(relative))
	) {
		return resolved;
	}
	return undefined;
};

const parseManifest = (content: string): ChangeManifest => {
	const parsed = JSON.parse(content) as unknown;
	if (
		!isRecord(parsed) ||
		parsed.version !== 1 ||
		!Array.isArray(parsed.files)
	) {
		throw new Error(
			'Manifest must be an object with version: 1 and a "files" array',
		);
	}
	return parsed as unknown as ChangeManifest;
};

const collectOwnedLines = (file: unknown, index: number): Set<number> => {
	if (!isRecord(file)) {
		throw new Error(`Manifest file entry ${index + 1} must be an object`);
	}

	const lines = new Set<number>();
	const ownedLines = file.ownedLines;
	if (ownedLines !== undefined) {
		if (!Array.isArray(ownedLines) || !ownedLines.every(isPositiveInteger)) {
			throw new Error(
				`Manifest file entry ${index + 1} has invalid ownedLines`,
			);
		}
		for (const line of ownedLines) {
			lines.add(line);
		}
	}

	const ownedHunks = file.ownedHunks;
	if (ownedHunks !== undefined) {
		if (!Array.isArray(ownedHunks)) {
			throw new Error(
				`Manifest file entry ${index + 1} has invalid ownedHunks`,
			);
		}
		for (const hunk of ownedHunks) {
			if (
				!isRecord(hunk) ||
				!isPositiveInteger(hunk.startLine) ||
				!isPositiveInteger(hunk.endLine) ||
				hunk.endLine < hunk.startLine
			) {
				throw new Error(
					`Manifest file entry ${index + 1} has invalid hunk bounds`,
				);
			}
			for (let line = hunk.startLine; line <= hunk.endLine; line++) {
				lines.add(line);
			}
		}
	}

	if (lines.size === 0) {
		throw new Error(
			`Manifest file entry ${index + 1} must include ownedLines or ownedHunks`,
		);
	}

	return lines;
};

export const loadChangeManifestScope = (
	manifestPath: string,
	optionsCodeRoot: string | undefined,
	cwd: string,
): TE.TaskEither<CLIError, ManifestExtractionScope> =>
	pipe(
		TE.tryCatch(
			async () => {
				const resolvedManifest = path.isAbsolute(manifestPath)
					? path.resolve(manifestPath)
					: path.resolve(cwd, manifestPath);
				const content = await readFile(resolvedManifest, "utf-8");
				const manifest = parseManifest(content);
				const codeRoot = path.resolve(
					optionsCodeRoot ?? manifest.codeRoot ?? cwd,
				);

				if (!manifest.files.length) {
					throw new Error("Manifest files array must not be empty");
				}

				const files: string[] = [];
				const ownedLines = new Map<string, ReadonlySet<number>>();
				let ownedLineCount = 0;

				manifest.files.forEach((file, index) => {
					if (!isRecord(file) || typeof file.path !== "string" || !file.path) {
						throw new Error(`Manifest file entry ${index + 1} is missing path`);
					}

					const operations =
						file.allowedOperations === undefined
							? undefined
							: asStringArray(file.allowedOperations);
					if (
						file.allowedOperations !== undefined &&
						operations === undefined
					) {
						throw new Error(
							`Manifest file entry ${index + 1} has invalid allowedOperations`,
						);
					}
					if (
						operations &&
						!operations.includes("remove_comments") &&
						!operations.includes("comment_cleanup")
					) {
						throw new Error(
							`Manifest file entry ${index + 1} does not allow comment cleanup`,
						);
					}

					const resolvedFile = resolveInsideRoot(codeRoot, file.path);
					if (!resolvedFile) {
						throw new Error(
							`Manifest file entry ${index + 1} resolves outside CODE_ROOT`,
						);
					}
					if (!existsSync(resolvedFile)) {
						return;
					}

					const lines = collectOwnedLines(file, index);
					files.push(resolvedFile);
					ownedLines.set(resolvedFile, lines);
					ownedLineCount += lines.size;
				});

				return {
					manifestPath: resolvedManifest,
					codeRoot,
					files,
					ownedLines,
					ownedLineCount,
				};
			},
			(error) =>
				runtimeError(
					`Invalid change manifest: ${error instanceof Error ? error.message : String(error)}`,
				),
		),
	);
