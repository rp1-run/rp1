/**
 * Emit tool entry point.
 * Provides the unified event recording command for the rp1 event system.
 * Handles all 6 event types through a single executeEmit pipeline.
 */

import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import { resolveDirectorySet } from "../../../shared/directory-resolution.js";
import type { CLIError } from "../../../shared/errors.js";
import { formatError, runtimeError } from "../../../shared/errors.js";
import type { RunRecord, Status } from "../../../shared/events.js";
import type {
	DaemonConnection,
	EventNotificationPayload,
	NotificationNotifyPayload,
} from "../../../web-ui/src/daemon/index.js";
import { registerTool, type ToolOptions } from "../index.js";
import type { ToolResult } from "../models.js";
import { successResult } from "../output.js";
import {
	deriveOrderedSteps,
	getTransitivePredecessors,
	loadStateMachine,
} from "../state-machine/index.js";
import type { NotificationRecord } from "./database.js";
import {
	type ArtifactInput,
	type ArtifactStorageRoot,
	deriveRunStatus,
	type EndRunOutcome,
	type EventInput,
	endRun,
	getEmitDatabase,
	getLatestArtifactByLocation,
	getRunById,
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
import { maybeGenerateNotification } from "./notification-generator.js";
import {
	isNamespacedStep,
	validateStepAgainstStateMachine,
} from "./step-validation.js";

const TOOL_NAME = "emit";

/** Maximum time (ms) the daemon notification side-effect may block the emit result. */
export const NOTIFY_DEADLINE_MS = 500;

interface EmitDaemonModule {
	readonly connectToDaemon: () => Promise<DaemonConnection | null>;
	readonly notifyEvent: (
		conn: DaemonConnection,
		payload: Omit<EventNotificationPayload, "type">,
	) => Promise<boolean>;
	readonly notifyNotification: (
		conn: DaemonConnection,
		notification: NotificationNotifyPayload["notification"],
	) => Promise<boolean>;
}

const loadDefaultDaemonModule = async (): Promise<EmitDaemonModule> => {
	const { connectToDaemon, notifyEvent, notifyNotification } = await import(
		"../../../web-ui/src/daemon/index.js"
	);

	return { connectToDaemon, notifyEvent, notifyNotification };
};

let loadDaemonModule = loadDefaultDaemonModule;

export const setEmitDaemonModuleLoaderForTesting = (
	loader?: () => Promise<EmitDaemonModule>,
): void => {
	loadDaemonModule = loader ?? loadDefaultDaemonModule;
};

const resolveRequestedWorkflow = (input: EmitInput): string => {
	if (typeof input.workflow === "string" && input.workflow.length > 0) {
		return input.workflow;
	}

	return typeof input.data.workflow === "string" &&
		input.data.workflow.length > 0
		? input.data.workflow
		: "unknown";
};

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

interface EndRunExecutionInput {
	readonly runId: string;
	readonly outcome: EndRunOutcome;
	readonly reason?: string;
}

interface ArtifactRegistrationResult {
	readonly docId: string;
	readonly data?: Record<string, unknown>;
}

const canonicalizeArtifactUrl = (value: string): string => {
	const url = new URL(value.trim());
	if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
		url.pathname = url.pathname.replace(/\/+$/, "");
	}
	return url.toString();
};

const deriveLinkDocId = (
	runId: string,
	relationship: string,
	canonicalUrl: string,
): string =>
	`link:${createHash("sha256")
		.update(`${runId}${relationship}${canonicalUrl}`)
		.digest("hex")}`;

const optionalString = (value: unknown): string | undefined =>
	typeof value === "string" ? value : undefined;

/**
 * Check for flow mismatch between the stored run and the provided workflow.
 * Rejects when the run has flow "unknown" and --workflow provides a different
 * value, except for first-class workflow state transitions that can safely
 * backfill the legacy unknown flow.
 */
const canBackfillLegacyUnknownFlow = (input: EmitInput): boolean =>
	input.type === "status_change" &&
	typeof input.step === "string" &&
	input.step.length > 0 &&
	!isNamespacedStep(input.step);

const checkFlowMismatch = (
	run: RunRecord,
	input: EmitInput,
): TE.TaskEither<CLIError, void> => {
	if (
		run.flow === "unknown" &&
		input.workflow !== undefined &&
		input.workflow !== "unknown" &&
		!canBackfillLegacyUnknownFlow(input)
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
					const isCompleted = status === "completed";
					const isNamespaced = isNamespacedStep(currentStep);

					if (isStepLevel && (isRunning || isCompleted) && !isNamespaced) {
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
	run: Pick<RunRecord, "rp1ProjectRoot" | "rp1WorkRoot" | "projectId">,
): TE.TaskEither<CLIError, ArtifactRegistrationResult | undefined> => {
	if (input.type !== "artifact_registered") {
		return TE.right(undefined);
	}

	if (input.data.locationKind === "url") {
		const canonicalUrl = canonicalizeArtifactUrl(input.data.url as string);
		const label = (input.data.label as string).trim();
		const relationship = (input.data.relationship as string).trim();
		const docId =
			optionalString(input.data.docId)?.trim() ||
			deriveLinkDocId(input.runId, relationship, canonicalUrl);
		const feature = (input.data.feature as string) ?? "unknown";
		const sourceContext = optionalString(input.data.sourceContext);
		const sourceArtifactPath = optionalString(input.data.sourceArtifactPath);
		const metadata =
			input.data.metadata !== undefined
				? JSON.stringify(input.data.metadata)
				: undefined;

		return pipe(
			getEmitDatabase(),
			TE.map((db) => {
				const artifactInput: ArtifactInput = {
					docId,
					runId: input.runId,
					locationKind: "url",
					path: canonicalUrl,
					type: "link",
					storageRoot: "work_dir",
					projectPath: input.projectPath,
					projectId: run.projectId ?? undefined,
					feature,
					step: input.step,
					subflow: input.data.subflow === true,
					url: canonicalUrl,
					label,
					relationship,
					sourceContext,
					sourceArtifactPath,
					metadata,
				};

				upsertArtifact(db, artifactInput);
				return {
					docId,
					data: {
						locationKind: "url",
						type: "link",
						url: canonicalUrl,
						path: canonicalUrl,
						label,
						relationship,
						...(sourceContext !== undefined ? { sourceContext } : {}),
						...(sourceArtifactPath !== undefined ? { sourceArtifactPath } : {}),
					},
				} satisfies ArtifactRegistrationResult;
			}),
		);
	}

	const filePath = input.data.path as string;
	const storageRoot = input.data.storageRoot as ArtifactStorageRoot;
	const absolutePath =
		storageRoot === "absolute" || isAbsolute(filePath)
			? resolve(filePath)
			: storageRoot === "project"
				? resolve(run.rp1ProjectRoot, filePath)
				: resolve(run.rp1WorkRoot, filePath);
	const normalizedStorage = normalizeArtifactStorage(
		filePath,
		run,
		storageRoot,
	);

	if (
		(storageRoot === "project" || storageRoot === "work_dir") &&
		normalizedStorage.storageRoot === "absolute"
	) {
		const canonicalRoot =
			storageRoot === "project" ? run.rp1ProjectRoot : run.rp1WorkRoot;
		return TE.left(
			runtimeError(
				`Artifact path "${filePath}" escapes the canonical ${storageRoot} root (${canonicalRoot}). Use storageRoot "absolute" for external artifacts.`,
			),
		);
	}

	return pipe(
		getEmitDatabase(),
		TE.chain((db) => {
			// Reuse the doc_id already registered at this location so repeated
			// registrations of the same file (frontmatter stripped by a rewrite,
			// or non-markdown files that cannot carry frontmatter) refresh the
			// existing artifact row instead of minting a duplicate per emit.
			const existing = getLatestArtifactByLocation(db, {
				projectPath: input.projectPath,
				path: normalizedStorage.path,
				storageRoot: normalizedStorage.storageRoot,
			});

			return pipe(
				resolveDocId(absolutePath, existing?.docId),
				TE.orElse(
					(): TE.TaskEither<CLIError, DocIdResult> =>
						TE.right({
							docId: existing?.docId ?? generateDocId(),
							isNew: existing == null,
						}),
				),
				TE.map((docIdResult) => {
					const artifactType =
						(input.data.type as string) ?? classifyArtifactType(filePath);
					const feature = (input.data.feature as string) ?? "unknown";

					const artifactInput: ArtifactInput = {
						docId: docIdResult.docId,
						runId: input.runId,
						path: normalizedStorage.path,
						type: artifactType,
						storageRoot: normalizedStorage.storageRoot,
						projectPath: input.projectPath,
						projectId: run.projectId ?? undefined,
						feature,
						step: input.step,
						subflow: input.data.subflow === true,
					};

					upsertArtifact(db, artifactInput);
					return { docId: docIdResult.docId };
				}),
			);
		}),
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
	run: Pick<RunRecord, "projectId" | "rp1ProjectRoot">,
	runStatus: Status,
	eventId: number,
	eventData?: Record<string, unknown>,
): Promise<void> => {
	try {
		const { connectToDaemon, notifyEvent } = await loadDaemonModule();

		const conn = await connectToDaemon();
		if (conn) {
			const featureId = (input.data.feature as string) ?? "unknown";
			let data: Record<string, unknown> | null = null;
			try {
				data = { ...(eventData ?? input.data) };
			} catch {
				data = null;
			}

			await notifyEvent(conn, {
				eventType: input.type,
				eventId,
				runId: input.runId,
				projectPath: input.projectPath,
				projectId: run.projectId ?? undefined,
				rp1ProjectRoot: run.rp1ProjectRoot,
				featureId,
				runStatus,
				step: input.step ?? null,
				unit: input.unit ?? null,
				data,
				createdAt: new Date().toISOString(),
			});
		}
	} catch {
		// Daemon not available - polling will pick up the change
	}
};

/**
 * Notify the daemon of a newly created notification for WebSocket broadcast.
 * Best-effort: failures are silently swallowed.
 */
const notifyDaemonNotification = async (
	notification: NotificationRecord,
): Promise<void> => {
	try {
		const { connectToDaemon, notifyNotification } = await loadDaemonModule();

		const conn = await connectToDaemon();
		if (conn) {
			await notifyNotification(conn, {
				id: notification.id,
				message: notification.message,
				sourceType: notification.sourceType,
				sourceId: notification.sourceId,
				route: notification.route,
				projectId: notification.projectId,
				createdAt: notification.createdAt,
			});
		}
	} catch {
		// Daemon not available - polling will pick up the change
	}
};

/**
 * Bound the full daemon notification chain (event + optional notification)
 * with a deadline so it never blocks the emit critical path.
 * Best-effort: when the deadline fires first, emit returns immediately
 * and the in-flight notification continues in the background.
 */
const notifyDaemonBounded = async (
	notifyFn: () => Promise<void>,
): Promise<void> => {
	if (process.env.RP1_EVAL_MODE === "true") return;
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const deadline = new Promise<void>((resolve) => {
			timer = setTimeout(resolve, NOTIFY_DEADLINE_MS);
		});
		await Promise.race([notifyFn(), deadline]);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
};

/**
 * Main emit execution pipeline.
 * Handles all 6 event types through a unified flow:
 * 1. Flow-mismatch check for any existing run
 * 2. Ensure run exists (auto-create if needed)
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
			const requestedWorkflow = resolveRequestedWorkflow(input);
			const existingRun = getRunById(db, input.runId);

			return pipe(
				existingRun
					? checkFlowMismatch(existingRun, input)
					: TE.right(undefined),
				TE.map(() =>
					insertRun(db, {
						id: input.runId,
						flow: requestedWorkflow,
						featureId: (input.data.feature as string) ?? "unknown",
						projectPath: input.projectPath,
						rp1ProjectRoot: directories.right.projectRoot,
						rp1KbRoot: directories.right.kbRoot,
						rp1WorkRoot: directories.right.workRoot,
						projectId: directories.right.projectId,
						name: input.name,
						harness:
							input.harness ??
							(input.data.harness as string) ??
							process.env.RP1_HARNESS ??
							undefined,
					}),
				),
				TE.chain((run) =>
					pipe(
						validateStepAgainstStateMachine(input, run),
						TE.chain(() => {
							const now = new Date().toISOString();
							return pipe(
								TE.Do,
								TE.bind("skippedResult", () =>
									handleSkippedSteps(input, run.flow, now),
								),
								TE.bind("artifactRegistration", () =>
									handleArtifactRegistration(input, run),
								),
								TE.chainFirst(() => handleAnnotation(input)),
								TE.chain(({ skippedResult, artifactRegistration }) => {
									const eventData = {
										...input.data,
										...(artifactRegistration?.data ?? {}),
									};
									if (artifactRegistration) {
										eventData.docId = artifactRegistration.docId;
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

											const notification = maybeGenerateNotification(
												db,
												input.runId,
												runStatus,
												input.type,
												run.projectId,
												run.flow !== "unknown"
													? run.flow
													: requestedWorkflow !== "unknown"
														? requestedWorkflow
														: null,
												input.step ?? null,
												input.data,
											);

											return {
												event,
												runStatus,
												skippedResult,
												docId: artifactRegistration?.docId,
												notification,
												eventData,
											};
										}),
									);
								}),
								TE.chainFirst(({ event, runStatus, notification, eventData }) =>
									TE.fromTask(() =>
										notifyDaemonBounded(async () => {
											await notifyDaemon(
												input,
												run,
												runStatus,
												event.id,
												eventData,
											);
											if (notification) {
												await notifyDaemonNotification(notification);
											}
										}),
									),
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
							);
						}),
					),
				),
			);
		}),
	);

export const executeEndRun = (
	input: EndRunExecutionInput,
): TE.TaskEither<CLIError, ToolResult<EmitResult>> =>
	pipe(
		getEmitDatabase(),
		TE.chain((db) =>
			pipe(
				TE.fromEither(
					endRun(db, {
						runId: input.runId,
						outcome: input.outcome,
						message: input.reason,
						actor: "user",
					}),
				),
				TE.map(({ event, run, runStatus }) => {
					const eventData: Record<string, unknown> = {
						status: input.outcome,
						actor: "user",
						source: "manual_end",
						feature: run.featureId,
					};
					if (input.reason) {
						eventData.message = input.reason;
					}

					const notification = maybeGenerateNotification(
						db,
						input.runId,
						runStatus,
						"status_change",
						run.projectId,
						run.flow !== "unknown" ? run.flow : null,
						null,
						eventData,
					);

					return {
						event,
						run,
						runStatus,
						notification,
						eventData,
					};
				}),
				TE.chainFirst(({ event, run, runStatus, notification, eventData }) =>
					TE.fromTask(() =>
						notifyDaemonBounded(async () => {
							await notifyDaemon(
								{
									type: "status_change",
									runId: input.runId,
									workflow: run.flow,
									data: eventData,
									projectPath: run.projectPath,
								},
								run,
								runStatus,
								event.id,
							);
							if (notification) {
								await notifyDaemonNotification(notification);
							}
						}),
					),
				),
				TE.map(
					({ event, runStatus }): ToolResult<EmitResult> =>
						successResult(TOOL_NAME, {
							eventId: event.id,
							runId: input.runId,
							type: "status_change",
							runStatus,
						}),
				),
			),
		),
	);

/** Per-event result in a batch envelope */
export interface BatchEventResult {
	readonly index: number;
	readonly type: string;
	readonly success: boolean;
	readonly eventId?: number;
	readonly runStatus?: string;
	readonly error?: string;
}

/** Batch emit envelope returned to the caller */
export interface BatchEmitEnvelope {
	readonly results: readonly BatchEventResult[];
	readonly succeeded: number;
	readonly failed: number;
	readonly total: number;
	readonly stoppedAtIndex?: number;
}

/**
 * Execute a batch of emit events in strict order.
 * Each event shares the same runId and workflow. Processing stops at
 * the first event that fails validation or execution. All prior
 * successful events are included in the response alongside the failure.
 */
export const executeBatchEmit = (
	input: import("./validate.js").BatchEmitInput,
): TE.TaskEither<CLIError, ToolResult<BatchEmitEnvelope>> => {
	const process = async (): Promise<ToolResult<BatchEmitEnvelope>> => {
		const results: BatchEventResult[] = [];
		let succeeded = 0;
		let stoppedAtIndex: number | undefined;

		for (let i = 0; i < input.events.length; i++) {
			const entry = input.events[i];
			const emitInput: EmitInput = {
				type: entry.type,
				runId: input.runId,
				workflow: input.workflow,
				step: entry.step,
				unit: entry.unit,
				data: { ...entry.data, workflow: input.workflow },
				projectPath: input.projectPath,
				name: entry.name,
				harness: input.harness,
			};

			const result = await executeEmit(emitInput)();

			if (E.isLeft(result)) {
				results.push({
					index: i,
					type: entry.type,
					success: false,
					error: formatError(result.left, false),
				});
				stoppedAtIndex = i;
				break;
			}

			const data = result.right.data as EmitResult;
			results.push({
				index: i,
				type: entry.type,
				success: true,
				eventId: data.eventId,
				runStatus: data.runStatus,
			});
			succeeded++;
		}

		const failed = stoppedAtIndex !== undefined ? 1 : 0;
		return successResult(TOOL_NAME, {
			results,
			succeeded,
			failed,
			total: input.events.length,
			...(stoppedAtIndex !== undefined ? { stoppedAtIndex } : {}),
		});
	};

	return TE.tryCatch(process, (error) =>
		runtimeError(`Batch emit failed: ${String(error)}`),
	);
};

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
