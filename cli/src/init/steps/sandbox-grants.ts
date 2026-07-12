/**
 * Per-platform sandbox grant generators for central-mode rp1 projects.
 *
 * Each AI coding harness enforces a filesystem sandbox that blocks access
 * outside the project directory by default. Central-mode stores KB and work
 * artifacts under ~/.rp1/projects/<id>/, so each platform needs an explicit
 * grant to read and write that path.
 *
 * Pure generator functions produce typed config objects; writer functions
 * persist them to the platform-specific config file in the project root.
 * The dispatcher resolves which platforms need grants from the persisted
 * harness selection or falls back to all stable platforms.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	getDefaultInstallTools,
	loadToolsRegistry,
} from "../../config/supported-tools.js";
import { loadEnabledHarnesses } from "../../settings/loader.js";

const CENTRAL_STORE_PATH = "~/.rp1";
const CENTRAL_STORE_GLOB = "~/.rp1/**";

// ─── Grant result ─────────────────────────────────────────────────────────

export interface GrantResult {
	readonly platform: string;
	readonly written: boolean;
	readonly path: string;
}

// ─── Claude Code ──────────────────────────────────────────────────────────

export interface ClaudeCodeGrants {
	readonly permissions: {
		readonly additionalDirectories: readonly string[];
		readonly allow: readonly string[];
	};
	readonly sandbox: {
		readonly filesystem: {
			readonly allowWrite: readonly string[];
		};
	};
}

export function generateClaudeCodeGrants(): ClaudeCodeGrants {
	return {
		permissions: {
			additionalDirectories: [CENTRAL_STORE_PATH],
			allow: [`Read(${CENTRAL_STORE_GLOB})`, `Edit(${CENTRAL_STORE_GLOB})`],
		},
		sandbox: {
			filesystem: {
				allowWrite: [CENTRAL_STORE_PATH],
			},
		},
	};
}

/**
 * Deduplicate a string array while preserving insertion order.
 */
function dedupeArray(arr: readonly string[]): string[] {
	return [...new Set(arr)];
}

/**
 * Deep-merge rp1 grants into an existing Claude Code settings.json object.
 * Arrays are union-merged (deduped). Existing user keys are preserved.
 */
function mergeClaudeCodeSettings(
	existing: Record<string, unknown>,
	grants: ClaudeCodeGrants,
): Record<string, unknown> {
	const result = { ...existing };

	const existingPerms = (result.permissions ?? {}) as Record<string, unknown>;
	const mergedPerms = { ...existingPerms };

	mergedPerms.additionalDirectories = dedupeArray([
		...((existingPerms.additionalDirectories as string[]) ?? []),
		...(grants.permissions.additionalDirectories as string[]),
	]);

	mergedPerms.allow = dedupeArray([
		...((existingPerms.allow as string[]) ?? []),
		...(grants.permissions.allow as string[]),
	]);

	result.permissions = mergedPerms;

	const existingSandbox = (result.sandbox ?? {}) as Record<string, unknown>;
	const existingFs = (existingSandbox.filesystem ?? {}) as Record<
		string,
		unknown
	>;

	const mergedFs = { ...existingFs };
	mergedFs.allowWrite = dedupeArray([
		...((existingFs.allowWrite as string[]) ?? []),
		...(grants.sandbox.filesystem.allowWrite as string[]),
	]);

	result.sandbox = { ...existingSandbox, filesystem: mergedFs };

	return result;
}

export async function writeClaudeCodeGrants(
	projectRoot: string,
): Promise<GrantResult> {
	const grants = generateClaudeCodeGrants();
	const settingsDir = join(projectRoot, ".claude");
	const settingsPath = join(settingsDir, "settings.json");

	let existing: Record<string, unknown> = {};
	try {
		const content = await readFile(settingsPath, "utf-8");
		existing = JSON.parse(content) as Record<string, unknown>;
	} catch {
		// File absent or invalid — start fresh
	}

	const merged = mergeClaudeCodeSettings(existing, grants);
	await mkdir(settingsDir, { recursive: true });
	await writeFile(
		settingsPath,
		`${JSON.stringify(merged, null, 2)}\n`,
		"utf-8",
	);

	return { platform: "claude-code", written: true, path: settingsPath };
}

// ─── Codex ────────────────────────────────────────────────────────────────

export interface CodexGrants {
	readonly sandbox_workspace_write: {
		readonly writable_roots: readonly string[];
	};
}

export function generateCodexGrants(): CodexGrants {
	return {
		sandbox_workspace_write: {
			writable_roots: [CENTRAL_STORE_PATH],
		},
	};
}

export async function writeCodexGrants(
	projectRoot: string,
): Promise<GrantResult> {
	const grants = generateCodexGrants();
	const configPath = join(projectRoot, "codex.toml");

	const entries = grants.sandbox_workspace_write.writable_roots
		.map((r) => `"${r}"`)
		.join(", ");
	const section = `[sandbox_workspace_write]\nwritable_roots = [${entries}]`;

	let existing = "";
	try {
		existing = await readFile(configPath, "utf-8");
	} catch {
		// File absent
	}

	let content: string;
	if (existing.includes("[sandbox_workspace_write]")) {
		// Section already exists — leave it as-is to avoid overwriting user entries
		content = existing;
	} else {
		content = existing.trim()
			? `${existing.trim()}\n\n${section}\n`
			: `${section}\n`;
	}

	await writeFile(configPath, content, "utf-8");
	return { platform: "codex", written: true, path: configPath };
}

// ─── OpenCode ─────────────────────────────────────────────────────────────

/**
 * OpenCode enforces an `external_directory` permission that defaults to "ask"
 * for paths outside the working directory. The grant writes allow rules into
 * the project-level `opencode.json` as a path-pattern-to-mode map.
 *
 * Validated format per HYP-002: `{ permission: { external_directory: { "~/.rp1/**": "allow" } } }`
 */
export interface OpenCodeGrants {
	readonly permission: {
		readonly external_directory: Readonly<Record<string, string>>;
	};
}

export function generateOpenCodeGrants(): OpenCodeGrants {
	return {
		permission: {
			external_directory: { [CENTRAL_STORE_GLOB]: "allow" },
		},
	};
}

export async function writeOpenCodeGrants(
	projectRoot: string,
): Promise<GrantResult> {
	const grants = generateOpenCodeGrants();
	const configPath = join(projectRoot, "opencode.json");

	let existing: Record<string, unknown> = {};
	try {
		const content = await readFile(configPath, "utf-8");
		existing = JSON.parse(content) as Record<string, unknown>;
	} catch {
		// File absent or invalid
	}

	const existingPermission = (existing.permission ?? {}) as Record<
		string,
		unknown
	>;
	const existingExtDir = (existingPermission.external_directory ??
		{}) as Record<string, string>;

	const mergedPermission = {
		...existingPermission,
		external_directory: {
			...existingExtDir,
			...grants.permission.external_directory,
		},
	};

	const merged = { ...existing, permission: mergedPermission };
	await writeFile(configPath, `${JSON.stringify(merged, null, 2)}\n`, "utf-8");

	return { platform: "opencode", written: true, path: configPath };
}

// ─── Antigravity ──────────────────────────────────────────────────────────

export interface AntigravityGrants {
	readonly sandbox: {
		readonly allowed_paths: readonly string[];
	};
}

export function generateAntigravityGrants(): AntigravityGrants {
	return {
		sandbox: {
			allowed_paths: [CENTRAL_STORE_PATH],
		},
	};
}

export async function writeAntigravityGrants(
	projectRoot: string,
): Promise<GrantResult> {
	const grants = generateAntigravityGrants();
	const settingsDir = join(projectRoot, ".gemini");
	const settingsPath = join(settingsDir, "settings.json");

	let existing: Record<string, unknown> = {};
	try {
		const content = await readFile(settingsPath, "utf-8");
		existing = JSON.parse(content) as Record<string, unknown>;
	} catch {
		// File absent or invalid
	}

	const existingSandbox = (existing.sandbox ?? {}) as Record<string, unknown>;
	const mergedSandbox = { ...existingSandbox };
	mergedSandbox.allowed_paths = dedupeArray([
		...((existingSandbox.allowed_paths as string[]) ?? []),
		...(grants.sandbox.allowed_paths as string[]),
	]);

	const merged = { ...existing, sandbox: mergedSandbox };
	await mkdir(settingsDir, { recursive: true });
	await writeFile(
		settingsPath,
		`${JSON.stringify(merged, null, 2)}\n`,
		"utf-8",
	);

	return { platform: "antigravity", written: true, path: settingsPath };
}

// ─── Copilot ──────────────────────────────────────────────────────────────

export interface CopilotGrants {
	readonly sandbox: {
		readonly allowlist: readonly string[];
	};
}

export function generateCopilotGrants(): CopilotGrants {
	return {
		sandbox: {
			allowlist: [CENTRAL_STORE_PATH],
		},
	};
}

export async function writeCopilotGrants(
	projectRoot: string,
): Promise<GrantResult> {
	const grants = generateCopilotGrants();
	const settingsDir = join(projectRoot, ".github");
	const settingsPath = join(settingsDir, "copilot-settings.json");

	let existing: Record<string, unknown> = {};
	try {
		const content = await readFile(settingsPath, "utf-8");
		existing = JSON.parse(content) as Record<string, unknown>;
	} catch {
		// File absent or invalid
	}

	const existingSandbox = (existing.sandbox ?? {}) as Record<string, unknown>;
	const mergedSandbox = { ...existingSandbox };
	mergedSandbox.allowlist = dedupeArray([
		...((existingSandbox.allowlist as string[]) ?? []),
		...(grants.sandbox.allowlist as string[]),
	]);

	const merged = { ...existing, sandbox: mergedSandbox };
	await mkdir(settingsDir, { recursive: true });
	await writeFile(
		settingsPath,
		`${JSON.stringify(merged, null, 2)}\n`,
		"utf-8",
	);

	return { platform: "copilot", written: true, path: settingsPath };
}

// ─── Platform writer dispatch table ───────────────────────────────────────

const PLATFORM_WRITERS: Readonly<
	Record<string, (projectRoot: string) => Promise<GrantResult>>
> = {
	"claude-code": writeClaudeCodeGrants,
	codex: writeCodexGrants,
	opencode: writeOpenCodeGrants,
	antigravity: writeAntigravityGrants,
	copilot: writeCopilotGrants,
};

// ─── Dispatch ─────────────────────────────────────────────────────────────

/**
 * Resolve the effective harness list.
 *
 * 1. If an explicit list is provided, use it.
 * 2. Otherwise read persisted selection via loadEnabledHarnesses.
 * 3. If nothing is persisted, fall back to all stable platforms in the registry.
 */
export async function resolveHarnesses(
	harnesses: string[] | undefined,
	globalSettingsPath?: string,
): Promise<readonly string[]> {
	if (harnesses !== undefined) {
		return harnesses;
	}

	const persisted = loadEnabledHarnesses(globalSettingsPath);
	if (persisted !== undefined) {
		return persisted;
	}

	const registry = await loadToolsRegistry();
	return getDefaultInstallTools(registry).map((t) => t.id);
}

/**
 * Generate sandbox grants for selected platforms.
 *
 * Dispatches to per-platform writers based on the resolved harness list.
 * Unknown platform IDs are silently skipped.
 *
 * @param harnesses - Explicit list, or undefined to resolve from settings/registry
 * @param projectRoot - Project root directory where grant files are written
 * @param globalSettingsPath - Override path for test isolation (passed through to loadEnabledHarnesses)
 */
export async function generateSandboxGrants(
	harnesses: string[] | undefined,
	projectRoot: string,
	globalSettingsPath?: string,
): Promise<GrantResult[]> {
	const resolved = await resolveHarnesses(harnesses, globalSettingsPath);
	const results: GrantResult[] = [];

	for (const platformId of resolved) {
		const writer = PLATFORM_WRITERS[platformId];
		if (writer) {
			const result = await writer(projectRoot);
			results.push(result);
		}
	}

	return results;
}
