/**
 * Eval test harness entry point.
 * Exports utilities for creating isolated test environments.
 */

export { createTestEnvironment, cleanupTestEnvironment } from "./harness.js";
export type { TestEnvironment, HarnessOptions, FileSpec } from "./types.js";
