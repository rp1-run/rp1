/**
 * State machine loader with filesystem, bundle, and cache support.
 *
 * Discovery strategy (in priority order):
 * 1. In-memory cache (process-lifetime Map)
 * 2. Bundled assets (compiled binary mode)
 * 3. Filesystem scan (dev/source mode)
 *
 * Parse pipeline: read raw text -> parseAndTransform() -> cache -> return
 *
 * Filesystem mode extracts embedded stateDiagram-v2 blocks from
 * SKILL.md and agent .md files via extractStateMachineMermaid().
 */

import { readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
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
import { extractStateMachineMermaid } from "./extractor.js";
import type { StateMachine } from "./models.js";
import { deserializeStateMachine } from "./serialization.js";
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
 * Try to extract a state machine mermaid block from a file on disk.
 * Returns the extracted mermaid content or null if file doesn't exist
 * or has no embedded state machine.
 */
const tryExtractFromFile = async (filePath: string): Promise<string | null> => {
	try {
		const file = Bun.file(filePath);
		if (await file.exists()) {
			const content = await file.text();
			return extractStateMachineMermaid(content);
		}
	} catch {
		/* skip */
	}
	return null;
};

/**
 * Load a state machine by name (skill or agent name).
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
 * List all available workflows (skills and agents with embedded state machines).
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
				if (!plugin) continue;
				const stateMachines = plugin.stateMachines;
				if (!stateMachines || stateMachines.length === 0) continue;

				const entry = stateMachines.find((sm) => sm.name === workflowName);
				if (entry) {
					const getContent: TE.TaskEither<CLIError, string> = entry.content
						? TE.right(entry.content)
						: pipe(
								TE.tryCatch(
									() => readEmbeddedFile(entry.path),
									(err) =>
										runtimeError(
											`Failed to read bundled state machine for '${workflowName}': ${err}`,
										),
								),
								TE.chain((readResult) => TE.fromEither(readResult)),
							);

					return pipe(
						getContent,
						TE.chain((content) => {
							const trimmed = content.trimStart();
							const parseResult = trimmed.startsWith("{")
								? deserializeStateMachine(content)
								: parseAndTransform(workflowName, content);
							return TE.fromEither(parseResult);
						}),
						TE.map((machine) => {
							cache.set(workflowName, machine);
							return machine;
						}),
					);
				}
			}
			return TE.left(
				notFoundError(
					`state machine for '${workflowName}'`,
					"No bundled state machine found. Check that the name matches a skill or agent with an embedded state machine.",
				),
			);
		}),
	);

/**
 * Load a state machine from the filesystem by scanning plugin directories.
 * Searches SKILL.md files for skills and agent .md files for agents.
 */
const loadFromFilesystem = (
	workflowName: string,
): TE.TaskEither<CLIError, StateMachine> =>
	TE.tryCatch(
		async () => {
			const projectRoot = getProjectRoot();

			for (const pluginName of PLUGIN_NAMES) {
				const skillPath = join(
					projectRoot,
					"plugins",
					pluginName,
					"skills",
					workflowName,
					"SKILL.md",
				);

				const extracted = await tryExtractFromFile(skillPath);
				if (extracted) {
					const result = parseAndTransform(workflowName, extracted);
					if (result._tag === "Left") {
						throw new Error(`Parse error: ${JSON.stringify(result.left)}`);
					}
					cache.set(workflowName, result.right);
					return result.right;
				}
			}

			for (const pluginName of PLUGIN_NAMES) {
				const agentPath = join(
					projectRoot,
					"plugins",
					pluginName,
					"agents",
					`${workflowName}.md`,
				);

				const extracted = await tryExtractFromFile(agentPath);
				if (extracted) {
					const result = parseAndTransform(workflowName, extracted);
					if (result._tag === "Left") {
						throw new Error(`Parse error: ${JSON.stringify(result.left)}`);
					}
					cache.set(workflowName, result.right);
					return result.right;
				}
			}

			throw new Error(`No embedded state machine found for '${workflowName}'`);
		},
		(err): CLIError => {
			const message = err instanceof Error ? err.message : String(err);
			if (message.startsWith("Parse error:")) {
				return runtimeError(message);
			}
			return notFoundError(
				`state machine for '${workflowName}'`,
				"Ensure a ## STATE-MACHINE section with a stateDiagram-v2 mermaid block exists in the SKILL.md or agent .md file.",
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
				if (!plugin) continue;
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
 * List workflows from filesystem by scanning SKILL.md and agent .md files
 * for embedded state machines.
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
					skillDirs = [];
				}

				for (const skillDir of skillDirs) {
					const skillMdPath = join(skillsDir, skillDir, "SKILL.md");
					const extracted = await tryExtractFromFile(skillMdPath);
					if (extracted) {
						workflows.push(skillDir);
					}
				}

				const agentsDir = join(projectRoot, "plugins", pluginName, "agents");
				let agentFiles: string[];
				try {
					agentFiles = await readdir(agentsDir);
				} catch {
					agentFiles = [];
				}

				for (const agentFile of agentFiles) {
					if (!agentFile.endsWith(".md")) continue;
					const agentPath = join(agentsDir, agentFile);
					const extracted = await tryExtractFromFile(agentPath);
					if (extracted) {
						const agentName = basename(agentFile, ".md");
						workflows.push(agentName);
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
