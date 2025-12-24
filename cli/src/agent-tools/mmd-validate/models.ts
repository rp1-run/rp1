/**
 * Type-safe data models for mmd-validate tool.
 * Defines interfaces for Mermaid diagram extraction and validation results.
 */

/**
 * Extracted mermaid code block from markdown.
 * Preserves position information for error mapping back to source document.
 */
export interface DiagramBlock {
	readonly index: number;
	readonly content: string;
	readonly startLine: number;
	readonly endLine: number;
}

/**
 * Result of validating a single diagram.
 * Contains validation status and any errors encountered.
 */
export interface DiagramValidationResult {
	readonly index: number;
	readonly valid: boolean;
	readonly diagramType?: string;
	readonly startLine: number;
	readonly errors?: readonly DiagramError[];
}

/**
 * Detailed error from mermaid.parse().
 * Includes location information for agent self-correction.
 */
export interface DiagramError {
	readonly diagramIndex: number;
	readonly message: string;
	readonly line?: number;
	readonly column?: number;
	readonly context?: string;
}

/**
 * Validation summary statistics.
 * Provides counts for quick assessment of validation results.
 */
export interface ValidationSummary {
	readonly total: number;
	readonly valid: number;
	readonly invalid: number;
}

/**
 * Full validation data payload.
 * Contains all diagram results and summary statistics.
 */
export interface MmdValidateData {
	readonly diagrams: readonly DiagramValidationResult[];
	readonly summary: ValidationSummary;
}
