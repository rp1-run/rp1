/**
 * Emit tool entry point.
 * Provides the unified event recording command for the rp1 event system.
 * Handles all 6 event types through a single executeEmit pipeline.
 */

import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import type { Status } from "../../../shared/events.js";
import { registerTool, type ToolOptions } from "../index.js";
import type { ToolResult } from "../models.js";
import { successResult } from "../output.js";
import {
	deriveOrderedSteps,
	loadStateMachine,
} from "../state-machine/index.js";
import {
	type ArtifactInput,
	deriveRunStatus,
	type EventInput,
	getEmitDatabase,
	getSkippableSteps,
	insertEvent,
	insertRun,
	upsertAnnotation,
	upsertArtifact,
} from "./database.js";
import { resolveDocId } from "./doc-id.js";
import type { EmitInput, EmitResult } from "./models.js";

const TOOL_NAME = "emit";

/**
 * Classify a file path to an artifact type based on extension.
 */
const classifyArtifactType = (filePath: string): string => {
	if (filePath.endsWith(".md") || filePath.endsWith(".mdx")) return "markdown";
	if (filePath.endsWith(".mmd") || filePath.endsWith(".mermaid"))
		return "diagram";
	if (filePath.endsWith(".diff") || filePath.endsWith(".patch")) return "diff";
	if (
		filePath.endsWith(".ts") ||
		filePath.endsWith(".js") ||
		filePath.endsWith(".tsx") ||
		filePath.endsWith(".jsx")
	)
		return "code";
	return "other";
};

/**
 * Handle skipped-step detection for status_change events.
 * Loads the state machine for the run's flow, derives ordered steps,
 * and inserts skipped events for prior steps without records.
 */
const handleSkippedSteps = (
	input: EmitInput,
	flow: string,
	triggerTimestamp: string,
): TE.TaskEither<CLIError, readonly string[]> => {
	const currentStep = input.step;
	if (input.type !== "status_change" || !currentStep) {
		return TE.right([]);
	}

	return pipe(
		loadStateMachine(flow),
		TE.chain((machine) =>
			pipe(
				getEmitDatabase(),
				TE.map((db) => {
					const orderedSteps = deriveOrderedSteps(machine);
					const stepIds = orderedSteps.map((s) => s.id);
					const skippable = getSkippableSteps(
						db,
						input.runId,
						stepIds,
						currentStep,
					);

					const skippedTimestamp = new Date(
						new Date(triggerTimestamp).getTime() - 1,
					).toISOString();

					for (const step of skippable) {
						insertEvent(db, {
							runId: input.runId,
							type: "status_change",
							step,
							data: JSON.stringify({ status: "skipped" }),
							createdAt: skippedTimestamp,
						});
					}

					return skippable;
				}),
			),
		),
		TE.orElse((): TE.TaskEither<CLIError, readonly string[]> => TE.right([])),
	);
};

/**
 * Handle artifact registration: resolve doc_id and upsert artifact record.
 */
const handleArtifactRegistration = (
	input: EmitInput,
): TE.TaskEither<CLIError, string | undefined> => {
	if (input.type !== "artifact_registered") {
		return TE.right(undefined);
	}

	const filePath = input.data.path as string;
	const absolutePath = filePath.startsWith("/")
		? filePath
		: `${input.projectPath}/${filePath}`;

	return pipe(
		resolveDocId(absolutePath),
		TE.chain((docIdResult) =>
			pipe(
				getEmitDatabase(),
				TE.map((db) => {
					const artifactType =
						(input.data.type as string) ?? classifyArtifactType(filePath);
					const feature = input.data.feature as string;

					const artifactInput: ArtifactInput = {
						docId: docIdResult.docId,
						runId: input.runId,
						path: filePath,
						type: artifactType,
						projectPath: input.projectPath,
						feature,
						step: input.step,
					};

					upsertArtifact(db, artifactInput);
					return docIdResult.docId;
				}),
			),
		),
	);
};

/**
 * Handle annotation creation/update: upsert annotation and record event.
 */
const handleAnnotation = (input: EmitInput): TE.TaskEither<CLIError, void> => {
	if (input.type !== "annotation_updated") {
		return TE.right(undefined);
	}

	return pipe(
		getEmitDatabase(),
		TE.map((db) => {
			upsertAnnotation(db, {
				docId: input.data.docId as string,
				runId: input.runId,
				content: input.data.content as string,
				data: input.data.data ? JSON.stringify(input.data.data) : undefined,
				parentId: input.data.parentId as number | undefined,
			});
		}),
	);
};

/**
 * Notify the daemon of a status change for immediate WebSocket broadcast.
 * Best-effort: failures are silently swallowed.
 */
const notifyDaemon = async (
	input: EmitInput,
	_runStatus: Status,
): Promise<void> => {
	try {
		const { connectToDaemon, notifyStatusChange } = await import(
			"../../../web-ui/src/daemon/index.js"
		);

		const conn = await connectToDaemon();
		if (conn) {
			const featureId = (input.data.feature as string) ?? "unknown";

			if (input.type === "status_change" && input.step) {
				const stepStatus = input.data.status as string;
				await notifyStatusChange(
					conn,
					input.projectPath,
					featureId,
					stepStatus,
					{
						workflow: "",
						runId: input.runId,
						newState: input.step,
						stepStatus,
					},
				);
			} else if (input.type === "artifact_registered") {
				const { notifyArtifactChange } = await import(
					"../../../web-ui/src/daemon/index.js"
				);
				await notifyArtifactChange(conn, input.projectPath, featureId, {
					path: input.data.path as string,
					type: (input.data.type as string) ?? "other",
					step: input.step ?? null,
					runId: input.runId,
				});
			}
		}
	} catch {
		// Daemon not available - polling will pick up the change
	}
};

/**
 * Main emit execution pipeline.
 * Handles all 6 event types through a unified flow:
 * 1. Ensure run exists (auto-create if needed)
 * 2. Handle type-specific pre-processing (skipped steps, artifacts, annotations)
 * 3. Insert event
 * 4. Derive and cache run status
 * 5. Notify daemon (best-effort)
 * 6. Return structured result
 */
export const executeEmit = (
	input: EmitInput,
): TE.TaskEither<CLIError, ToolResult<EmitResult>> =>
	pipe(
		getEmitDatabase(),
		TE.chain((db) => {
			const run = insertRun(db, {
				id: input.runId,
				flow: (input.data.workflow as string) ?? "unknown",
				featureId: (input.data.feature as string) ?? "unknown",
				projectPath: input.projectPath,
			});

			const now = new Date().toISOString();

			return pipe(
				TE.Do,
				TE.bind("skippedSteps", () => handleSkippedSteps(input, run.flow, now)),
				TE.bind("docId", () => handleArtifactRegistration(input)),
				TE.chainFirst(() => handleAnnotation(input)),
				TE.chain(({ skippedSteps, docId }) => {
					const eventData = { ...input.data };
					if (docId) {
						eventData.docId = docId;
					}

					const parentStepId =
						input.type === "subflow_registered"
							? (input.data.parentStepId as string)
							: undefined;

					return pipe(
						getEmitDatabase(),
						TE.map((db) => {
							const eventInput: EventInput = {
								runId: input.runId,
								type: input.type,
								step: input.step,
								unit: input.unit,
								data: JSON.stringify(eventData),
								parentStepId,
							};

							const event = insertEvent(db, eventInput);
							const runStatus = deriveRunStatus(db, input.runId);

							return { event, runStatus, skippedSteps, docId };
						}),
					);
				}),
				TE.chainFirst(({ runStatus }) =>
					TE.fromTask(async () => {
						await notifyDaemon(input, runStatus);
					}),
				),
				TE.map(
					({
						event,
						runStatus,
						skippedSteps,
						docId,
					}): ToolResult<EmitResult> => {
						const result: EmitResult = {
							eventId: event.id,
							runId: input.runId,
							type: input.type,
							...(docId !== undefined ? { docId } : {}),
							...(skippedSteps.length > 0 ? { skippedSteps } : {}),
							runStatus,
						};

						return successResult(TOOL_NAME, result);
					},
				),
			);
		}),
	);

/**
 * Main execute function for tool registration.
 * The emit tool uses subcommands via CLI, so this placeholder
 * directs callers to use the emit subcommand.
 */
const execute = (
	_input: string,
	_options: ToolOptions,
): TE.TaskEither<CLIError, ToolResult<{ message: string }>> =>
	TE.right(
		successResult(TOOL_NAME, {
			message:
				"Use: rp1 agent-tools emit --type <type> --run-id <id> [--step <step>] [--data '<json>']",
		}),
	);

registerTool({
	name: TOOL_NAME,
	description: "Record events for the rp1 workflow event system",
	execute,
});

export { TOOL_NAME };
