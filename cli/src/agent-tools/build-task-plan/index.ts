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
	TASK_PLAN_SCHEMA_VERSION,
	VALID_BUILD_TASK_COMPLEXITIES,
	VALID_BUILD_TASK_STATUSES,
	VALID_BUILD_TASK_TYPES,
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

export { TOOL_NAME, planPathFor };
