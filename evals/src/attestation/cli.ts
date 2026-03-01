#!/usr/bin/env bun
/**
 * CLI entry point for eval attestation commands.
 * Parses command line args and dispatches to appropriate function.
 *
 * Usage:
 *   bun run src/attestation/cli.ts attest <suite>
 *   bun run src/attestation/cli.ts verify
 *   bun run src/attestation/cli.ts status
 */

import * as E from "fp-ts/Either";
import {
	attestCommand,
	attestFromOutput,
	getStatus,
	verifyAttestations,
} from "./commands.js";

const USAGE = `
Usage: bun run src/attestation/cli.ts <command> [args]

Commands:
  attest <suite> [concurrency]   Run eval suite and update attestation on pass
                                 Example: attest rp1-dev/build-fast
                                 Example: attest rp1-dev/build-fast 6

  attest-from-output <file>      Generate attestation from existing eval output
                                 Does NOT run evals or spawn Claude processes
                                 Example: attest-from-output output/rp1-dev-build-fast-2026-01-22T10-30-00.json

  verify                         Verify all attestations are current
                                 Exit code 0 if all current, 1 if any stale/missing

  status                         Show skills needing re-attestation
                                 Displays summary of current/stale/missing counts
`;

/**
 * Format verification summary for console output.
 */
function formatSummary(summary: {
	passed: boolean;
	total: number;
	current: number;
	stale: number;
	missing: number;
	results: readonly {
		command: string;
		status: string;
		reason?: string;
	}[];
}): string {
	const lines: string[] = [];

	lines.push("\nAttestation Status");
	lines.push("==================");
	lines.push(`Total:   ${summary.total}`);
	lines.push(`Current: ${summary.current}`);
	lines.push(`Stale:   ${summary.stale}`);
	lines.push(`Missing: ${summary.missing}`);
	lines.push("");

	if (summary.stale > 0 || summary.missing > 0) {
		lines.push("Skills needing attention:");
		for (const result of summary.results) {
			if (result.status !== "current") {
				lines.push(`  - ${result.skill} [${result.status}]`);
				if (result.reason) {
					lines.push(`    Reason: ${result.reason}`);
				}
			}
		}
		lines.push("");
	}

	lines.push(
		summary.passed
			? "All attestations current."
			: "Some attestations need updating.",
	);

	return lines.join("\n");
}

async function main(): Promise<void> {
	const args = Bun.argv.slice(2);

	if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
		console.log(USAGE);
		process.exit(0);
	}

	const command = args[0];

	if (command === "attest") {
		const suite = args[1];
		if (!suite) {
			console.error("Error: Suite path required");
			console.error("Usage: attest <suite> [concurrency]");
			console.error("Example: attest rp1-dev/build-fast");
			console.error("Example: attest rp1-dev/build-fast 6");
			process.exit(1);
		}

		const concurrency = args[2] ? parseInt(args[2], 10) : 1;
		if (Number.isNaN(concurrency) || concurrency < 1) {
			console.error("Error: Concurrency must be a positive integer");
			process.exit(1);
		}

		console.log(
			`Running eval suite: ${suite}${concurrency > 1 ? ` (concurrency: ${concurrency})` : ""}`,
		);
		const result = await attestCommand(suite, concurrency)();

		if (E.isLeft(result)) {
			console.error(`Error: ${result.left.message}`);
			process.exit(1);
		}

		console.log(result.right.message);
		process.exit(result.right.updated ? 0 : 1);
	} else if (command === "attest-from-output") {
		const outputFile = args[1];
		if (!outputFile) {
			console.error("Error: Output file path required");
			console.error("Usage: attest-from-output <output-file>");
			console.error(
				"Example: attest-from-output output/rp1-dev-build-fast-2026-01-22T10-30-00.json",
			);
			process.exit(1);
		}

		console.log(`Generating attestation from output: ${outputFile}`);
		const result = await attestFromOutput(outputFile)();

		if (E.isLeft(result)) {
			console.error(`Error: ${result.left.message}`);
			process.exit(1);
		}

		console.log(result.right.message);
		process.exit(result.right.updated ? 0 : 1);
	} else if (command === "verify") {
		const result = await verifyAttestations()();

		if (E.isLeft(result)) {
			console.error(`Error: ${result.left.message}`);
			process.exit(1);
		}

		console.log(formatSummary(result.right));
		process.exit(result.right.passed ? 0 : 1);
	} else if (command === "status") {
		const result = await getStatus()();

		if (E.isLeft(result)) {
			console.error(`Error: ${result.left.message}`);
			process.exit(1);
		}

		console.log(formatSummary(result.right));
		process.exit(0);
	} else {
		console.error(`Unknown command: ${command}`);
		console.log(USAGE);
		process.exit(1);
	}
}

main().catch((error) => {
	console.error("Unexpected error:", error);
	process.exit(1);
});
