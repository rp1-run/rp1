/**
 * Feedback reply operation.
 * Adds an agent-attributed reply to an existing annotation thread.
 */

import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { notFoundError, runtimeError } from "../../../shared/errors.js";
import {
	getAnnotationById,
	getEmitDatabase,
	upsertAnnotation,
} from "../emit/database.js";
import type { ToolResult } from "../models.js";
import { successResult } from "../output.js";
import type { FeedbackReplyOptions, FeedbackReplyResult } from "./models.js";
import { notifyDaemon } from "./notify.js";

/** Tool name for output */
const TOOL_NAME = "feedback";

/**
 * Execute feedback reply operation.
 * Verifies the parent annotation exists, then inserts a child annotation
 * with author "agent".
 */
export const executeFeedbackReply = (
	options: FeedbackReplyOptions,
	dbPath?: string,
): TE.TaskEither<CLIError, ToolResult<FeedbackReplyResult>> =>
	pipe(
		getEmitDatabase(dbPath),
		TE.chain((db) => {
			const parent = getAnnotationById(db, options.annotationId);
			if (!parent) {
				return TE.left(
					notFoundError(`Annotation ${options.annotationId} not found`),
				);
			}

			return TE.tryCatch(
				async () => {
					const reply = upsertAnnotation(db, {
						docId: parent.docId,
						runId: parent.runId ?? undefined,
						content: options.content,
						parentId: parent.id,
						status: "open",
						author: "agent",
					});

					await notifyDaemon("annotation_updated", {
						annotationId: parent.id,
						replyId: reply.id,
						action: "reply",
					});

					const result: FeedbackReplyResult = {
						replyId: reply.id,
						annotationId: options.annotationId,
					};

					return successResult(TOOL_NAME, result);
				},
				(error) =>
					runtimeError(
						`Failed to reply to annotation: ${error instanceof Error ? error.message : String(error)}`,
					),
			);
		}),
	);
