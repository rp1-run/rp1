/**
 * Feedback accept-edit operation.
 * Acknowledges a user's direct file edit by clearing the artifact baseline.
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
	clearArtifactBaseline,
	getArtifactBaseline,
	getEmitDatabase,
} from "../emit/database.js";
import type { ToolResult } from "../models.js";
import { successResult } from "../output.js";
import type {
	FeedbackAcceptEditOptions,
	FeedbackAcceptEditResult,
} from "./models.js";

const TOOL_NAME = "feedback";

/**
 * Execute feedback accept-edit operation.
 * Verifies the artifact exists and has a non-null baseline (pending edit),
 * then clears the baseline to signal acceptance.
 */
export const executeFeedbackAcceptEdit = (
	options: FeedbackAcceptEditOptions,
	dbPath?: string,
): TE.TaskEither<CLIError, ToolResult<FeedbackAcceptEditResult>> =>
	pipe(
		getEmitDatabase(dbPath),
		TE.chain((db) => {
			const baselineInfo = getArtifactBaseline(db, options.docId);
			if (!baselineInfo) {
				return TE.left(
					notFoundError(`Artifact with doc_id '${options.docId}' not found`),
				);
			}

			if (baselineInfo.baseline === null) {
				return TE.left(
					usageError(
						`Artifact '${options.docId}' has no pending edit (baseline is already cleared)`,
					),
				);
			}

			return TE.tryCatch(
				async () => {
					clearArtifactBaseline(db, options.docId);

					const result: FeedbackAcceptEditResult = {
						accepted: true,
						docId: options.docId,
					};

					return successResult(TOOL_NAME, result);
				},
				(error) =>
					runtimeError(
						`Failed to accept edit: ${error instanceof Error ? error.message : String(error)}`,
					),
			);
		}),
	);
