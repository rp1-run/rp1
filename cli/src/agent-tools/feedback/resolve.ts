/**
 * Feedback resolve operation.
 * Marks an annotation as resolved, optionally inserting an agent-attributed reply.
 */

import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import {
	notFoundError,
	runtimeError,
	usageError,
} from "../../../shared/errors.js";
import {
	getAnnotationById,
	getEmitDatabase,
	updateAnnotation,
	upsertAnnotation,
} from "../emit/database.js";
import type { ToolResult } from "../models.js";
import { successResult } from "../output.js";
import type {
	FeedbackResolveOptions,
	FeedbackResolveResult,
} from "./models.js";
import { notifyDaemon } from "./notify.js";

/** Tool name for output */
const TOOL_NAME = "feedback";

/**
 * Execute feedback resolve operation.
 * Verifies the annotation exists and is a root annotation, optionally inserts
 * an agent-attributed reply, then updates the annotation status to resolved.
 */
export const executeFeedbackResolve = (
	options: FeedbackResolveOptions,
	dbPath?: string,
): TE.TaskEither<CLIError, ToolResult<FeedbackResolveResult>> =>
	pipe(
		getEmitDatabase(dbPath),
		TE.chain((db) => {
			const annotation = getAnnotationById(db, options.annotationId);
			if (!annotation) {
				return TE.left(
					notFoundError(`Annotation ${options.annotationId} not found`),
				);
			}

			if (annotation.parentId !== null) {
				return TE.left(
					usageError(
						`Annotation ${options.annotationId} is a reply, not a root annotation. Only root annotations can be resolved.`,
					),
				);
			}

			return TE.tryCatch(
				async () => {
					let replyId: number | undefined;
					if (options.reply) {
						const reply = upsertAnnotation(db, {
							docId: annotation.docId,
							runId: annotation.runId ?? undefined,
							content: options.reply,
							parentId: annotation.id,
							status: "open",
							author: "agent",
						});
						replyId = reply.id;
					}

					updateAnnotation(db, options.annotationId, {
						status: "resolved",
					});

					await notifyDaemon("annotation_updated", {
						annotationId: options.annotationId,
						action: "resolved",
					});

					const result: FeedbackResolveResult = {
						resolved: true,
						annotationId: options.annotationId,
						...(replyId !== undefined ? { replyId } : {}),
					};

					return successResult(TOOL_NAME, result);
				},
				(error) =>
					runtimeError(
						`Failed to resolve annotation: ${error instanceof Error ? error.message : String(error)}`,
					),
			);
		}),
	);
