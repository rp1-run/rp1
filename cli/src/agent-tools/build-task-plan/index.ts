import { readFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import {
	notFoundError,
	parseError,
	runtimeError,
	usageError,
} from "../../../shared/errors.js";
import { registerTool, type ToolOptions } from "../index.js";
import type { ToolError, ToolResult } from "../models.js";
import { errorResult, successResult } from "../output.js";
import {
	type BuildTaskComplexity,
	type BuildTaskPlanDocument,
	type BuildTaskPlanInput,
	type BuildTaskPlanResult,
	type BuildTaskPlanTask,
	type BuildTaskStatus,
	type BuildTaskType,
	type BuildTaskUnit,
	type ScheduleWaveInput,
	type ScheduleWaveResult,
	TASK_PLAN_SCHEMA_VERSION,
	VALID_BUILD_TASK_COMPLEXITIES,
	VALID_BUILD_TASK_STATUSES,
	VALID_BUILD_TASK_TYPES,
	type WaveDispatch,
} from "./models.js";

const TOOL_NAME = "build-task-plan";
const DEFAULT_MAX_SIMPLE_BATCH = 3;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const optionalBoolean = (value: unknown): boolean | undefined =>
	typeof value === "boolean" ? value : undefined;

const parsePositiveInteger = (
	value: unknown,
	field: string,
	defaultValue: number,
): E.Either<CLIError, number> => {
	if (value === undefined || value === null || value === "") {
		return E.right(defaultValue);
	}

	const raw =
		typeof value === "number"
			? String(value)
			: typeof value === "string"
				? value.trim()
				: null;

	if (raw === null || !/^[0-9]+$/.test(raw)) {
		return E.left(
			usageError(
				`Invalid "${field}"`,
				`Provide "${field}" as a positive integer.`,
			),
		);
	}

	const parsed = Number.parseInt(raw, 10);
	if (parsed <= 0) {
		return E.left(
			usageError(
				`Invalid "${field}"`,
				`Provide "${field}" as a positive integer.`,
			),
		);
	}

	return E.right(parsed);
};

const parseInput = (input: string): E.Either<CLIError, BuildTaskPlanInput> => {
	if (!input.trim()) {
		return E.left(
			usageError(
				"Empty input",
				'Provide JSON with "tasks_path", "max_simple_batch", and "complex_isolated".',
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
				'Provide JSON with "tasks_path", "max_simple_batch", and "complex_isolated".',
			),
		);
	}

	const tasksPath =
		typeof parsed.tasks_path === "string" && parsed.tasks_path.trim()
			? parsed.tasks_path.trim()
			: null;

	if (!tasksPath) {
		return E.left(usageError('Missing "tasks_path"', 'Provide "tasks_path".'));
	}

	if (!isAbsolute(tasksPath)) {
		return E.left(
			usageError(
				'Invalid "tasks_path"',
				'Provide "tasks_path" as an absolute path.',
			),
		);
	}

	return pipe(
		parsePositiveInteger(
			parsed.max_simple_batch,
			"max_simple_batch",
			DEFAULT_MAX_SIMPLE_BATCH,
		),
		E.map((maxSimpleBatch) => ({
			tasksPath,
			maxSimpleBatch,
			complexIsolated: optionalBoolean(parsed.complex_isolated) ?? true,
		})),
	);
};

const planPathFor = (tasksPath: string): string => {
	if (extname(tasksPath) === ".json") {
		return tasksPath;
	}

	const name = basename(tasksPath, extname(tasksPath));
	return join(dirname(tasksPath), `${name}.json`);
};

const parseStringField = (
	record: Record<string, unknown>,
	field: string,
	index: number,
	errors: ToolError[],
): string | null => {
	const value = record[field];
	if (typeof value === "string" && value.trim()) {
		return value.trim();
	}

	errors.push({
		message: `Task at index ${index} must include non-empty "${field}".`,
	});
	return null;
};

const parseStringArrayField = (
	record: Record<string, unknown>,
	field: string,
	index: number,
	errors: ToolError[],
): readonly string[] | null => {
	const value = record[field];
	if (!Array.isArray(value)) {
		errors.push({
			message: `Task at index ${index} must include "${field}" as a string array.`,
		});
		return null;
	}

	const values = value
		.filter((entry): entry is string => typeof entry === "string")
		.map((entry) => entry.trim())
		.filter(Boolean);

	if (values.length !== value.length) {
		errors.push({
			message: `Task at index ${index} has invalid "${field}" entries.`,
		});
		return null;
	}

	return values;
};

const parseEnumField = <T extends string>(
	record: Record<string, unknown>,
	field: string,
	valid: readonly T[],
	index: number,
	errors: ToolError[],
): T | null => {
	const value = record[field];
	if (typeof value === "string" && valid.includes(value as T)) {
		return value as T;
	}

	errors.push({
		message: `Task at index ${index} has invalid "${field}". Expected one of: ${valid.join(", ")}.`,
	});
	return null;
};

const parseOptionalString = (value: unknown): string | undefined =>
	typeof value === "string" && value.trim() ? value.trim() : undefined;

const parseTask = (
	value: unknown,
	index: number,
	errors: ToolError[],
): BuildTaskPlanTask | null => {
	if (!isRecord(value)) {
		errors.push({ message: `Task at index ${index} must be an object.` });
		return null;
	}

	const id = parseStringField(value, "id", index, errors);
	const title = parseStringField(value, "title", index, errors);
	const type = parseEnumField<BuildTaskType>(
		value,
		"type",
		VALID_BUILD_TASK_TYPES,
		index,
		errors,
	);
	const status = parseEnumField<BuildTaskStatus>(
		value,
		"status",
		VALID_BUILD_TASK_STATUSES,
		index,
		errors,
	);
	const complexity = parseEnumField<BuildTaskComplexity>(
		value,
		"complexity",
		VALID_BUILD_TASK_COMPLEXITIES,
		index,
		errors,
	);
	const acceptanceRefs = parseStringArrayField(
		value,
		"acceptance_refs",
		index,
		errors,
	);
	const dependencies = parseStringArrayField(
		value,
		"dependencies",
		index,
		errors,
	);
	const target = parseStringField(value, "target", index, errors);

	if (
		!id ||
		!title ||
		!type ||
		!status ||
		!complexity ||
		!acceptanceRefs ||
		!dependencies ||
		!target
	) {
		return null;
	}

	return {
		id,
		title,
		type,
		status,
		complexity,
		acceptance_refs: acceptanceRefs,
		dependencies,
		...(parseOptionalString(value.reference)
			? { reference: parseOptionalString(value.reference) }
			: {}),
		target,
		...(parseOptionalString(value.notes)
			? { notes: parseOptionalString(value.notes) }
			: {}),
	};
};

const validateTaskRelationships = (
	tasks: readonly BuildTaskPlanTask[],
	errors: ToolError[],
): void => {
	const seen = new Set<string>();
	for (const task of tasks) {
		if (seen.has(task.id)) {
			errors.push({ message: `Duplicate task id "${task.id}".` });
		}
		seen.add(task.id);
	}

	const taskIds = new Set(tasks.map((task) => task.id));
	for (const task of tasks) {
		for (const dependency of task.dependencies) {
			if (!taskIds.has(dependency)) {
				errors.push({
					message: `Task "${task.id}" depends on unknown task "${dependency}".`,
				});
			}
			if (dependency === task.id) {
				errors.push({ message: `Task "${task.id}" depends on itself.` });
			}
		}
	}
};

const parsePlanDocument = (
	content: string,
	sourcePath: string,
): ToolResult<BuildTaskPlanDocument | null> => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(content);
	} catch {
		return errorResult(TOOL_NAME, null, [
			{ message: `Invalid JSON in ${sourcePath}.` },
		]);
	}

	const errors: ToolError[] = [];
	if (!isRecord(parsed)) {
		return errorResult(TOOL_NAME, null, [
			{ message: "Task plan must be a JSON object." },
		]);
	}

	if (parsed.schema_version !== TASK_PLAN_SCHEMA_VERSION) {
		errors.push({
			message: `Unsupported schema_version. Expected ${TASK_PLAN_SCHEMA_VERSION}.`,
		});
	}

	const featureId =
		typeof parsed.feature_id === "string" && parsed.feature_id.trim()
			? parsed.feature_id.trim()
			: null;
	if (!featureId) {
		errors.push({ message: 'Task plan must include non-empty "feature_id".' });
	}

	if (!Array.isArray(parsed.tasks)) {
		errors.push({ message: 'Task plan must include "tasks" as an array.' });
	}

	const tasks = Array.isArray(parsed.tasks)
		? parsed.tasks
				.map((task, index) => parseTask(task, index, errors))
				.filter((task): task is BuildTaskPlanTask => task !== null)
		: [];

	validateTaskRelationships(tasks, errors);

	if (errors.length > 0 || !featureId) {
		return errorResult(TOOL_NAME, null, errors);
	}

	return successResult(TOOL_NAME, {
		schema_version: TASK_PLAN_SCHEMA_VERSION,
		feature_id: featureId,
		tasks,
	});
};

const topologicalSortTasks = (
	tasks: readonly BuildTaskPlanTask[],
): E.Either<ToolError, readonly BuildTaskPlanTask[]> => {
	const byId = new Map(tasks.map((task) => [task.id, task]));
	const temporary = new Set<string>();
	const permanent = new Set<string>();
	const sorted: BuildTaskPlanTask[] = [];

	const visit = (task: BuildTaskPlanTask): ToolError | null => {
		if (permanent.has(task.id)) {
			return null;
		}
		if (temporary.has(task.id)) {
			return { message: `Dependency cycle detected at task "${task.id}".` };
		}

		temporary.add(task.id);
		for (const dependency of task.dependencies) {
			const dependencyTask = byId.get(dependency);
			if (dependencyTask) {
				const error = visit(dependencyTask);
				if (error) {
					return error;
				}
			}
		}
		temporary.delete(task.id);
		permanent.add(task.id);
		sorted.push(task);
		return null;
	};

	for (const task of tasks) {
		const error = visit(task);
		if (error) {
			return E.left(error);
		}
	}

	return E.right(sorted);
};

const pendingDependencyIdsFor = (
	task: BuildTaskPlanTask,
	pendingImplementationIds: ReadonlySet<string>,
	unitTaskIds: readonly string[],
): readonly string[] => {
	const currentUnit = new Set(unitTaskIds);
	return task.dependencies.filter(
		(dependency) =>
			pendingImplementationIds.has(dependency) && !currentUnit.has(dependency),
	);
};

const dependencyBlockedIdsFor = (
	tasks: readonly BuildTaskPlanTask[],
): ReadonlySet<string> => {
	const byId = new Map(tasks.map((task) => [task.id, task]));
	const statusBlocked = new Set(
		tasks.filter((task) => task.status === "blocked").map((task) => task.id),
	);
	const dependencyBlocked = new Set<string>();
	const visiting = new Set<string>();

	const isBlockedByDependency = (task: BuildTaskPlanTask): boolean => {
		if (dependencyBlocked.has(task.id)) {
			return true;
		}
		if (visiting.has(task.id)) {
			return false;
		}

		visiting.add(task.id);
		for (const dependency of task.dependencies) {
			if (statusBlocked.has(dependency)) {
				dependencyBlocked.add(task.id);
				visiting.delete(task.id);
				return true;
			}

			const dependencyTask = byId.get(dependency);
			if (
				dependencyTask &&
				dependencyTask.status === "pending" &&
				isBlockedByDependency(dependencyTask)
			) {
				dependencyBlocked.add(task.id);
				visiting.delete(task.id);
				return true;
			}
		}
		visiting.delete(task.id);
		return false;
	};

	for (const task of tasks) {
		if (task.status === "pending") {
			isBlockedByDependency(task);
		}
	}

	return dependencyBlocked;
};

const blockedDependencyWarningsFor = (
	tasks: readonly BuildTaskPlanTask[],
	dependencyBlockedIds: ReadonlySet<string>,
): readonly string[] => {
	const blockedStatusIds = new Set(
		tasks.filter((task) => task.status === "blocked").map((task) => task.id),
	);
	const blockedIds = new Set([...blockedStatusIds, ...dependencyBlockedIds]);

	return tasks
		.filter((task) => dependencyBlockedIds.has(task.id))
		.map((task) => {
			const blockers = task.dependencies.filter((dependency) =>
				blockedIds.has(dependency),
			);
			const suffix = blockers.length > 0 ? `: ${blockers.join(", ")}` : ".";
			return `Task "${task.id}" is pending but blocked by prerequisite${blockers.length === 1 ? "" : "s"}${suffix}`;
		});
};

const unitComplexityFor = (
	tasks: readonly BuildTaskPlanTask[],
): BuildTaskComplexity => {
	if (tasks.some((task) => task.complexity === "complex")) {
		return "complex";
	}
	if (tasks.some((task) => task.complexity === "medium")) {
		return "medium";
	}
	return "simple";
};

const createUnit = (
	unitId: number,
	tasks: readonly BuildTaskPlanTask[],
	pendingImplementationIds: ReadonlySet<string>,
): BuildTaskUnit => {
	const taskIds = tasks.map((task) => task.id);
	const dependsOn = new Set<string>();
	for (const task of tasks) {
		for (const dependency of pendingDependencyIdsFor(
			task,
			pendingImplementationIds,
			taskIds,
		)) {
			dependsOn.add(dependency);
		}
	}

	return {
		unit_id: unitId,
		task_ids: taskIds,
		complexity: unitComplexityFor(tasks),
		depends_on: Array.from(dependsOn),
	};
};

const groupTaskUnits = (
	implementationTasks: readonly BuildTaskPlanTask[],
	maxSimpleBatch: number,
	complexIsolated: boolean,
): readonly BuildTaskUnit[] => {
	const units: BuildTaskUnit[] = [];
	const pendingImplementationIds = new Set(
		implementationTasks.map((task) => task.id),
	);
	let simpleBuffer: BuildTaskPlanTask[] = [];
	let unitId = 1;

	const flushSimple = () => {
		if (simpleBuffer.length === 0) {
			return;
		}
		units.push(createUnit(unitId, simpleBuffer, pendingImplementationIds));
		unitId += 1;
		simpleBuffer = [];
	};

	for (const task of implementationTasks) {
		const pendingDependencies = pendingDependencyIdsFor(
			task,
			pendingImplementationIds,
			[],
		);
		const canBatchSimple =
			task.complexity === "simple" && pendingDependencies.length === 0;
		const canBatchNonIsolatedComplex =
			!complexIsolated &&
			task.complexity === "complex" &&
			pendingDependencies.length === 0;

		if (canBatchSimple || canBatchNonIsolatedComplex) {
			simpleBuffer.push(task);
			if (simpleBuffer.length >= maxSimpleBatch) {
				flushSimple();
			}
			continue;
		}

		flushSimple();
		units.push(createUnit(unitId, [task], pendingImplementationIds));
		unitId += 1;
	}

	flushSimple();
	return units;
};

const summaryFor = (
	tasks: readonly BuildTaskPlanTask[],
	implementationTasks: readonly BuildTaskPlanTask[],
	documentationTasks: readonly BuildTaskPlanTask[],
	taskUnits: readonly BuildTaskUnit[],
	dependencyBlockedIds: ReadonlySet<string>,
) => {
	const completed = tasks.filter((task) => task.status === "completed").length;
	const blocked = tasks.filter((task) => task.status === "blocked").length;
	return {
		total_tasks: tasks.length,
		pending: tasks.filter((task) => task.status === "pending").length,
		completed,
		blocked,
		implementation_pending: implementationTasks.length,
		documentation_pending: documentationTasks.length,
		total_units: taskUnits.length,
		skipped_completed: completed,
		skipped_blocked: blocked + dependencyBlockedIds.size,
	};
};

const buildResult = (
	input: BuildTaskPlanInput,
	planPath: string,
	plan: BuildTaskPlanDocument,
): ToolResult<BuildTaskPlanResult | null> => {
	const sortedResult = topologicalSortTasks(plan.tasks);
	if (E.isLeft(sortedResult)) {
		return errorResult(TOOL_NAME, null, [sortedResult.left]);
	}

	const pendingTasks = sortedResult.right.filter(
		(task) => task.status === "pending",
	);
	const dependencyBlockedIds = dependencyBlockedIdsFor(sortedResult.right);
	const schedulablePendingTasks = pendingTasks.filter(
		(task) => !dependencyBlockedIds.has(task.id),
	);
	const implementationTasks = schedulablePendingTasks.filter(
		(task) => task.type === "code",
	);
	const documentationTasks = schedulablePendingTasks.filter(
		(task) => task.type === "docs",
	);
	const taskUnits = groupTaskUnits(
		implementationTasks,
		input.maxSimpleBatch,
		input.complexIsolated,
	);

	return successResult(TOOL_NAME, {
		plan_path: planPath,
		source_tasks_path: input.tasksPath,
		schema_version: TASK_PLAN_SCHEMA_VERSION,
		feature_id: plan.feature_id,
		tasks: sortedResult.right,
		implementation_tasks: implementationTasks,
		documentation_tasks: documentationTasks,
		task_units: taskUnits,
		warnings: [
			...(input.tasksPath === planPath
				? []
				: [
						`Resolved machine task plan sidecar from "${input.tasksPath}" to "${planPath}".`,
					]),
			...blockedDependencyWarningsFor(sortedResult.right, dependencyBlockedIds),
		],
		summary: summaryFor(
			plan.tasks,
			implementationTasks,
			documentationTasks,
			taskUnits,
			dependencyBlockedIds,
		),
	});
};

const KNOWN_SHARED_BASENAMES = new Set([
	"package-lock.json",
	"bun.lockb",
	"bun.lock",
	"yarn.lock",
	"pnpm-lock.yaml",
	"npm-shrinkwrap.json",
	"agents.yaml",
]);

const SHARED_SENTINEL = "__shared__";

const isKnownSharedPath = (target: string): boolean => {
	const name = basename(target);
	return KNOWN_SHARED_BASENAMES.has(name);
};

/**
 * Normalize a task target for comparison so that spellings of the same path
 * compare equal: `./src/a/`, `src//a`, `src/b/../a`, and `src/a` all collapse
 * to `src/a`. Dot segments are resolved because an unresolved `..` would make
 * two targets for the same file look disjoint and let overlapping work run
 * concurrently.
 */
const normalizeTarget = (target: string): string => {
	const unified = target.trim().replace(/\\/g, "/");
	const isAbsolute = unified.startsWith("/");
	const resolved: string[] = [];

	for (const segment of unified.split("/")) {
		if (segment === "" || segment === ".") {
			continue;
		}
		if (segment === "..") {
			// A leading `..` cannot be resolved away, so keep it: dropping it
			// would make `../shared` compare equal to `shared`.
			if (resolved.length > 0 && resolved[resolved.length - 1] !== "..") {
				resolved.pop();
			} else if (!isAbsolute) {
				resolved.push("..");
			}
			continue;
		}
		resolved.push(segment);
	}

	if (resolved.length === 0) {
		return isAbsolute ? "/" : ".";
	}
	return `${isAbsolute ? "/" : ""}${resolved.join("/")}`;
};

const targetsForUnit = (
	unit: BuildTaskUnit,
	tasksByIdMap: ReadonlyMap<string, BuildTaskPlanTask>,
): readonly string[] => {
	const targets: string[] = [];
	for (const taskId of unit.task_ids) {
		const task = tasksByIdMap.get(taskId);
		if (task) {
			targets.push(
				isKnownSharedPath(task.target)
					? SHARED_SENTINEL
					: normalizeTarget(task.target),
			);
		}
	}
	return targets;
};

/**
 * Two targets overlap when they are equal or when one contains the other.
 * A directory target such as `cli/src/build` overlaps a file target beneath
 * it, so comparing for equality alone would let overlapping work run
 * concurrently. Comparison is segment-aware: `cli/src/buildx` does not
 * overlap `cli/src/build`.
 */
const targetsOverlap = (a: string, b: string): boolean =>
	a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);

const unitsAreFileDisjoint = (
	targetsA: readonly string[],
	targetsB: readonly string[],
): boolean => !targetsA.some((a) => targetsB.some((b) => targetsOverlap(a, b)));

export const scheduleWave = (input: ScheduleWaveInput): ScheduleWaveResult => {
	const {
		task_units,
		tasks,
		completed_task_ids,
		built_task_ids,
		pending_integration_task_ids,
		max_builders,
		git_commit,
		clean_tree,
	} = input;

	const completedSet = new Set(completed_task_ids);
	const builtSet = new Set(built_task_ids);
	const pendingSet = new Set(pending_integration_task_ids);
	const tasksByIdMap = new Map(tasks.map((t) => [t.id, t]));

	const isCompleted = (unit: BuildTaskUnit): boolean =>
		unit.task_ids.every((id) => completedSet.has(id));
	const isBuilt = (unit: BuildTaskUnit): boolean =>
		!isCompleted(unit) && unit.task_ids.every((id) => builtSet.has(id));
	// Work sitting in an unintegrated worktree: not on the primary branch, so it
	// can be neither reviewed nor rebuilt until the orchestrator resolves it.
	const isPendingIntegration = (unit: BuildTaskUnit): boolean =>
		!isCompleted(unit) &&
		!isBuilt(unit) &&
		unit.task_ids.some((id) => pendingSet.has(id));

	const byUnitId = (a: BuildTaskUnit, b: BuildTaskUnit): number =>
		a.unit_id - b.unit_id;
	const targetsFor = (unit: BuildTaskUnit): readonly string[] =>
		targetsForUnit(unit, tasksByIdMap);

	const builtUnits = task_units.filter(isBuilt).sort(byUnitId);
	const pendingUnits = task_units.filter(isPendingIntegration).sort(byUnitId);

	// A unit is ready to build only when no builder has produced it yet and
	// every dependency has been *reviewed*, not merely built.
	const readyUnits = task_units
		.filter(
			(unit) =>
				!isCompleted(unit) &&
				!isBuilt(unit) &&
				!isPendingIntegration(unit) &&
				unit.depends_on.every((dep) => completedSet.has(dep)),
		)
		.sort(byUnitId);

	// Built work must be reviewed, never re-dispatched to a builder: its edits
	// are already on disk, so rebuilding would re-apply them.
	if (builtUnits.length > 0) {
		const reviewUnit = builtUnits[0];
		const review = [
			{ unit_id: reviewUnit.unit_id, task_ids: [...reviewUnit.task_ids] },
		];
		const heldUnits = [
			...builtUnits.slice(1).map((u) => u.unit_id),
			...pendingUnits.map((u) => u.unit_id),
		];

		// A pipelined builder must not touch files belonging to ANY unit awaiting
		// review, not merely the one under review now: a later reviewer failure
		// retries that unit on the shared tree, and unintegrated worktree commits
		// are replayed onto it. Overlap with either is unsafe.
		const unreviewedTargets = [
			...builtUnits.flatMap((u) => targetsFor(u)),
			...pendingUnits.flatMap((u) => targetsFor(u)),
		];

		const candidate = readyUnits.find(
			(unit) =>
				!unit.depends_on.some((dep) => reviewUnit.task_ids.includes(dep)) &&
				unitsAreFileDisjoint(unreviewedTargets, targetsFor(unit)),
		);

		if (!candidate) {
			return {
				review,
				dispatch: [],
				held: [...heldUnits, ...readyUnits.map((u) => u.unit_id)],
				mode: "review-only",
			};
		}

		return {
			review,
			dispatch: [
				{
					unit_id: candidate.unit_id,
					task_ids: [...candidate.task_ids],
					role: "primary",
				},
			],
			held: [
				...heldUnits,
				...readyUnits
					.filter((u) => u.unit_id !== candidate.unit_id)
					.map((u) => u.unit_id),
			],
			mode: "serial",
		};
	}

	// Commits waiting in a worktree are replayed onto the primary tree, so every
	// builder dispatched from here must stay clear of their files.
	const pendingTargets = pendingUnits.flatMap((u) => targetsFor(u));
	const pendingHeld = pendingUnits.map((u) => u.unit_id);

	// Ready units that overlap unintegrated work are held rather than dispatched:
	// the worktree rebase would replay its commits over the builder's edits.
	const dispatchableUnits = readyUnits.filter((unit) =>
		unitsAreFileDisjoint(pendingTargets, targetsFor(unit)),
	);
	const blockedByPending = readyUnits
		.filter((unit) => !dispatchableUnits.includes(unit))
		.map((u) => u.unit_id);

	if (dispatchableUnits.length === 0) {
		return {
			review: [],
			dispatch: [],
			held: [...pendingHeld, ...blockedByPending],
			mode: "serial",
			// Distinguishing these matters: pending integration means the
			// orchestrator still owes work, while no ready units and nothing
			// pending is a genuine dependency deadlock.
			reason:
				pendingUnits.length > 0 ? "pending_integration" : "no_ready_units",
		};
	}

	const canParallelWave =
		git_commit &&
		clean_tree &&
		dispatchableUnits.length >= 2 &&
		max_builders >= 2;

	if (canParallelWave) {
		const primaryUnit = dispatchableUnits[0];
		const dispatched: WaveDispatch[] = [
			{
				unit_id: primaryUnit.unit_id,
				task_ids: [...primaryUnit.task_ids],
				role: "primary",
			},
		];
		const held: number[] = [...pendingHeld, ...blockedByPending];
		const claimedTargets: string[] = [
			...pendingTargets,
			...targetsFor(primaryUnit),
		];

		for (const candidate of dispatchableUnits.slice(1)) {
			if (dispatched.length >= max_builders) {
				held.push(candidate.unit_id);
				continue;
			}

			const hasMutualDep =
				candidate.depends_on.some((dep) =>
					dispatched.some((d) => d.task_ids.includes(dep)),
				) ||
				dispatched.some((d) => {
					const dUnit = task_units.find((u) => u.unit_id === d.unit_id);
					return dUnit?.depends_on.some((dep) =>
						candidate.task_ids.includes(dep),
					);
				});

			if (hasMutualDep) {
				held.push(candidate.unit_id);
				continue;
			}

			const candidateTargets = targetsFor(candidate);
			if (!unitsAreFileDisjoint(claimedTargets, candidateTargets)) {
				held.push(candidate.unit_id);
				continue;
			}

			dispatched.push({
				unit_id: candidate.unit_id,
				task_ids: [...candidate.task_ids],
				role: "secondary",
			});
			claimedTargets.push(...candidateTargets);
		}

		if (dispatched.length >= 2) {
			return { review: [], dispatch: dispatched, held, mode: "parallel-wave" };
		}
	}

	const primary = dispatchableUnits[0];
	return {
		review: [],
		dispatch: [
			{
				unit_id: primary.unit_id,
				task_ids: [...primary.task_ids],
				role: "primary",
			},
		],
		held: [
			...pendingHeld,
			...blockedByPending,
			...dispatchableUnits.slice(1).map((u) => u.unit_id),
		],
		mode: "serial",
	};
};

export const execute = (
	input: string,
	_options: ToolOptions,
): TE.TaskEither<CLIError, ToolResult<BuildTaskPlanResult | null>> =>
	pipe(
		TE.fromEither(parseInput(input)),
		TE.bindTo("parsed"),
		TE.bind("planPath", ({ parsed }) =>
			TE.right(planPathFor(parsed.tasksPath)),
		),
		TE.bind("content", ({ planPath }) =>
			TE.tryCatch(
				() => readFile(planPath, "utf-8"),
				(error) => {
					if (
						isRecord(error) &&
						typeof error.code === "string" &&
						error.code === "ENOENT"
					) {
						return notFoundError(
							planPath,
							"Run feature-tasker to generate tasks.json before build-task-plan.",
						);
					}
					return runtimeError(`Failed to read task plan "${planPath}".`, error);
				},
			),
		),
		TE.map(({ parsed, planPath, content }) => {
			const parsedPlan = parsePlanDocument(content, planPath);
			if (!parsedPlan.success || parsedPlan.data === null) {
				return errorResult(TOOL_NAME, null, parsedPlan.errors ?? []);
			}
			return buildResult(parsed, planPath, parsedPlan.data);
		}),
	);

registerTool({
	name: TOOL_NAME,
	description:
		"Read schema-backed tasks.json and group pending build task units",
	execute,
});

export { TOOL_NAME, parsePositiveInteger, planPathFor };
