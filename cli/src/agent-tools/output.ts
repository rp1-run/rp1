/**
 * JSON output formatting for agent-tools framework.
 * Provides utilities for creating standardized tool results.
 */

import type { ToolError, ToolResult } from "./models.js";

/**
 * Create a successful tool result.
 * Use when tool execution completed without errors.
 */
export const successResult = <T>(tool: string, data: T): ToolResult<T> => ({
	success: true,
	tool,
	data,
});

/**
 * Create a tool result with validation errors.
 * Use when validation found issues (e.g., invalid mermaid syntax).
 */
export const errorResult = <T>(
	tool: string,
	data: T,
	errors: readonly ToolError[],
): ToolResult<T> => ({
	success: false,
	tool,
	data,
	errors,
});

/**
 * Format a tool result as a compact JSON string.
 */
export const formatOutput = <T>(result: ToolResult<T>): string =>
	JSON.stringify(result);
