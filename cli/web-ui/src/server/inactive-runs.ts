import type { Database } from "bun:sqlite";
import {
	getRunById,
	type InactiveRunReclassification,
	reclassifyInactiveRuns,
} from "../../../src/agent-tools/emit/database.js";
import { buildProjectLookup, findProjectByIdentity } from "./project-lookup";
import { getAllProjects } from "./registry";
import type { WebSocketHub } from "./websocket";

/**
 * Reclassify stale runs and fan out the generated inactive lifecycle events so
 * other connected tabs observe the same state transition immediately.
 */
export async function reclassifyInactiveRunsWithBroadcast(
	db: Database,
	websocketHub?: WebSocketHub,
): Promise<readonly InactiveRunReclassification[]> {
	const reclassified = reclassifyInactiveRuns(db);

	if (!websocketHub || reclassified.length === 0) {
		return reclassified;
	}

	const projects = await getAllProjects(db);
	const projectLookup = buildProjectLookup(projects);

	for (const reclassification of reclassified) {
		const run = getRunById(db, reclassification.runId);
		if (!run) {
			continue;
		}

		const project = findProjectByIdentity(projectLookup, run);
		if (!project) {
			continue;
		}

		websocketHub.broadcastEvent(
			project.id,
			reclassification.eventId,
			"status_change",
			run.id,
			run.featureId,
			null,
			reclassification.data,
			reclassification.createdAt,
		);
	}

	return reclassified;
}
