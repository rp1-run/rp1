/**
 * Agent-tools framework: tool registry and dispatch mechanism.
 * Provides infrastructure for registering and executing agent tools.
 */

import type * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../shared/errors.js";
import type { ToolResult } from "./models.js";

/**
 * Tool execution function signature.
 * All tools must implement this interface.
 */
export type ToolExecutor<T> = (
	input: string,
	options: ToolOptions,
) => TE.TaskEither<CLIError, ToolResult<T>>;

/**
 * Tool options passed from CLI.
 * Common options available to all tools.
 */
export interface ToolOptions {
	readonly timeout?: number;
	readonly inputSource: "file" | "stdin";
	readonly filePath?: string;
}

/**
 * Tool registration entry.
 * Used internally by the registry.
 */
interface ToolEntry {
	readonly name: string;
	readonly description: string;
	readonly execute: ToolExecutor<unknown>;
}

/** Tool registry - lazily populated */
const toolRegistry = new Map<string, ToolEntry>();

/**
 * Register a tool with the framework.
 * Called at module load time by each tool implementation.
 */
export const registerTool = (entry: ToolEntry): void => {
	toolRegistry.set(entry.name, entry);
};

/**
 * Get a tool by name from the registry.
 * Returns undefined if tool is not registered.
 */
export const getTool = (name: string): ToolEntry | undefined => {
	return toolRegistry.get(name);
};

/**
 * List all registered tools.
 * Returns a readonly array of tool entries.
 */
export const listTools = (): readonly ToolEntry[] => {
	return Array.from(toolRegistry.values());
};
