/**
 * Emit tool entry point.
 * Provides the unified event recording command for the rp1 event system.
 * Handles all 6 event types through a single executeEmit pipeline.
 */

import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import { resolveDirectorySet } from "../../../shared/directory-resolution.js";
import type { CLIError } from "../../../shared/errors.js";
import { runtimeError } from "../../../shared/errors.js";
import type { RunRecord, Status } from "../../../shared/events.js";
import { registerTool, type ToolOptions } from "../index.js";
import type { ToolResult } from "../models.js";
import { successResult } from "../output.js";
import {
	deriveOrderedSteps,
	getTransitivePredecessors,
	loadStateMachine,
} from "../state-machine/index.js";
import {
	type ArtifactInput,
	deriveRunStatus,
	type EventInput,
	getEmitDatabase,
	getSkippableSteps,
	getStepStatuses,
	insertEvent,
	insertRun,
	normalizeArtifactStorage,
	upsertAnnotation,
	upsertArtifact,
} from "./database.js";
import { type DocIdResult, generateDocId, resolveDocId } from "./doc-id.js";
import type { EmitInput, EmitResult } from "./models.js";
import {
	isNamespacedStep,
	validateStepAgainstStateMachine,
} from "./step-validation.js";

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

/** Result from skipped-step and predecessor completion passes */
interface SkippedAndPredecessorResult {
	readonly skippedSteps: readonly string[];
	readonly completedPredecessors: readonly string[];
}

/**
 * Check for flow mismatch between the stored run and the provided workflow.
 * Rejects when the run has flow "unknown" and --workflow provides a different value.
 */
const checkFlowMismatch = (
	run: RunRecord,
	input: EmitInput,
): TE.TaskEither<CLIError, void> => {
	if (
		run.flow === "unknown" &&
		input.workflow !== undefined &&
		input.workflow !== "unknown"
	) {
		return TE.left(
			runtimeError(
				`run "${run.id}" has flow "unknown" but --workflow "${input.workflow}" was provided. Either correct the run's flow or create a new run with the correct workflow.`,
			),
		);
	}

	return TE.right(undefined);
};

/**
 * Handle skipped-step detection and predecessor auto-completion for status_change events.
 * Loads the state machine for the run's flow, derives ordered steps,
 * inserts skipped events for prior steps without records, then auto-completes
 * transitive predecessor steps that are still in "running" or "waiting" status.
 *
 * State machine load failures propagate as errors for known workflows.
 * "unknown" workflows fall back to empty (no state machine expected).
 */
const handleSkippedSteps = (
	input: EmitInput,
	flow: string,
	triggerTimestamp: string,
): TE.TaskEither<CLIError, SkippedAndPredecessorResult> => {
	const currentStep = input.step;
	if (input.type !== "status_change" || !currentStep) {
		return TE.right({ skippedSteps: [], completedPredecessors: [] });
	}

	const smPipeline = pipe(
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

					const completedPredecessors: string[] = [];

					const status = (input.data.status as string) ?? "";
					const isStepLevel = !input.unit;
					const isRunning = status === "running";
					const isNamespaced = isNamespacedStep(currentStep);

					if (isStepLevel && isRunning && !isNamespaced) {
						const predecessors = getTransitivePredecessors(
							machine,
							currentStep,
						).filter((p) => p !== currentStep);
						const stepStatuses = getStepStatuses(db, input.runId);
						const statusMap = new Map(
							stepStatuses.map((s) => [s.step, s.status]),
						);

						const predecessorTimestamp = new Date(
							new Date(triggerTimestamp).getTime() - 1,
						).toISOString();

						for (const pred of predecessors) {
							const predStatus = statusMap.get(pred);
							if (predStatus === "running" || predStatus === "waiting") {
								insertEvent(db, {
									runId: input.runId,
									type: "status_change",
									step: pred,
									data: JSON.stringify({
										status: "completed",
									}),
									createdAt: predecessorTimestamp,
								});
								completedPredecessors.push(pred);
							}
						}
					}

					return {
						skippedSteps: skippable,
						completedPredecessors,
					} as SkippedAndPredecessorResult;
				}),
			),
		),
	);

	if (flow === "unknown") {
		return pipe(
			smPipeline,
			TE.orElse(
				(): TE.TaskEither<CLIError, SkippedAndPredecessorResult> =>
					TE.right({ skippedSteps: [], completedPredecessors: [] }),
			),
		);
	}

	return smPipeline;
};

/**
 * Handle artifact registration: resolve doc_id and upsert artifact record.
 * Falls back to a generated doc_id if the file cannot be read (e.g., not yet
 * written to disk) so the event pipeline is never blocked by missing files.
 */
const handleArtifactRegistration = (
	input: EmitInput,
	run: Pick<RunRecord, "rp1ProjectRoot" | "rp1WorkDir">,
): TE.TaskEither<CLIError, string | undefined> => {
	if (input.type !== "artifact_registered") {
		return TE.right(undefined);
	}

	const filePath = input.data.path as string;
	const absolutePath = filePath.startsWith("/")
		? filePath
		: `${input.projectPath}/${filePath}`;

	const docIdTask = pipe(
		resolveDocId(absolutePath),
		TE.orElse(() =>
			TE.right({ docId: generateDocId(), isNew: true } as DocIdResult),
		),
	);

	return pipe(
		docIdTask,
		TE.chain((docIdResult) =>
			pipe(
				getEmitDatabase(),
				TE.map((db) => {
					const artifactType =
						(input.data.type as string) ?? classifyArtifactType(filePath);
					const feature = input.data.feature as string;
					const normalizedStorage = normalizeArtifactStorage(
						filePath,
						run,
						input.data.storageRoot as
							| "absolute"
							| "project"
							| "work_dir"
							| undefined,
					);

					const artifactInput: ArtifactInput = {
						docId: docIdResult.docId,
						runId: input.runId,
						path: normalizedStorage.path,
						type: artifactType,
						storageRoot: normalizedStorage.storageRoot,
						projectPath: input.projectPath,
						feature,
						step: input.step,
						subflow: input.data.subflow === true,
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
 * Notify the daemon of an event for immediate WebSocket broadcast.
 * Uses the new typed event envelope format for all 6 event types.
 * Best-effort: failures are silently swallowed.
 */
const notifyDaemon = async (
	input: EmitInput,
	_runStatus: Status,
	eventId: number,
): Promise<void> => {
	try {
		const { connectToDaemon, notifyEvent } = await import(
			"../../../web-ui/src/daemon/index.js"
		);

		const conn = await connectToDaemon();
		if (conn) {
			const featureId = (input.data.feature as string) ?? "unknown";
			let data: Record<string, unknown> | null = null;
			try {
				data = { ...input.data };
			} catch {
				data = null;
			}

			await notifyEvent(conn, {
				eventType: input.type,
				eventId,
				runId: input.runId,
				projectPath: input.projectPath,
				featureId,
				step: input.step ?? null,
				data,
				createdAt: new Date().toISOString(),
			});
		}
	} catch {
		// Daemon not available - polling will pick up the change
	}
};

/**
 * Main emit execution pipeline.
 * Handles all 6 event types through a unified flow:
 * 1. Ensure run exists (auto-create if needed)
 * 2. Flow-mismatch check
 * 3. Step validation against state machine
 * 4. Handle type-specific pre-processing (skipped steps + predecessor completion, artifacts, annotations)
 * 5. Insert event
 * 6. Derive and cache run status
 * 7. Notify daemon (best-effort)
 * 8. Return structured result
 */
export const executeEmit = (
	input: EmitInput,
): TE.TaskEither<CLIError, ToolResult<EmitResult>> =>
	pipe(
		getEmitDatabase(),
		TE.chain((db) => {
			const directories = resolveDirectorySet(input.projectPath);
			if (directories._tag === "Left") {
				return TE.left(directories.left);
			}

			const run = insertRun(db, {
				id: input.runId,
				flow: (input.data.workflow as string) ?? "unknown",
				featureId: (input.data.feature as string) ?? "unknown",
				projectPath: input.projectPath,
				rp1ProjectRoot: directories.right.projectRoot,
				rp1KbDir: directories.right.kbDir,
				rp1WorkDir: directories.right.workDir,
				name: input.name,
				harness:
					input.harness ??
					(input.data.harness as string) ??
					process.env.RP1_HARNESS ??
					undefined,
			});

			const now = new Date().toISOString();

			return pipe(
				checkFlowMismatch(run, input),
				TE.chain(() => validateStepAgainstStateMachine(input, run)),
				TE.chain(() =>
					pipe(
						TE.Do,
						TE.bind("skippedResult", () =>
							handleSkippedSteps(input, run.flow, now),
						),
						TE.bind("docId", () => handleArtifactRegistration(input, run)),
						TE.chainFirst(() => handleAnnotation(input)),
						TE.chain(({ skippedResult, docId }) => {
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
									const runStatus = deriveRunStatus(
										db,
										input.runId,
										input.closeRun,
									);

									return {
										event,
										runStatus,
										skippedResult,
										docId,
									};
								}),
							);
						}),
						TE.chainFirst(({ event, runStatus }) =>
							TE.fromTask(async () => {
								await notifyDaemon(input, runStatus, event.id);
							}),
						),
						TE.map(
							({
								event,
								runStatus,
								skippedResult,
								docId,
							}): ToolResult<EmitResult> => {
								const result: EmitResult = {
									eventId: event.id,
									runId: input.runId,
									type: input.type,
									...(docId !== undefined ? { docId } : {}),
									...(skippedResult.skippedSteps.length > 0
										? { skippedSteps: skippedResult.skippedSteps }
										: {}),
									...(skippedResult.completedPredecessors.length > 0
										? {
												completedPredecessors:
													skippedResult.completedPredecessors,
											}
										: {}),
									runStatus,
								};

								return successResult(TOOL_NAME, result);
							},
						),
					),
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
