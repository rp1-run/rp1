import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { parseError, usageError } from "../../../shared/errors.js";
import type { Status } from "../../../shared/events.js";
import {
	getArtifactsForRun,
	getEffectiveStepStatuses,
	getEmitDatabase,
	getRecentEventsForRun,
	getRunById,
} from "../emit/database.js";
import { registerTool, type ToolOptions } from "../index.js";
import type { ToolResult } from "../models.js";
import { successResult } from "../output.js";
import type {
	WorkflowStateContractGap,
	WorkflowStateInput,
	WorkflowStatePhase,
	WorkflowStateResult,
} from "./models.js";

const TOOL_NAME = "workflow-state";
const DEFAULT_RECENT_EVENT_LIMIT = 25;
const MAX_RECENT_EVENT_LIMIT = 100;
const COMPLETE_STATUSES = new Set<Status>(["completed", "skipped"]);

const REQUIRED_ARTIFACTS_BY_PHASE: Record<
	string,
	(feature: string) => readonly string[]
> = {
	requirements: (feature: string) => [`features/${feature}/requirements.md`],
	planning: (feature: string) => [
		`features/${feature}/design.md`,
		`features/${feature}/tasks.md`,
		`features/${feature}/tasks.json`,
	],
	implementation: (feature: string) => [
		`features/${feature}/build-readiness.md`,
	],
	release: () => [],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const optionalString = (value: unknown): string | undefined =>
	typeof value === "string" && value.trim() ? value.trim() : undefined;

const parseParentPhases = (
	value: unknown,
): E.Either<CLIError, readonly string[]> => {
	if (!Array.isArray(value)) {
		return E.left(
			usageError(
				'Missing "parent_phases"',
				'Provide "parent_phases" as a non-empty string array.',
			),
		);
	}

	const phases = value
		.filter((phase): phase is string => typeof phase === "string")
		.map((phase) => phase.trim())
		.filter(Boolean);

	if (phases.length === 0 || phases.length !== value.length) {
		return E.left(
			usageError(
				'Invalid "parent_phases"',
				'Provide "parent_phases" as a non-empty string array.',
			),
		);
	}

	return E.right(phases);
};

const parseRecentEventLimit = (value: unknown): number => {
	if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
		return DEFAULT_RECENT_EVENT_LIMIT;
	}
	return Math.min(value, MAX_RECENT_EVENT_LIMIT);
};

const parseInput = (input: string): E.Either<CLIError, WorkflowStateInput> => {
	if (!input.trim()) {
		return E.left(
			usageError(
				"Empty input",
				'Provide JSON with "run_id", "workflow", "feature", and "parent_phases".',
			),
		);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(input);
	} catch {
		return E.left(parseError("stdin", "Invalid JSON input"));
	}

	if (!isRecord(parsed)) {
		return E.left(
			usageError(
				"Input must be a JSON object",
				'Provide JSON with "run_id", "workflow", "feature", and "parent_phases".',
			),
		);
	}

	const runId = optionalString(parsed.run_id);
	const workflow = optionalString(parsed.workflow);
	const feature = optionalString(parsed.feature);

	if (!runId) {
		return E.left(usageError('Missing "run_id"', 'Provide "run_id".'));
	}
	if (!workflow) {
		return E.left(usageError('Missing "workflow"', 'Provide "workflow".'));
	}
	if (!feature) {
		return E.left(usageError('Missing "feature"', 'Provide "feature".'));
	}

	return pipe(
		parseParentPhases(parsed.parent_phases),
		E.map((parentPhases) => ({
			runId,
			workflow,
			feature,
			parentPhases,
			recentEventLimit: parseRecentEventLimit(parsed.recent_event_limit),
		})),
	);
};

const artifactKey = (storageRoot: string, path: string): string =>
	`${storageRoot}:${path}`;

const requiredArtifactPathsForPhase = (
	phase: string,
	feature: string,
): readonly string[] => REQUIRED_ARTIFACTS_BY_PHASE[phase]?.(feature) ?? [];

const buildPhases = (
	parentPhases: readonly string[],
	steps: readonly { readonly step: string; readonly status: Status }[],
): readonly WorkflowStatePhase[] => {
	const statusByStep = new Map(steps.map((step) => [step.step, step.status]));
	return parentPhases.map((phase) => ({
		phase,
		status: statusByStep.get(phase) ?? "not_started",
	}));
};

const buildContractGaps = (
	phases: readonly WorkflowStatePhase[],
	artifacts: readonly { readonly storageRoot: string; readonly path: string }[],
	feature: string,
): readonly WorkflowStateContractGap[] => {
	const artifactKeys = new Set(
		artifacts.map((artifact) =>
			artifactKey(artifact.storageRoot, artifact.path),
		),
	);

	return phases.flatMap((phase) => {
		if (!COMPLETE_STATUSES.has(phase.status)) {
			return [];
		}

		const missingArtifacts = requiredArtifactPathsForPhase(
			phase.phase,
			feature,
		).filter((path) => !artifactKeys.has(artifactKey("work_dir", path)));

		if (missingArtifacts.length === 0) {
			return [];
		}

		return [
			{
				phase: phase.phase,
				missing_artifacts: missingArtifacts,
				message: `Completed phase "${phase.phase}" is missing registered artifact output.`,
			},
		];
	});
};

const deriveNextPhase = (
	phases: readonly WorkflowStatePhase[],
	contractGaps: readonly WorkflowStateContractGap[],
): string | null => {
	const firstGap = contractGaps[0];
	if (firstGap) {
		return firstGap.phase;
	}

	return (
		phases.find((phase) => !COMPLETE_STATUSES.has(phase.status))?.phase ?? null
	);
};

const assertRunMatches = (
	input: WorkflowStateInput,
	run: { readonly flow: string; readonly featureId: string },
): E.Either<CLIError, void> => {
	if (run.flow !== input.workflow) {
		return E.left(
			usageError(
				"Workflow mismatch",
				`Run "${input.runId}" belongs to workflow "${run.flow}", not "${input.workflow}".`,
			),
		);
	}

	if (run.featureId !== input.feature) {
		return E.left(
			usageError(
				"Feature mismatch",
				`Run "${input.runId}" belongs to feature "${run.featureId}", not "${input.feature}".`,
			),
		);
	}

	return E.right(undefined);
};

export const execute = (
	input: string,
	_options: ToolOptions,
): TE.TaskEither<CLIError, ToolResult<WorkflowStateResult>> =>
	pipe(
		TE.fromEither(parseInput(input)),
		TE.bindTo("parsed"),
		TE.bind("db", () => getEmitDatabase()),
		TE.bind("run", ({ db, parsed }) =>
			TE.fromEither(
				E.fromNullable(
					usageError(
						"Run not found",
						`No run exists with id "${parsed.runId}".`,
					),
				)(getRunById(db, parsed.runId)),
			),
		),
		TE.chainFirst(({ parsed, run }) =>
			TE.fromEither(assertRunMatches(parsed, run)),
		),
		TE.map(({ db, parsed, run }) => {
			const steps = getEffectiveStepStatuses(db, parsed.runId);
			const artifacts = getArtifactsForRun(db, parsed.runId);
			const recentEvents = getRecentEventsForRun(
				db,
				parsed.runId,
				parsed.recentEventLimit,
			);
			const phases = buildPhases(parsed.parentPhases, steps);
			const contractGaps = buildContractGaps(phases, artifacts, parsed.feature);

			return successResult(TOOL_NAME, {
				run,
				steps,
				artifacts,
				recent_events: recentEvents,
				phases,
				summary: {
					next_phase: deriveNextPhase(phases, contractGaps),
					contract_gaps: contractGaps,
				},
			});
		}),
	);

registerTool({
	name: TOOL_NAME,
	description:
		"Read workflow run state, registered artifacts, and next parent phase from the emit database",
	execute,
});

export { TOOL_NAME };
