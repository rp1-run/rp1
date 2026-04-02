/**
 * Feedback read operation.
 * Retrieves annotations and pending file edits for a workflow run.
 */

import { readFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { createTwoFilesPatch } from "diff";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { runtimeError } from "../../../shared/errors.js";
import {
	getAnnotationsForRunFiltered,
	getArtifactBaseline,
	getArtifactsForRun,
	getEmitDatabase,
	getRunById,
	resolveArtifactPathForRun,
} from "../emit/database.js";
import type { ToolResult } from "../models.js";
import { successResult } from "../output.js";
import type {
	FeedbackAnnotation,
	FeedbackEdit,
	FeedbackReadOptions,
	FeedbackReadResult,
} from "./models.js";

const TOOL_NAME = "feedback";

/**
 * Classify an artifact path to a type category for summary grouping.
 */
const classifyArtifactType = (filePath: string): string => {
	const lower = filePath.toLowerCase();
	if (lower.includes("requirements")) return "requirements";
	if (lower.includes("design")) return "design";
	if (
		lower.endsWith(".ts") ||
		lower.endsWith(".tsx") ||
		lower.endsWith(".js") ||
		lower.endsWith(".jsx")
	)
		return "code";
	if (lower.endsWith(".md") || lower.endsWith(".mdx")) return "markdown";
	return "other";
};

const isWithinRoot = (candidatePath: string, rootPath: string): boolean => {
	const relativePath = relative(rootPath, candidatePath);
	return (
		relativePath === "" ||
		(!relativePath.startsWith("..") && !isAbsolute(relativePath))
	);
};

const toDisplayPath = (
	fullPath: string,
	run: { readonly rp1ProjectRoot: string; readonly rp1WorkRoot: string },
): string => {
	if (isWithinRoot(fullPath, run.rp1WorkRoot)) {
		const workRelative = relative(run.rp1WorkRoot, fullPath).replace(
			/\\/g,
			"/",
		);
		return workRelative.length > 0 ? `.rp1/work/${workRelative}` : ".rp1/work";
	}

	if (isWithinRoot(fullPath, run.rp1ProjectRoot)) {
		return relative(run.rp1ProjectRoot, fullPath).replace(/\\/g, "/");
	}

	return fullPath;
};

/**
 * Execute feedback read operation.
 * Queries annotations filtered by status and computes diffs for edited artifacts.
 */
export const executeFeedbackRead = (
	options: FeedbackReadOptions,
	dbPath?: string,
): TE.TaskEither<CLIError, ToolResult<FeedbackReadResult>> =>
	pipe(
		getEmitDatabase(dbPath),
		TE.chain((db) =>
			TE.tryCatch(
				async () => {
					const allAnnotations = getAnnotationsForRunFiltered(
						db,
						options.runId,
						options.status,
					);

					const rootAnnotations = allAnnotations.filter(
						(a) => a.parentId === null,
					);

					const childAnnotations = allAnnotations.filter(
						(a) => a.parentId !== null,
					);

					const feedbackAnnotations: FeedbackAnnotation[] = rootAnnotations.map(
						(root) => {
							const replies = childAnnotations
								.filter((c) => c.parentId === root.id)
								.map((c) => ({
									id: c.id,
									content: c.content,
									author: c.author,
									createdAt: c.createdAt,
								}));

							let artifactPath: string | null = null;
							let anchor: unknown = null;
							if (root.data) {
								try {
									const parsed = JSON.parse(root.data);
									artifactPath = parsed.artifactPath ?? null;
									anchor = parsed.anchor ?? null;
								} catch {
									// Ignore malformed JSON in data field
								}
							}

							return {
								id: root.id,
								docId: root.docId,
								artifactPath,
								content: root.content,
								anchor,
								status: root.status,
								author: root.author,
								replies,
								createdAt: root.createdAt,
							};
						},
					);

					const run = getRunById(db, options.runId);
					const artifacts = getArtifactsForRun(db, options.runId);

					const edits: FeedbackEdit[] = [];
					for (const artifact of artifacts) {
						const baselineInfo = getArtifactBaseline(db, artifact.docId);
						if (!baselineInfo || baselineInfo.baseline === null) {
							continue;
						}

						const fullPath =
							run == null
								? join(baselineInfo.projectPath, baselineInfo.path)
								: await resolveArtifactPathForRun(db, run, artifact);
						if (fullPath == null) {
							continue;
						}
						let currentContent: string;
						try {
							currentContent = readFileSync(fullPath, "utf-8");
						} catch {
							continue;
						}

						if (baselineInfo.baseline === currentContent) {
							continue;
						}

						const displayPath =
							run == null
								? relative(baselineInfo.projectPath, fullPath).replace(
										/\\/g,
										"/",
									)
								: toDisplayPath(fullPath, run);
						const patch = createTwoFilesPatch(
							`a/${displayPath}`,
							`b/${displayPath}`,
							baselineInfo.baseline,
							currentContent,
						);

						edits.push({
							docId: artifact.docId,
							artifactPath: displayPath,
							patch,
						});
					}

					const byArtifactType: Record<string, number> = {};
					for (const ann of feedbackAnnotations) {
						const type = ann.artifactPath
							? classifyArtifactType(ann.artifactPath)
							: "general";
						byArtifactType[type] = (byArtifactType[type] ?? 0) + 1;
					}
					for (const edit of edits) {
						const type = classifyArtifactType(edit.artifactPath);
						byArtifactType[type] = (byArtifactType[type] ?? 0) + 1;
					}

					const result: FeedbackReadResult = {
						runId: options.runId,
						annotations: feedbackAnnotations,
						edits,
						summary: {
							totalAnnotations: feedbackAnnotations.length,
							totalEdits: edits.length,
							byArtifactType,
						},
					};

					return successResult(TOOL_NAME, result);
				},
				(error) =>
					runtimeError(
						`Failed to read feedback: ${error instanceof Error ? error.message : String(error)}`,
					),
			),
		),
	);
