#!/usr/bin/env bun

/**
 * Standalone script to build Codex artifacts.
 * Runs the full build pipeline which produces both OpenCode and Codex output,
 * with Codex artifacts written to dist/codex/ (derived from OpenCode output dir).
 *
 * Usage:
 *   bun run scripts/build-codex.ts [options]
 *
 * Options:
 *   -o, --output-dir <dir>   OpenCode output directory (default: dist/opencode/)
 *                             Codex output is derived as sibling (dist/codex/)
 *   -p, --plugin <name>      Build specific plugin (base, dev, or all)
 *   --json                   Output results as JSON for CI/CD
 *   -h, --help               Show this help message
 */

import * as E from "fp-ts/lib/Either.js";
import { createLogger, LogLevel } from "../shared/logger.js";
import { executeBuild } from "../src/build/index.js";

const logger = createLogger({
	level: process.env.DEBUG ? LogLevel.DEBUG : LogLevel.INFO,
	color: process.stdout.isTTY ?? false,
});

const args = process.argv.slice(2);
const result = await executeBuild([...args, "--platform", "codex"], logger)();

if (E.isLeft(result)) {
	process.exit(1);
}
