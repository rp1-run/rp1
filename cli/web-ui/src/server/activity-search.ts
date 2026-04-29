import type { Database } from "bun:sqlite";
import { basename } from "node:path";
import type { RunRecord, Status } from "../../../shared/events.js";
import type {
	ActivitySearchRefreshScope,
	ActivitySearchScope,
	RunRecordWithLastEvent,
} from "../../../src/agent-tools/emit/database.js";
import {
	deleteActivitySearchRun,
	getEventsForRun,
	getRunWithLastEventById,
	listActivitySearchRefreshCandidates,
	queryActivitySearchRuns,
	upsertActivitySearchRun,
} from "../../../src/agent-tools/emit/database.js";
import type { InstalledSkillDiscoveryMetadata } from "../../../src/install/verifier.js";
import {
	buildActivitySearchText,
	normalizeActivitySearchTokens,
} from "../lib/activity-search-fields";
import type { Run } from "../types/runs";
import { findProjectByIdentity, type ProjectLookup } from "./project-lookup";
import type { ProjectEntry } from "./registry";

export type ActivitySearchDateRange = "today" | "week" | "month" | "all";

export interface ActivityFeedRunItem {
	readonly type: "run";
	readonly id: string;
	readonly timestamp: string;
	readonly run: Run;
}

export interface ActivityFeedSearchResult {
	readonly items: readonly ActivityFeedRunItem[];
	readonly total: number;
}

export interface ActivitySearchProjection {
	readonly currentStepForRun: (
		db: Database,
		record: RunRecord,
	) => string | null;
	readonly statusMessageForRun: (
		db: Database,
		record: RunRecord,
	) => string | null;
	readonly runRecordToListRun: (
		record: RunRecordWithLastEvent,
		project: ProjectEntry,
		statusMessage?: string | null,
		currentStep?: string | null,
	) => Run;
}

export interface SearchActivityFeedRunsOptions {
	readonly db: Database;
	readonly projectLookup: ProjectLookup;
	readonly skillMetadataLookup: ReadonlyMap<
		string,
		Pick<InstalledSkillDiscoveryMetadata, "arcade_tracked">
	>;
	readonly projection: ActivitySearchProjection;
	readonly query: string | null | undefined;
	readonly projectId?: string;
	readonly projectRoot?: string;
	readonly status?: Status;
	readonly dateRange?: ActivitySearchDateRange;
	readonly limit?: number;
	readonly offset?: number;
	readonly now?: Date;
}

function fallbackProjectFromRun(record: {
	readonly projectId: string | null;
	readonly rp1ProjectRoot: string;
	readonly projectPath: string;
}): ProjectEntry {
	const path = record.rp1ProjectRoot || record.projectPath;
	return {
		id: record.projectId ?? path,
		projectId: record.projectId ?? undefined,
		path,
		name: basename(path),
		addedAt: new Date().toISOString(),
		lastAccessedAt: new Date().toISOString(),
		available: false,
	};
}

function humanizeFeatureName(featureId: string): string {
	return featureId
		.split("-")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

function isActivityTrackedFlow(
	flow: string,
	skillMetadataLookup: ReadonlyMap<
		string,
		Pick<InstalledSkillDiscoveryMetadata, "arcade_tracked">
	>,
): boolean {
	const matchingMetadata = [...skillMetadataLookup.entries()]
		.filter(([canonicalName]) => canonicalName.split(":").at(-1) === flow)
		.map(([, metadata]) => metadata);

	if (matchingMetadata.length === 0) {
		return true;
	}

	return matchingMetadata.some((metadata) => metadata.arcade_tracked !== false);
}

function isEvalRunRecord(record: {
	readonly rp1ProjectRoot: string;
	readonly projectPath: string;
}): boolean {
	const effectivePath = record.rp1ProjectRoot || record.projectPath;
	return (
		effectivePath.startsWith("/tmp/rp1-evals/") ||
		effectivePath.startsWith("/private/tmp/rp1-evals/")
	);
}

function parseJsonSafe(
	json: string | null,
): Readonly<Record<string, unknown>> | null {
	if (!json) return null;
	try {
		return JSON.parse(json) as Record<string, unknown>;
	} catch {
		return null;
	}
}

function isInactivityReaperEvent(
	event: ReturnType<typeof getEventsForRun>[number],
): boolean {
	if (event.type !== "status_change") return false;
	const data = parseJsonSafe(event.data);
	return data?.source === "inactivity_reaper";
}

function isBootstrapOnlyRun(db: Database, record: RunRecord): boolean {
	if (record.bootstrapContext == null) return false;
	return !getEventsForRun(db, record.id).some(
		(event) => !isInactivityReaperEvent(event),
	);
}

function activitySearchScopeFromOptions(
	opts: SearchActivityFeedRunsOptions,
): ActivitySearchScope {
	const scope: ActivitySearchScope = {};
	const rangeMs =
		opts.dateRange && opts.dateRange !== "all"
			? {
					today: 24 * 60 * 60 * 1000,
					week: 7 * 24 * 60 * 60 * 1000,
					month: 30 * 24 * 60 * 60 * 1000,
				}[opts.dateRange]
			: undefined;

	return {
		...scope,
		projectId: opts.projectId,
		projectRoot: opts.projectRoot,
		status: opts.status,
		activityFrom:
			rangeMs == null
				? undefined
				: new Date((opts.now ?? new Date()).getTime() - rangeMs).toISOString(),
	};
}

function projectForRun(
	projectLookup: ProjectLookup,
	record: {
		readonly projectId: string | null;
		readonly rp1ProjectRoot: string;
		readonly projectPath: string;
	},
): ProjectEntry {
	return (
		findProjectByIdentity(projectLookup, record) ??
		fallbackProjectFromRun(record)
	);
}

function uniqueProjectEntries(projectLookup: ProjectLookup): ProjectEntry[] {
	const projects = new Map<string, ProjectEntry>();
	for (const project of projectLookup.byPath.values()) {
		projects.set(project.path, project);
	}
	for (const project of projectLookup.byId.values()) {
		projects.set(project.path, project);
	}
	return [...projects.values()];
}

function projectMatchesScope(
	project: ProjectEntry,
	scope: ActivitySearchScope,
): boolean {
	if (scope.projectRoot != null && project.path !== scope.projectRoot) {
		return false;
	}

	if (
		scope.projectId != null &&
		project.id !== scope.projectId &&
		project.projectId !== scope.projectId
	) {
		return false;
	}

	return true;
}

function projectNameMatchesTokens(
	project: ProjectEntry,
	tokens: readonly string[],
): boolean {
	const projectName = project.name.trim().toLowerCase();
	return (
		projectName.length > 0 &&
		tokens.some((token) => projectName.includes(token))
	);
}

function buildSearchTextRun(
	db: Database,
	projectLookup: ProjectLookup,
	projection: ActivitySearchProjection,
	record: RunRecord,
) {
	const project = projectForRun(projectLookup, record);
	return {
		id: record.id,
		command: `/${record.flow}`,
		name: record.name,
		featureName: humanizeFeatureName(record.featureId),
		featureId: record.featureId,
		projectName: project.name,
		status: record.status,
		statusMessage: projection.statusMessageForRun(db, record),
		harness: record.harness,
		currentStep: projection.currentStepForRun(db, record),
		steps: [],
		events: [],
	};
}

function refreshActivitySearchRows(
	opts: SearchActivityFeedRunsOptions,
	scope: ActivitySearchScope,
	forceRefresh = false,
): void {
	const refreshScope: ActivitySearchRefreshScope = {
		...scope,
		excludeBootstrapOnly: true,
		forceRefresh,
	};
	const candidates = listActivitySearchRefreshCandidates(opts.db, refreshScope);

	for (const candidate of candidates) {
		if (
			isEvalRunRecord(candidate.run) ||
			isBootstrapOnlyRun(opts.db, candidate.run)
		) {
			deleteActivitySearchRun(opts.db, candidate.run.id);
			continue;
		}

		const searchText = buildActivitySearchText(
			buildSearchTextRun(
				opts.db,
				opts.projectLookup,
				opts.projection,
				candidate.run,
			),
		);

		upsertActivitySearchRun(opts.db, {
			runId: candidate.run.id,
			projectId: candidate.run.projectId,
			projectRoot: candidate.run.rp1ProjectRoot || candidate.run.projectPath,
			flow: candidate.run.flow,
			status: candidate.run.status,
			activityAt: candidate.activityAt,
			sourceEventId: candidate.latestEventId,
			sourceRunUpdatedAt: candidate.run.updatedAt,
			searchText,
		});
	}
}

function refreshProjectDisplayNameSearchRows(
	opts: SearchActivityFeedRunsOptions,
	scope: ActivitySearchScope,
	tokens: readonly string[],
): void {
	for (const project of uniqueProjectEntries(opts.projectLookup)) {
		if (
			!projectMatchesScope(project, scope) ||
			!projectNameMatchesTokens(project, tokens)
		) {
			continue;
		}

		refreshActivitySearchRows(
			opts,
			{
				...scope,
				projectRoot: project.path,
			},
			true,
		);
	}
}

function isVisibleActivityRun(
	db: Database,
	record: RunRecord,
	skillMetadataLookup: SearchActivityFeedRunsOptions["skillMetadataLookup"],
): boolean {
	return (
		!isEvalRunRecord(record) &&
		!isBootstrapOnlyRun(db, record) &&
		isActivityTrackedFlow(record.flow, skillMetadataLookup)
	);
}

export function searchActivityFeedRuns(
	opts: SearchActivityFeedRunsOptions,
): ActivityFeedSearchResult {
	const tokens = normalizeActivitySearchTokens(opts.query);
	if (tokens.length === 0) {
		return { items: [], total: 0 };
	}

	const scope = activitySearchScopeFromOptions(opts);
	refreshActivitySearchRows(opts, scope);
	refreshProjectDisplayNameSearchRows(opts, scope, tokens);

	const matchingRows = queryActivitySearchRuns(opts.db, {
		...scope,
		tokens,
	}).records;
	const visibleRecords: RunRecordWithLastEvent[] = [];

	for (const row of matchingRows) {
		const record = getRunWithLastEventById(opts.db, row.runId);
		if (!record) {
			deleteActivitySearchRun(opts.db, row.runId);
			continue;
		}

		if (!isVisibleActivityRun(opts.db, record, opts.skillMetadataLookup)) {
			continue;
		}

		visibleRecords.push(record);
	}

	const offset = opts.offset ?? 0;
	const limit = opts.limit ?? 25;
	const pageRecords = visibleRecords.slice(offset, offset + limit);

	return {
		items: pageRecords.map((record) => {
			const project = projectForRun(opts.projectLookup, record);
			const run = opts.projection.runRecordToListRun(
				record,
				project,
				opts.projection.statusMessageForRun(opts.db, record),
				opts.projection.currentStepForRun(opts.db, record),
			);

			return {
				type: "run",
				id: record.id,
				timestamp: run.lastEventAt ?? run.startedAt,
				run,
			};
		}),
		total: visibleRecords.length,
	};
}
