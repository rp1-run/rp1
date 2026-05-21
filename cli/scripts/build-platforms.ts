#!/usr/bin/env bun

/**
 * Build artifacts for all platforms (Claude Code, OpenCode, Codex, Copilot, Antigravity).
 * Produces dist/claude-code/, dist/opencode/, dist/codex/, dist/copilot/, and dist/antigravity/ directories.
 *
 * Usage:
 *   bun run scripts/build-platforms.ts [options]
 *
 * Options:
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
const result = await executeBuild([...args, "--platform", "all"], logger)();

if (E.isLeft(result)) {
	process.exit(1);
}
