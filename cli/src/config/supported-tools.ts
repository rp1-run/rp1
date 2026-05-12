/**
 * TypeScript types and loader for the supported tools registry.
 * Provides type-safe access to the list of supported agentic tools.
 *
 * Source of truth: cli/src/config/supported-tools.yaml
 * The YAML is embedded at build time via `bun run generate:assets`.
 */

import { TOOLS_REGISTRY } from "./supported-tools.generated.js";

export type ToolSupportLevel = "stable" | "experimental" | "degraded";

/**
 * A supported agentic tool that can host rp1 plugins.
 */
export interface SupportedTool {
	readonly id: string;
	readonly name: string;
	readonly enabled?: boolean;
	readonly binary: string;
	readonly min_version: string;
	readonly version_command?: readonly string[];
	readonly detect_command?: readonly string[];
	readonly instruction_file: string;
	readonly install_url: string;
	readonly plugin_install_cmd: string | null;
	readonly supportLevel?: ToolSupportLevel;
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

/**
 * Filter registry to only enabled tools.
 * Tools with `enabled` omitted or undefined are treated as enabled (backward compatibility).
 */
export const getEnabledTools = (
	registry: ToolsRegistry,
): readonly SupportedTool[] =>
	registry.tools.filter((t) => t.enabled !== false);

export const getToolSupportLevel = (tool: SupportedTool): ToolSupportLevel =>
	tool.supportLevel ?? "stable";

export const getDefaultInstallTools = (
	registry: ToolsRegistry,
): readonly SupportedTool[] =>
	getEnabledTools(registry).filter(
		(tool) => getToolSupportLevel(tool) === "stable",
	);

/**
 * Check if a specific tool is enabled in the registry.
 * Returns true if the tool is not found (unknown tools are not gated).
 * Tools with `enabled` omitted or undefined are treated as enabled.
 */
export const isToolEnabled = (
	registry: ToolsRegistry,
	toolId: string,
): boolean => {
	const tool = registry.tools.find((t) => t.id === toolId);
	return tool?.enabled !== false;
};
