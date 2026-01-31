/**
 * Type definitions for transform-args module.
 * Provides schema-driven argument parsing and hierarchical settings management.
 */

/**
 * Positional argument from argument-hint schema.
 * Represents a single positional argument with its constraints.
 */
export interface PositionalArg {
	readonly name: string;
	readonly required: boolean;
	readonly variadic: boolean;
}

/**
 * Flag argument from argument-hint schema.
 * Represents a command-line flag with optional default value.
 */
export interface FlagArg {
	readonly name: string;
	readonly defaultValue: string | boolean;
	readonly isBoolean: boolean;
}

/**
 * Parsed argument-hint schema.
 * Contains all positional arguments and flags extracted from a command's frontmatter.
 */
export interface ArgumentSchema {
	readonly positional: readonly PositionalArg[];
	readonly flags: readonly FlagArg[];
	readonly raw: string;
}

/**
 * Settings file structure.
 * Represents the TOML settings file format with optional schema version
 * and namespace-organized settings.
 */
export interface SettingsFile {
	readonly schema_version?: string;
	readonly global?: Record<string, unknown>;
	readonly [namespace: string]: Record<string, unknown> | string | undefined;
}

/**
 * Source tracking for merged settings values.
 * Indicates where each setting value originated.
 */
export type SettingsSource = "cli" | "local" | "global" | "default";

/**
 * Merged settings for a namespace.
 * Contains resolved values and tracks the source of each setting.
 */
export interface MergedSettings {
	readonly values: Record<string, unknown>;
	readonly source: Record<string, SettingsSource>;
}

/**
 * Result of argument transformation.
 * Contains the final variable values, any warnings, and metadata about the transformation.
 */
export interface TransformResult {
	readonly variables: Record<string, string>;
	readonly warnings: readonly string[];
	readonly schemaUsed: boolean;
	readonly namespace: string;
}

/**
 * Validation result for a single settings file.
 * Contains path, existence status, validity, and any error details.
 */
export interface FileValidation {
	readonly path: string;
	readonly exists: boolean;
	readonly valid: boolean;
	readonly error?: string;
	readonly line?: number;
}

/**
 * Combined validation result for all settings files.
 * Aggregates validation results for global and local settings files.
 */
export interface SettingsValidationResult {
	readonly valid: boolean;
	readonly globalFile: FileValidation | null;
	readonly localFile: FileValidation | null;
}
