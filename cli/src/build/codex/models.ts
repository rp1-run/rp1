/**
 * Type-safe data models for Codex build artifacts.
 */

import type { SkillMetadata } from "../models.js";

/** Codex skill output with transformed content and metadata. */
export interface CodexSkill {
	readonly name: string;
	readonly description: string;
	readonly allowedTools?: string;
	readonly content: string;
	readonly supportingFiles: readonly string[];
	readonly metadata?: SkillMetadata;
}

/** Codex agent role definition for TOML output. */
export interface CodexAgent {
	readonly name: string;
	readonly description: string;
	readonly model: string;
	readonly roleType: CodexRoleType;
	readonly developerInstructions: string;
}

/** Slim config entry for main config.toml [agents.*] sections. */
export interface CodexConfigEntry {
	readonly name: string;
	readonly description: string;
	readonly configFile: string;
}

/** Codex role types for agent categorization. */
export type CodexRoleType = "worker" | "explorer" | "reviewer" | "default";

/** openai.yaml metadata for skill directories. */
export interface OpenaiYamlConfig {
	readonly display_name: string;
	readonly allow_implicit_invocation: false;
}

/** Codex build manifest per plugin. */
export interface CodexManifest {
	readonly plugin: string;
	readonly version: string;
	readonly codexVersionTested: string;
	readonly artifacts: {
		readonly skills: readonly string[];
		readonly agents: readonly string[];
	};
	readonly installation: {
		readonly skillsDir: string;
		readonly configFile: string;
	};
}
