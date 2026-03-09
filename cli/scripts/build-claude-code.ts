#!/usr/bin/env bun

/**
 * Standalone script to build Claude Code artifacts.
 * Produces Claude Code-optimized skill and agent files in dist/claude-code/.
 *
 * Usage:
 *   bun run scripts/build-claude-code.ts [options]
 *
 * Options:
 *   -o, --output-dir <dir>   OpenCode output directory (default: dist/opencode/)
 *                             Claude Code output is derived as sibling (dist/claude-code/)
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
const result = await executeBuild(
	[...args, "--platform", "claude-code"],
	logger,
)();

if (E.isLeft(result)) {
	process.exit(1);
}
