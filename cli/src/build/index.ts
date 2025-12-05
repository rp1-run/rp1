/**
 * Build module exports.
 */

// Models
export type {
  ClaudeCodeCommand,
  ClaudeCodeAgent,
  ClaudeCodeSkill,
  OpenCodeCommand,
  OpenCodeAgent,
  OpenCodeSkill,
  PlatformRegistry,
  PluginManifest,
  BuildConfig,
  ArtifactResult,
  BuildSummary,
} from "./models.js";

// Registry
export {
  defaultRegistry,
  getToolMapping,
  getDirectoryMapping,
} from "./registry.js";

// Parser
export { parseCommand, parseAgent, parseSkill } from "./parser.js";

// Transformations
export {
  transformCommand,
  transformAgent,
  transformSkill,
} from "./transformations.js";

// Generator
export {
  generateCommandFile,
  generateAgentFile,
  generateSkillFile,
  generateManifest,
} from "./generator.js";

// Validator
export {
  validateCommandSyntax,
  validateAgentSyntax,
  validateSkillSyntax,
  validateCommandSchema,
  validateAgentSchema,
  validateSkillSchema,
  validateCommand,
  validateAgent,
  validateSkill,
} from "./validator.js";

// Command
export { parseBuildArgs, executeBuild } from "./command.js";
