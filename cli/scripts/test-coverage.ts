#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { join } from "node:path";
import {
	formatCoveragePercent,
	meetsLineThreshold,
	summarizeCliLcovLineCoverage,
} from "./coverage-threshold.js";

const LINE_COVERAGE_THRESHOLD = 0.8;

const forwardedArgs = process.argv
	.slice(2)
	.filter((arg) => arg !== "--coverage");
const reporterArgs = coverageReporterArgs(forwardedArgs);
const testArgs = ["test", "--coverage", ...reporterArgs, ...forwardedArgs];

const testProcess = Bun.spawn(["bun", ...testArgs], {
	stdout: "inherit",
	stderr: "inherit",
	stdin: "inherit",
	env: process.env,
});
const testExitCode = await testProcess.exited;

if (testExitCode !== 0) {
	process.exit(testExitCode);
}

const lcovPath = join(process.cwd(), "coverage", "lcov.info");

if (!existsSync(lcovPath)) {
	console.error(`Coverage threshold check failed: missing ${lcovPath}`);
	process.exit(1);
}

const lcov = await Bun.file(lcovPath).text();
const summary = summarizeCliLcovLineCoverage(lcov);
const actual = formatCoveragePercent(summary.ratio);
const required = formatCoveragePercent(LINE_COVERAGE_THRESHOLD);

if (!meetsLineThreshold(summary, LINE_COVERAGE_THRESHOLD)) {
	console.error(
		`Coverage threshold failed: line coverage ${actual} is below required ${required}`,
	);
	process.exit(1);
}

console.log(
	`Coverage threshold passed: line coverage ${actual} meets required ${required}`,
);

function coverageReporterArgs(args: readonly string[]): string[] {
	const reporters = extractCoverageReporters(args);
	const defaults: string[] = [];

	if (reporters.length === 0) {
		defaults.push("--coverage-reporter=text");
	}

	if (!reporters.includes("lcov")) {
		defaults.push("--coverage-reporter=lcov");
	}

	return defaults;
}

function extractCoverageReporters(args: readonly string[]): string[] {
	const reporters: string[] = [];

	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];

		if (arg === "--coverage-reporter") {
			reporters.push(...splitReporters(args[i + 1]));
			i += 1;
			continue;
		}

		const prefix = "--coverage-reporter=";
		if (arg.startsWith(prefix)) {
			reporters.push(...splitReporters(arg.slice(prefix.length)));
		}
	}

	return reporters;
}

function splitReporters(value: string | undefined): string[] {
	if (!value) return [];

	return value
		.split(",")
		.map((reporter) => reporter.trim())
		.filter((reporter) => reporter.length > 0);
}
