import { existsSync } from "node:fs";
import * as E from "fp-ts/lib/Either.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { formatError, runtimeError } from "../../../shared/errors.js";
import { errorResult, successResult } from "../output.js";
import {
	getWorkSearchDatabase,
	getWorkSearchDbPath,
	searchWorkChunks,
} from "./database.js";
import {
	refreshWorkSearchIndex,
	resolveWorkSearchProjectScope,
	type WorkSearchRefreshOutput,
} from "./indexer.js";
import type {
	WorkSearchErrorCode,
	WorkSearchHit,
	WorkSearchProjectScope,
	WorkSearchRefreshSummary,
	WorkSearchResolvedInput,
	WorkSearchToolError,
	WorkSearchToolResult,
} from "./models.js";

const TOOL_NAME = "work-search";
const FTS_TOKEN_PATTERN = /[\p{L}\p{N}_]+/gu;

export const createWorkSearchError = (
	code: WorkSearchErrorCode,
	message: string,
	context?: string,
): WorkSearchToolError => ({
	code,
	message,
	...(context ? { context } : {}),
});

export const createWorkSearchErrorResult = (
	error: WorkSearchToolError,
): WorkSearchToolResult => errorResult(TOOL_NAME, null, [error]);

const errorMessage = (error: CLIError): string => {
	const formatted = formatError(error, false);
	return formatted.startsWith("Error: ") ? formatted.slice(7) : formatted;
};

const classifyCliError = (
	error: CLIError,
	fallback: WorkSearchErrorCode,
): WorkSearchErrorCode => {
	if (error._tag === "NotFoundError" && error.resource === ".rp1/project_id") {
		return "unresolved_project";
	}

	const message = errorMessage(error).toLowerCase();
	if (message.includes("unable to resolve rp1 project id")) {
		return "unresolved_project";
	}
	if (message.includes("schema")) {
		return "schema_migration_failed";
	}
	return fallback;
};

const escapeFtsPhrase = (term: string): string =>
	`"${term.replaceAll('"', '""')}"`;

export const buildWorkSearchFtsQuery = (
	query: string,
): E.Either<WorkSearchToolError, string> => {
	const terms = Array.from(query.matchAll(FTS_TOKEN_PATTERN), (match) =>
		match[0].trim(),
	).filter((term) => term.length > 0);

	if (terms.length === 0) {
		return E.left(
			createWorkSearchError(
				"invalid_query",
				"Search query must contain at least one word or number.",
			),
		);
	}

	return E.right(terms.map(escapeFtsPhrase).join(" AND "));
};

const rowsToHits = (
	rows: ReturnType<typeof searchWorkChunks>,
): readonly WorkSearchHit[] =>
	rows.map((row, index) => ({
		rank: index + 1,
		score: row.score,
		snippet: row.snippet,
		path: row.relativePath,
		displayPath: row.displayPath,
		storageRoot: "work_dir",
		projectId: row.projectId,
		metadata: row.metadata,
		chunk: row.chunk,
	}));

const resolveProjectWithoutRefresh = async (
	projectPath: string | undefined,
): Promise<
	E.Either<
		CLIError,
		{
			readonly project: WorkSearchProjectScope;
			readonly refresh: null;
		}
	>
> => {
	const projectResult: E.Either<CLIError, WorkSearchProjectScope> =
		await resolveWorkSearchProjectScope(projectPath)();
	if (E.isLeft(projectResult)) {
		return E.left(projectResult.left);
	}
	return E.right({ project: projectResult.right, refresh: null });
};

const refreshProject = async (
	input: WorkSearchResolvedInput,
): Promise<
	E.Either<
		CLIError,
		{
			readonly project: WorkSearchProjectScope;
			readonly refresh: WorkSearchRefreshSummary;
		}
	>
> => {
	const refreshResult: E.Either<CLIError, WorkSearchRefreshOutput> =
		await refreshWorkSearchIndex({
			project: input.project,
		})();
	if (E.isLeft(refreshResult)) {
		return E.left(refreshResult.left);
	}
	return E.right({
		project: refreshResult.right.project,
		refresh: refreshResult.right.refresh,
	});
};

export const executeWorkSearch = (
	input: WorkSearchResolvedInput,
): TE.TaskEither<CLIError, WorkSearchToolResult> =>
	TE.tryCatch(
		async () => {
			const ftsQueryResult =
				input.query === null
					? E.right(null)
					: buildWorkSearchFtsQuery(input.query);
			if (E.isLeft(ftsQueryResult)) {
				return createWorkSearchErrorResult(ftsQueryResult.left);
			}

			const projectResult =
				input.refresh || input.refreshOnly
					? await refreshProject(input)
					: await resolveProjectWithoutRefresh(input.project);

			if (E.isLeft(projectResult)) {
				const code = classifyCliError(
					projectResult.left,
					input.refresh || input.refreshOnly
						? "refresh_failed"
						: "unresolved_project",
				);
				return createWorkSearchErrorResult(
					createWorkSearchError(code, errorMessage(projectResult.left)),
				);
			}

			const { project, refresh } = projectResult.right;
			if (input.refreshOnly) {
				return successResult(TOOL_NAME, {
					query: null,
					project,
					refresh,
					results: [],
				});
			}

			if (ftsQueryResult.right === null) {
				return createWorkSearchErrorResult(
					createWorkSearchError(
						"invalid_query",
						"Missing search query. Provide a query or use --refresh-only.",
					),
				);
			}

			const dbPath = getWorkSearchDbPath(project.projectRoot);
			if (!input.refresh && !existsSync(dbPath)) {
				return createWorkSearchErrorResult(
					createWorkSearchError(
						"unavailable_index",
						`No work-search sidecar index exists for ${project.projectRoot}. Run without --no-refresh first.`,
					),
				);
			}

			const dbResult = await getWorkSearchDatabase(project.projectRoot)();
			if (E.isLeft(dbResult)) {
				const code = classifyCliError(dbResult.left, "unavailable_index");
				return createWorkSearchErrorResult(
					createWorkSearchError(code, errorMessage(dbResult.left)),
				);
			}

			try {
				const rows = searchWorkChunks(dbResult.right, {
					projectId: project.projectId,
					ftsQuery: ftsQueryResult.right,
					limit: input.limit,
				});

				return successResult(TOOL_NAME, {
					query: input.query,
					project,
					refresh,
					results: rowsToHits(rows),
				});
			} catch (error) {
				return createWorkSearchErrorResult(
					createWorkSearchError(
						"search_failed",
						`Failed to execute work-search query: ${error instanceof Error ? error.message : String(error)}`,
					),
				);
			}
		},
		(error) =>
			runtimeError(
				`Unexpected work-search execution failure: ${error instanceof Error ? error.message : String(error)}`,
				error,
			),
	);
