/**
 * Type-safe data models for agent-tools framework.
 * Provides standard JSON envelope structure for all agent tools.
 */

/**
 * Standard JSON envelope for all agent tools.
 * All tool results conform to this structure for consistent parsing by AI agents.
 */
export interface ToolResult<T> {
	readonly success: boolean;
	readonly tool: string;
	readonly data: T;
	readonly errors?: readonly ToolError[];
}

/**
 * Generic tool error with optional location information.
 * Used in the errors array when validation or execution fails.
 */
export interface ToolError {
	readonly message: string;
	readonly line?: number;
	readonly column?: number;
	readonly context?: string;
}
