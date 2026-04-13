import type { ProjectEntry } from "./registry";

export interface ProjectIdentity {
	readonly projectId?: string | null;
	readonly rp1ProjectRoot?: string | null;
	readonly projectPath?: string | null;
}

export interface ProjectLookup {
	readonly byId: ReadonlyMap<string, ProjectEntry>;
	readonly byPath: ReadonlyMap<string, ProjectEntry>;
}

export function buildProjectLookup(
	projects: readonly ProjectEntry[],
): ProjectLookup {
	const byId = new Map<string, ProjectEntry>();
	const byPath = new Map<string, ProjectEntry>();
	const seenProjectIds = new Set<string>();

	for (const project of projects) {
		byId.set(project.id, project);
		if (project.projectId) {
			if (seenProjectIds.has(project.projectId)) {
				byId.delete(project.projectId);
			} else {
				seenProjectIds.add(project.projectId);
				byId.set(project.projectId, project);
			}
		}
		byPath.set(project.path, project);
	}

	return { byId, byPath };
}

export function findProjectByIdentity(
	lookup: ProjectLookup,
	identity: ProjectIdentity,
): ProjectEntry | undefined {
	if (identity.rp1ProjectRoot) {
		const byRoot = lookup.byPath.get(identity.rp1ProjectRoot);
		if (byRoot) {
			return byRoot;
		}
	}

	if (identity.projectPath) {
		const byPath = lookup.byPath.get(identity.projectPath);
		if (byPath) {
			return byPath;
		}
	}

	if (identity.projectId) {
		const byId = lookup.byId.get(identity.projectId);
		if (byId) {
			return byId;
		}
	}

	return undefined;
}
