/**
 * State machine loader with filesystem, bundle, and cache support.
 *
 * Discovery strategy (in priority order):
 * 1. In-memory cache (process-lifetime Map)
 * 2. Bundled assets (compiled binary mode)
 * 3. Filesystem scan (dev/source mode)
 *
 * Parse pipeline: read raw text -> parseAndTransform() -> cache -> return
 */

import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { notFoundError, runtimeError } from "../../../shared/errors.js";
import {
	getBundledAssets,
	hasBundledAssets,
	readEmbeddedFile,
} from "../../assets/reader.js";
import type { StateMachine } from "./models.js";
import { parseAndTransform } from "./transform.js";

const PLUGIN_NAMES = ["base", "dev", "utils"] as const;

const cache = new Map<string, StateMachine>();

/**
 * Derive the repository root from the loader module's location.
 * Path: cli/src/agent-tools/state-machine/ -> 4 levels up -> repo root
 */
const getProjectRoot = (): string => {
	const currentDir = dirname(fileURLToPath(import.meta.url));
	return join(currentDir, "..", "..", "..", "..");
};

/**
 * Load a state machine by workflow name (skill name).
 *
 * Checks cache first, then tries bundled assets, then filesystem.
 * Parsed result is cached for subsequent lookups.
 */
export const loadStateMachine = (
	workflowName: string,
): TE.TaskEither<CLIError, StateMachine> => {
	const cached = cache.get(workflowName);
	if (cached) {
		return TE.right(cached);
	}

	if (hasBundledAssets()) {
		return pipe(
			loadFromBundle(workflowName),
			TE.orElse(() => loadFromFilesystem(workflowName)),
		);
	}

	return loadFromFilesystem(workflowName);
};

/**
 * List all available workflows (skills with state.mmd files).
 */
export const listWorkflows = (): TE.TaskEither<CLIError, readonly string[]> => {
	if (hasBundledAssets()) {
		return pipe(
			listFromBundle(),
			TE.orElse(() => listFromFilesystem()),
		);
	}

	return listFromFilesystem();
};

/**
 * Clear the in-memory cache. Used for testing.
 */
export const clearCache = (): void => {
	cache.clear();
};

/**
 * Attempt to load a state machine from bundled assets.
 */
const loadFromBundle = (
	workflowName: string,
): TE.TaskEither<CLIError, StateMachine> =>
	pipe(
		TE.fromEither(getBundledAssets()),
		TE.chain((assets) => {
			for (const pluginKey of PLUGIN_NAMES) {
				const plugin = assets.plugins[pluginKey];
				const stateMachines = plugin.stateMachines;
				if (!stateMachines || stateMachines.length === 0) continue;

				const entry = stateMachines.find((sm) => sm.name === workflowName);
				if (entry) {
					return pipe(
						TE.tryCatch(
							() => readEmbeddedFile(entry.path),
							(err) =>
								runtimeError(
									`Failed to read bundled state.mmd for '${workflowName}': ${err}`,
								),
						),
						TE.chain((readResult) => TE.fromEither(readResult)),
						TE.chain((content) =>
							TE.fromEither(parseAndTransform(workflowName, content)),
						),
						TE.map((machine) => {
							cache.set(workflowName, machine);
							return machine;
						}),
					);
				}
			}
			return TE.left(
				notFoundError(
					`state.mmd for workflow '${workflowName}'`,
					"No bundled state machine found. Check that the workflow name matches a skill with a state.mmd file.",
				),
			);
		}),
	);

/**
 * Load a state machine from the filesystem by scanning plugin directories.
 */
const loadFromFilesystem = (
	workflowName: string,
): TE.TaskEither<CLIError, StateMachine> =>
	TE.tryCatch(
		async () => {
			const projectRoot = getProjectRoot();

			for (const pluginName of PLUGIN_NAMES) {
				const filePath = join(
					projectRoot,
					"plugins",
					pluginName,
					"skills",
					workflowName,
					"state.mmd",
				);

				try {
					const file = Bun.file(filePath);
					if (await file.exists()) {
						const content = await file.text();
						const result = parseAndTransform(workflowName, content);
						if (result._tag === "Left") {
							throw new Error(`Parse error: ${JSON.stringify(result.left)}`);
						}
						cache.set(workflowName, result.right);
						return result.right;
					}
				} catch (err) {
					if (err instanceof Error && err.message.startsWith("Parse error:")) {
						throw err;
					}
					// File not found in this plugin, try next
				}
			}

			throw new Error(`No state.mmd found for workflow '${workflowName}'`);
		},
		(err): CLIError => {
			const message = err instanceof Error ? err.message : String(err);
			if (message.startsWith("Parse error:")) {
				return runtimeError(message);
			}
			return notFoundError(
				`state.mmd for workflow '${workflowName}'`,
				"Ensure a state.mmd file exists in the skill directory (e.g., plugins/dev/skills/{name}/state.mmd).",
			);
		},
	);

/**
 * List workflows from bundled assets.
 */
const listFromBundle = (): TE.TaskEither<CLIError, readonly string[]> =>
	pipe(
		TE.fromEither(getBundledAssets()),
		TE.map((assets) => {
			const workflows: string[] = [];
			for (const pluginKey of PLUGIN_NAMES) {
				const plugin = assets.plugins[pluginKey];
				const stateMachines = plugin.stateMachines;
				if (!stateMachines || stateMachines.length === 0) continue;
				for (const sm of stateMachines) {
					workflows.push(sm.name);
				}
			}
			return workflows;
		}),
	);

/**
 * List workflows from filesystem by scanning plugin skill directories for state.mmd files.
 */
const listFromFilesystem = (): TE.TaskEither<CLIError, readonly string[]> =>
	TE.tryCatch(
		async () => {
			const projectRoot = getProjectRoot();
			const workflows: string[] = [];

			for (const pluginName of PLUGIN_NAMES) {
				const skillsDir = join(projectRoot, "plugins", pluginName, "skills");

				let skillDirs: string[];
				try {
					skillDirs = await readdir(skillsDir);
				} catch {
					continue;
				}

				for (const skillDir of skillDirs) {
					const stateMmdPath = join(skillsDir, skillDir, "state.mmd");
					try {
						const file = Bun.file(stateMmdPath);
						if (await file.exists()) {
							workflows.push(skillDir);
						}
					} catch {
						// Skip inaccessible entries
					}
				}
			}

			return workflows;
		},
		(err) =>
			runtimeError(
				`Failed to list workflows: ${err instanceof Error ? err.message : String(err)}`,
			),
	);
