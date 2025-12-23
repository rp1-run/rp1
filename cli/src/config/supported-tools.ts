/**
 * TypeScript types and loader for the supported tools registry.
 * Provides type-safe access to the list of supported agentic tools.
 *
 * Source of truth: cli/src/config/supported-tools.yaml
 * The YAML is embedded at build time via `bun run generate:assets`.
 */

import { TOOLS_REGISTRY } from "./supported-tools.generated.js";

/**
 * A supported agentic tool that can host rp1 plugins.
 */
export interface SupportedTool {
	readonly id: string;
	readonly name: string;
	readonly binary: string;
	readonly min_version: string;
	readonly instruction_file: string;
	readonly install_url: string;
	readonly plugin_install_cmd: string | null;
	readonly capabilities: readonly string[];
}

/**
 * The tools registry containing all supported tools.
 */
export interface ToolsRegistry {
	readonly version: string;
	readonly tools: readonly SupportedTool[];
}

/**
 * Load the tools registry.
 * Returns embedded data generated from supported-tools.yaml at build time.
 */
export const loadToolsRegistry = async (): Promise<ToolsRegistry> => {
	return TOOLS_REGISTRY as ToolsRegistry;
};

/**
 * Find a tool by its ID in the registry.
 */
export const findToolById = (
	registry: ToolsRegistry,
	id: string,
): SupportedTool | undefined => registry.tools.find((t) => t.id === id);

/**
 * Find a tool by its binary name in the registry.
 */
export const findToolByBinary = (
	registry: ToolsRegistry,
	binary: string,
): SupportedTool | undefined => registry.tools.find((t) => t.binary === binary);
