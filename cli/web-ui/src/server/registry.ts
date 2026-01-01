/**
 * Project registry for multi-project support.
 * Handles persistent storage of registered rp1 projects with atomic file operations.
 */

import { readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { ensureConfigDir, getRegistryPath } from "../daemon/config-dir";

/**
 * Registry file version for future migrations.
 */
const REGISTRY_VERSION = 1;

/**
 * Single project entry in the registry.
 */
export interface ProjectEntry {
	/** Unique identifier derived from path */
	readonly id: string;
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
}

/**
 * Root registry structure stored in projects.json.
 */
export interface ProjectRegistry {
	/** Schema version for migrations */
	readonly version: number;
	/** Project ID of last invoked project (for default selection) */
	readonly lastInvoked: string | null;
	/** Map of project ID to project entry */
	readonly projects: Record<string, ProjectEntry>;
}

/**
 * Create an empty registry.
 */
function createEmptyRegistry(): ProjectRegistry {
	return {
		version: REGISTRY_VERSION,
		lastInvoked: null,
		projects: {},
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
 */
export async function isValidProject(projectPath: string): Promise<boolean> {
	try {
		const rp1Path = `${projectPath}/.rp1`;
		const stats = await stat(rp1Path);
		return stats.isDirectory();
	} catch {
		return false;
	}
}

/**
 * Extract project name from charter or use directory name.
 */
export async function getProjectName(projectPath: string): Promise<string> {
	try {
		const charterPath = `${projectPath}/.rp1/work/charter.md`;
		const content = await readFile(charterPath, "utf-8");

		// Extract title from frontmatter
		const titleMatch = content.match(
			/^---[\s\S]*?title:\s*["']?([^"'\n]+)["']?/m,
		);
		if (titleMatch?.[1]) {
			return titleMatch[1].trim();
		}

		// Extract first H1
		const h1Match = content.match(/^#\s+(.+)$/m);
		if (h1Match?.[1]) {
			return h1Match[1].trim();
		}
	} catch {
	}

	return basename(projectPath);
}

/**
 * Load registry from disk, creating empty if missing or corrupted.
 */
export async function loadRegistry(): Promise<ProjectRegistry> {
	const registryPath = getRegistryPath();

	try {
		const content = await readFile(registryPath, "utf-8");
		const parsed = JSON.parse(content) as ProjectRegistry;

		// Basic validation
		if (
			typeof parsed.version !== "number" ||
			typeof parsed.projects !== "object"
		) {
			console.warn("Registry file corrupted, creating new registry");
			return createEmptyRegistry();
		}

		return parsed;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			// File doesn't exist yet
			return createEmptyRegistry();
		}

		console.warn("Failed to read registry, creating new:", error);
		return createEmptyRegistry();
	}
}

/**
 * Save registry to disk atomically using temp file + rename.
 */
export async function saveRegistry(registry: ProjectRegistry): Promise<void> {
	await ensureConfigDir();

	const registryPath = getRegistryPath();
	const tempPath = `${registryPath}.tmp.${Date.now()}`;

	try {
		// Write to temp file
		await writeFile(tempPath, JSON.stringify(registry, null, 2), {
			mode: 0o600,
		});

		// Atomic rename
		await rename(tempPath, registryPath);
	} catch (error) {
		try {
			await unlink(tempPath);
		} catch {
		}
		throw error;
	}
}

/**
 * Register a project in the registry.
 * Returns the project entry with its assigned ID.
 */
export async function registerProject(
	projectPath: string,
): Promise<ProjectEntry> {
	const registry = await loadRegistry();
	const existingIds = new Set(Object.keys(registry.projects));

	// Check if already registered by path
	const existing = Object.values(registry.projects).find(
		(p) => p.path === projectPath,
	);

	const now = new Date().toISOString();
	const available = await isValidProject(projectPath);

	if (existing) {
		// Update existing entry
		const updated: ProjectEntry = {
			...existing,
			lastAccessedAt: now,
			available,
		};

		const updatedRegistry: ProjectRegistry = {
			...registry,
			lastInvoked: existing.id,
			projects: {
				...registry.projects,
				[existing.id]: updated,
			},
		};

		await saveRegistry(updatedRegistry);
		return updated;
	}

	// Create new entry
	const id = generateProjectId(projectPath, existingIds);
	const name = await getProjectName(projectPath);

	const entry: ProjectEntry = {
		id,
		path: projectPath,
		name,
		addedAt: now,
		lastAccessedAt: now,
		available,
	};

	const updatedRegistry: ProjectRegistry = {
		...registry,
		lastInvoked: id,
		projects: {
			...registry.projects,
			[id]: entry,
		},
	};

	await saveRegistry(updatedRegistry);
	return entry;
}

/**
 * Remove a project from the registry by ID.
 * Returns true if the project was found and removed.
 */
export async function removeProject(projectId: string): Promise<boolean> {
	const registry = await loadRegistry();

	if (!registry.projects[projectId]) {
		return false;
	}

	const { [projectId]: _removed, ...remainingProjects } = registry.projects;

	const updatedRegistry: ProjectRegistry = {
		...registry,
		lastInvoked:
			registry.lastInvoked === projectId ? null : registry.lastInvoked,
		projects: remainingProjects,
	};

	await saveRegistry(updatedRegistry);
	return true;
}

/**
 * Get a project by ID.
 */
export async function getProject(
	projectId: string,
): Promise<ProjectEntry | null> {
	const registry = await loadRegistry();
	return registry.projects[projectId] ?? null;
}

/**
 * Get all registered projects.
 */
export async function getAllProjects(): Promise<ProjectEntry[]> {
	const registry = await loadRegistry();
	return Object.values(registry.projects);
}

/**
 * Get the last invoked project ID.
 */
export async function getLastInvokedProjectId(): Promise<string | null> {
	const registry = await loadRegistry();
	return registry.lastInvoked;
}

/**
 * Update availability status for all projects.
 * Marks projects as unavailable if their .rp1/ directory is missing.
 */
export async function refreshProjectAvailability(): Promise<void> {
	const registry = await loadRegistry();
	const updates: Record<string, ProjectEntry> = {};
	let hasChanges = false;

	for (const project of Object.values(registry.projects)) {
		const available = await isValidProject(project.path);
		if (available !== project.available) {
			updates[project.id] = { ...project, available };
			hasChanges = true;
		} else {
			updates[project.id] = project;
		}
	}

	if (hasChanges) {
		await saveRegistry({
			...registry,
			projects: updates,
		});
	}
}

/**
 * Set a project as the last invoked.
 */
export async function setLastInvoked(projectId: string): Promise<void> {
	const registry = await loadRegistry();

	if (!registry.projects[projectId]) {
		throw new Error(`Project ${projectId} not found in registry`);
	}

	const now = new Date().toISOString();
	const project = registry.projects[projectId];

	await saveRegistry({
		...registry,
		lastInvoked: projectId,
		projects: {
			...registry.projects,
			[projectId]: {
				...project,
				lastAccessedAt: now,
			},
		},
	});
}
