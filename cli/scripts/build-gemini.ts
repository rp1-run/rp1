#!/usr/bin/env bun

/**
 * Standalone script to build Gemini CLI artifacts.
 * Produces Gemini extension bundle assets in dist/gemini/.
 *
 * Usage:
 *   bun run scripts/build-gemini.ts [options]
 *
 * Options:
 *   -o, --output-dir <dir>   OpenCode output directory (default: dist/opencode/)
 *                             Gemini output is derived as sibling (dist/gemini/)
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
const result = await executeBuild([...args, "--platform", "gemini"], logger)();

if (E.isLeft(result)) {
	process.exit(1);
}
