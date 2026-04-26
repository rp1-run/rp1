import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { parseError, usageError } from "../../../shared/errors.js";
import { registerTool, type ToolOptions } from "../index.js";
import {
	WORK_SEARCH_DEFAULT_LIMIT,
	WORK_SEARCH_MAX_LIMIT,
	type WorkSearchCommandInput,
	type WorkSearchResolvedInput,
	type WorkSearchToolError,
	type WorkSearchToolResult,
} from "./models.js";
import {
	createWorkSearchError,
	createWorkSearchErrorResult,
	executeWorkSearch,
} from "./search.js";

const TOOL_NAME = "work-search";

const parseInput = (
	input: string,
): E.Either<CLIError, WorkSearchCommandInput> => {
	if (!input.trim()) {
		return E.right({});
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(input);
	} catch {
		return E.left(parseError("stdin", "Invalid JSON input"));
	}

	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		return E.left(
			usageError(
				"Input must be a JSON object",
				'Provide JSON with optional "query", "project", "limit", "refresh", and "refreshOnly" fields.',
			),
		);
	}

	return E.right(parsed as WorkSearchCommandInput);
};

const normalizeLimit = (
	limit: unknown,
): E.Either<WorkSearchToolError, number> => {
	if (limit === undefined || limit === null || limit === "") {
		return E.right(WORK_SEARCH_DEFAULT_LIMIT);
	}

	const rawLimit =
		typeof limit === "number"
			? String(limit)
			: typeof limit === "string"
				? limit.trim()
				: null;
	if (rawLimit === null) {
		return E.left(
			createWorkSearchError(
				"invalid_limit",
				`Invalid --limit value: ${String(limit)}. Must be a positive integer.`,
			),
		);
	}

	if (!/^[0-9]+$/.test(rawLimit)) {
		return E.left(
			createWorkSearchError(
				"invalid_limit",
				`Invalid --limit value: ${String(limit)}. Must be a positive integer.`,
			),
		);
	}

	const parsedLimit = Number.parseInt(rawLimit, 10);
	if (parsedLimit <= 0) {
		return E.left(
			createWorkSearchError(
				"invalid_limit",
				`Invalid --limit value: ${String(limit)}. Must be a positive integer.`,
			),
		);
	}

	return E.right(Math.min(parsedLimit, WORK_SEARCH_MAX_LIMIT));
};

export const normalizeWorkSearchInput = (
	input: WorkSearchCommandInput,
): E.Either<WorkSearchToolError, WorkSearchResolvedInput> => {
	const limitResult = normalizeLimit(input.limit);
	if (E.isLeft(limitResult)) {
		return limitResult;
	}

	const refreshOnly = input.refreshOnly === true || input.refresh_only === true;
	const query =
		typeof input.query === "string" && input.query.trim()
			? input.query.trim()
			: null;

	if (!refreshOnly && query === null) {
		return E.left(
			createWorkSearchError(
				"invalid_query",
				"Missing search query. Provide a query or use --refresh-only.",
			),
		);
	}

	const project =
		typeof input.project === "string" && input.project.trim()
			? input.project.trim()
			: undefined;

	return E.right({
		query: refreshOnly ? null : query,
		...(project ? { project } : {}),
		limit: limitResult.right,
		refresh: refreshOnly ? true : input.refresh !== false,
		refreshOnly,
	});
};

export const execute = (
	input: string,
	_options: ToolOptions,
): TE.TaskEither<CLIError, WorkSearchToolResult> =>
	pipe(
		TE.fromEither(parseInput(input)),
		TE.chain((commandInput) => {
			const resolvedInput = normalizeWorkSearchInput(commandInput);
			if (E.isLeft(resolvedInput)) {
				return TE.right(createWorkSearchErrorResult(resolvedInput.left));
			}

			return executeWorkSearch(resolvedInput.right);
		}),
	);

registerTool({
	name: TOOL_NAME,
	description: "Search project-scoped rp1 work artifacts",
	execute,
});

export {
	createWorkSearchError,
	createWorkSearchErrorResult,
} from "./search.js";
export { TOOL_NAME };
