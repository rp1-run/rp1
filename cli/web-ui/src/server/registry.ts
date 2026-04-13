/**
 * Project registry for multi-project support.
 * DB-backed storage layer using the rp1.db projects and project_registry_meta tables.
 */

import type { Database } from "bun:sqlite";
import { readFile, stat, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { resolveDirectorySet } from "../../../shared/directory-resolution.js";
import { readProjectId } from "../../../shared/project-id.js";
import { getConfigDir } from "../daemon/config-dir";

/**
 * Single project entry in the registry.
 */
export interface ProjectEntry {
	/** Unique identifier -- UUID from .rp1/project_id when available, otherwise path-derived */
	readonly id: string;
	/** Stable project UUID from .rp1/project_id (same as id for UUID-keyed projects) */
	readonly projectId: string | undefined;
	/** Absolute path to project root */
	readonly path: string;
	/** Display name (from charter or directory name) */
	readonly name: string;
	/** ISO timestamp when project was first registered */
	readonly addedAt: string;
	/** ISO timestamp of last access */
	readonly lastAccessedAt: string;
	/** False if .rp1/ directory is missing on last check */
	readonly available: boolean;
	/** Number of active (non-completed) features (optional, populated by API) */
	readonly activeFeatureCount?: number;
}

interface ProjectRow {
	id: string;
	project_id: string | null;
	path: string;
	name: string;
	added_at: string;
	last_accessed_at: string;
	available: number;
}

function rowToEntry(row: ProjectRow): ProjectEntry {
	return {
		id: row.id,
		projectId: row.project_id ?? undefined,
		path: row.path,
		name: row.name,
		addedAt: row.added_at,
		lastAccessedAt: row.last_accessed_at,
		available: row.available === 1,
	};
}

/**
 * Generate a unique project ID from path.
 * Uses directory name with parent prefix for collision avoidance.
 *
 * @example
 * /Users/dev/myapp -> "myapp"
 * /Users/dev/projects/myapp -> "projects-myapp" (if "myapp" exists)
 */
export function generateProjectId(
	projectPath: string,
	existingIds: Set<string>,
): string {
	const dirName = basename(projectPath);
	const slug = slugify(dirName);

	if (!existingIds.has(slug)) {
		return slug;
	}

	const parentName = basename(dirname(projectPath));
	const slugWithParent = slugify(`${parentName}-${dirName}`);

	if (!existingIds.has(slugWithParent)) {
		return slugWithParent;
	}

	let counter = 2;
	while (existingIds.has(`${slug}-${counter}`)) {
		counter++;
	}
	return `${slug}-${counter}`;
}

/**
 * Convert string to URL-safe slug.
 */
function slugify(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

/**
 * Check if a path contains a valid .rp1 directory.
 * Only returns false when the path genuinely does not exist (ENOENT).
 * Transient I/O errors are re-thrown so callers can decide how to handle them
 * rather than silently treating the project as invalid.
 */
export async function isValidProject(projectPath: string): Promise<boolean> {
	try {
		const rp1Path = `${projectPath}/.rp1`;
		const stats = await stat(rp1Path);
		return stats.isDirectory();
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return false;
		}
		throw error;
	}
}

/**
 * Get project display name from directory name.
 * Always uses directory name for consistency and clarity.
 */
export function getProjectName(projectPath: string): string {
	return basename(projectPath);
}

let _hydrated = false;

/**
 * One-time bootstrap hydration from projects.json into the DB.
 * Runs once per process lifetime. Only hydrates when the projects table is empty
 * and a projects.json file exists. Handles missing or corrupt files silently.
 */
export async function ensureHydrated(db: Database): Promise<void> {
	if (_hydrated) return;
	_hydrated = true;

	const row = db.prepare("SELECT COUNT(*) as count FROM projects").get() as {
		count: number;
	};
	if (row.count > 0) return;

	const registryPath = join(getConfigDir(), "projects.json");

	try {
		const content = await readFile(registryPath, "utf-8");
		const parsed = JSON.parse(content) as {
			lastInvoked?: string | null;
			projects?: Record<
				string,
				{
					id: string;
					projectId?: string;
					path: string;
					name: string;
					addedAt: string;
					lastAccessedAt: string;
					available?: boolean;
				}
			>;
		};

		if (parsed.projects && typeof parsed.projects === "object") {
			const insertStmt = db.prepare(
				"INSERT OR IGNORE INTO projects (id, project_id, path, name, added_at, last_accessed_at, available) VALUES (?, ?, ?, ?, ?, ?, ?)",
			);

			for (const entry of Object.values(parsed.projects)) {
				insertStmt.run(
					entry.id,
					entry.projectId ?? null,
					entry.path,
					entry.name,
					entry.addedAt,
					entry.lastAccessedAt,
					entry.available !== false ? 1 : 0,
				);
			}

			if (parsed.lastInvoked) {
				db.prepare(
					"INSERT OR REPLACE INTO project_registry_meta (key, value) VALUES ('last_invoked_project_id', ?)",
				).run(parsed.lastInvoked);
			}
		}

		try {
			await unlink(registryPath);
		} catch (unlinkError) {
			console.warn(
				"[registry] Could not delete projects.json after migration:",
				unlinkError,
			);
		}
	} catch {
		// File missing, corrupt, or unreadable -- silently continue with empty registry
	}
}

/**
 * Reset hydration state. Exported for test use only.
 */
export function _resetHydrated(): void {
	_hydrated = false;
}

/**
 * Register a project in the registry.
 * Returns the project entry with its assigned ID.
 * Normalizes paths through resolveDirectorySet so worktrees resolve
 * to the main repo path instead of being registered as separate projects.
 */
export async function registerProject(
	db: Database,
	projectPath: string,
): Promise<ProjectEntry> {
	await ensureHydrated(db);

	const resolved = resolveDirectorySet(projectPath);
	const normalizedPath = E.isRight(resolved)
		? resolved.right.projectRoot
		: projectPath;

	const available = await isValidProject(normalizedPath);
	const uuid = readProjectId(normalizedPath);
	const now = new Date().toISOString();

	const doRegister = db.transaction(() => {
		const existing = db
			.prepare("SELECT * FROM projects WHERE path = ?")
			.get(normalizedPath) as ProjectRow | null;

		if (existing) {
			const needsRekey = !!(uuid && existing.id !== uuid);
			const updatedId = uuid ?? existing.id;
			const updatedProjectId = uuid ?? existing.project_id;

			if (needsRekey) {
				db.prepare(
					"UPDATE projects SET id = ?, project_id = ?, last_accessed_at = ?, available = ? WHERE path = ?",
				).run(
					updatedId,
					updatedProjectId,
					now,
					available ? 1 : 0,
					normalizedPath,
				);
			} else {
				db.prepare(
					"UPDATE projects SET project_id = ?, last_accessed_at = ?, available = ? WHERE path = ?",
				).run(updatedProjectId, now, available ? 1 : 0, normalizedPath);
			}

			db.prepare(
				"INSERT OR REPLACE INTO project_registry_meta (key, value) VALUES ('last_invoked_project_id', ?)",
			).run(updatedId);

			return rowToEntry({
				id: updatedId,
				project_id: updatedProjectId,
				path: normalizedPath,
				name: existing.name,
				added_at: existing.added_at,
				last_accessed_at: now,
				available: available ? 1 : 0,
			});
		}

		const existingIds = new Set(
			(db.prepare("SELECT id FROM projects").all() as { id: string }[]).map(
				(r) => r.id,
			),
		);
		const id = uuid ?? generateProjectId(normalizedPath, existingIds);
		const name = getProjectName(normalizedPath);

		db.prepare(
			"INSERT INTO projects (id, project_id, path, name, added_at, last_accessed_at, available) VALUES (?, ?, ?, ?, ?, ?, ?)",
		).run(id, uuid ?? null, normalizedPath, name, now, now, available ? 1 : 0);

		db.prepare(
			"INSERT OR REPLACE INTO project_registry_meta (key, value) VALUES ('last_invoked_project_id', ?)",
		).run(id);

		return rowToEntry({
			id,
			project_id: uuid ?? null,
			path: normalizedPath,
			name,
			added_at: now,
			last_accessed_at: now,
			available: available ? 1 : 0,
		});
	});

	return doRegister();
}

/**
 * Remove a project from the registry by ID.
 * Returns true if the project was found and removed.
 */
export async function removeProject(
	db: Database,
	projectId: string,
): Promise<boolean> {
	await ensureHydrated(db);

	const result = db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);

	if (result.changes === 0) return false;

	const meta = db
		.prepare(
			"SELECT value FROM project_registry_meta WHERE key = 'last_invoked_project_id'",
		)
		.get() as { value: string | null } | null;

	if (meta?.value === projectId) {
		db.prepare(
			"DELETE FROM project_registry_meta WHERE key = 'last_invoked_project_id'",
		).run();
	}

	return true;
}

/**
 * Get a project by ID.
 */
export async function getProject(
	db: Database,
	projectId: string,
): Promise<ProjectEntry | null> {
	await ensureHydrated(db);

	const row = db
		.prepare("SELECT * FROM projects WHERE id = ?")
		.get(projectId) as ProjectRow | null;

	return row ? rowToEntry(row) : null;
}

/**
 * Get all registered projects.
 */
export async function getAllProjects(db: Database): Promise<ProjectEntry[]> {
	await ensureHydrated(db);

	const rows = db.prepare("SELECT * FROM projects").all() as ProjectRow[];

	return rows.map(rowToEntry);
}

/**
 * Get the last invoked project ID.
 */
export async function getLastInvokedProjectId(
	db: Database,
): Promise<string | null> {
	await ensureHydrated(db);

	const row = db
		.prepare(
			"SELECT value FROM project_registry_meta WHERE key = 'last_invoked_project_id'",
		)
		.get() as { value: string | null } | null;

	return row?.value ?? null;
}

/**
 * Update availability status for all projects.
 * Marks projects as unavailable if their .rp1/ directory is missing.
 */
export async function refreshProjectAvailability(db: Database): Promise<void> {
	await ensureHydrated(db);

	const rows = db.prepare("SELECT * FROM projects").all() as ProjectRow[];

	for (const row of rows) {
		const available = await isValidProject(row.path);
		const currentAvailable = row.available === 1;

		if (available !== currentAvailable) {
			db.prepare("UPDATE projects SET available = ? WHERE path = ?").run(
				available ? 1 : 0,
				row.path,
			);
		}
	}
}

/**
 * Prune projects whose paths no longer exist on disk.
 * Returns the number of projects removed.
 */
export async function pruneStaleProjects(db: Database): Promise<number> {
	await ensureHydrated(db);

	const rows = db.prepare("SELECT * FROM projects").all() as ProjectRow[];

	let pruned = 0;
	const prunedIds = new Set<string>();

	for (const row of rows) {
		const available = await isValidProject(row.path);
		if (!available) {
			db.prepare("DELETE FROM projects WHERE path = ?").run(row.path);
			prunedIds.add(row.id);
			pruned++;
		}
	}

	if (pruned > 0) {
		const meta = db
			.prepare(
				"SELECT value FROM project_registry_meta WHERE key = 'last_invoked_project_id'",
			)
			.get() as { value: string | null } | null;

		if (meta?.value && prunedIds.has(meta.value)) {
			db.prepare(
				"DELETE FROM project_registry_meta WHERE key = 'last_invoked_project_id'",
			).run();
		}
	}

	return pruned;
}

/**
 * Set a project as the last invoked.
 */
export async function setLastInvoked(
	db: Database,
	projectId: string,
): Promise<void> {
	await ensureHydrated(db);

	const exists = db
		.prepare("SELECT id FROM projects WHERE id = ?")
		.get(projectId) as { id: string } | null;

	if (!exists) {
		throw new Error(`Project ${projectId} not found in registry`);
	}

	const now = new Date().toISOString();

	db.prepare(
		"INSERT OR REPLACE INTO project_registry_meta (key, value) VALUES ('last_invoked_project_id', ?)",
	).run(projectId);

	db.prepare("UPDATE projects SET last_accessed_at = ? WHERE id = ?").run(
		now,
		projectId,
	);
}

/**
 * Get the total number of registered projects.
 * Synchronous helper for the health endpoint.
 */
export function getProjectCount(db: Database): number {
	const row = db.prepare("SELECT COUNT(*) as count FROM projects").get() as {
		count: number;
	};

	return row.count;
}
