/**
 * Core command logic for eval attestation system.
 * Provides attest, verify, and status operations for tracking prompt changes.
 */

import { spawn } from "bun";
import * as A from "fp-ts/Array";
import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import { buildDependencyGraph } from "./deps-graph.js";
import { loadManifest, saveManifest, updateManifest } from "./manifest.js";
import { computeDepsHash, computePromptHash } from "./prompt-hash.js";
import type {
	CommandAttestation,
	DependencyGraph,
	HashResult,
	VerificationResult,
	VerificationSummary,
} from "./types.js";

/**
 * Map suite path to command key.
 * e.g., "rp1-dev/build-fast" -> "rp1-dev:build-fast"
 */
function suiteToCommandKey(suite: string): string {
	return suite.replace("/", ":");
}

/**
 * Map suite path to command file path.
 * e.g., "rp1-dev/build-fast" -> "plugins/dev/commands/build-fast.md"
 */
function suiteToCommandPath(suite: string): string {
	const [plugin, command] = suite.split("/");
	const pluginDir = plugin.replace("rp1-", "");
	return `plugins/${pluginDir}/commands/${command}.md`;
}

/**
 * Get current git commit SHA (short form).
 */
async function getGitCommit(): Promise<string> {
	const proc = spawn(["git", "rev-parse", "--short", "HEAD"], {
		stdout: "pipe",
	});
	const output = await new Response(proc.stdout).text();
	await proc.exited;
	return output.trim();
}

/**
 * Get command version from frontmatter.
 */
async function getCommandVersion(commandPath: string): Promise<string> {
	const file = Bun.file(commandPath);
	const content = await file.text();
	const match = content.match(/^---[\s\S]*?version:\s*([^\n]+)/);
	return match ? match[1].trim() : "0.0.0";
}

/**
 * Run eval suite via promptfoo.
 * Returns true only on 100% pass (exit code 0).
 * Note: This runs from the repository root.
 */
async function runEvalSuite(suite: string): Promise<boolean> {
	const configPath = `evals/suites/${suite}/config.yaml`;
	const proc = spawn(["bun", "x", "promptfoo", "eval", "-c", configPath], {
		stdout: "inherit",
		stderr: "inherit",
	});
	const exitCode = await proc.exited;
	return exitCode === 0;
}

/**
 * Compute hashes for all files in dependency graph.
 */
function computeAllHashes(
	graph: DependencyGraph,
): TE.TaskEither<Error, readonly HashResult[]> {
	const allPaths = [graph.commandPath, ...graph.agents, ...graph.skills];
	return pipe(
		allPaths,
		A.map(computePromptHash),
		A.sequence(TE.ApplicativePar),
	);
}

/**
 * Attest a command after running its eval suite.
 * Only updates attestation on 100% pass.
 *
 * @param suite - Suite path (e.g., "rp1-dev/build-fast")
 * @returns TaskEither with result indicating whether attestation was updated
 */
export function attestCommand(
	suite: string,
): TE.TaskEither<Error, { updated: boolean; message: string }> {
	const commandKey = suiteToCommandKey(suite);
	const commandPath = suiteToCommandPath(suite);

	return pipe(
		TE.Do,
		TE.bind("passed", () =>
			TE.tryCatch(
				() => runEvalSuite(suite),
				(e) => new Error(`Eval execution failed: ${e}`),
			),
		),
		TE.chain(
			({
				passed,
			}): TE.TaskEither<Error, { updated: boolean; message: string }> => {
				if (!passed) {
					return TE.right({
						updated: false as boolean,
						message: `Eval suite ${suite} did not pass. Attestation not updated.`,
					});
				}

				return pipe(
					TE.Do,
					TE.bind("manifest", () => loadManifest()),
					TE.bind("graph", () => buildDependencyGraph(commandPath)),
					TE.bind("hashes", ({ graph }) => computeAllHashes(graph)),
					TE.bind("version", () =>
						TE.tryCatch(
							() => getCommandVersion(commandPath),
							(e) => new Error(`Failed to get version: ${e}`),
						),
					),
					TE.bind("gitCommit", () =>
						TE.tryCatch(
							() => getGitCommit(),
							(e) => new Error(`Failed to get git commit: ${e}`),
						),
					),
					TE.chain(({ manifest, hashes, version, gitCommit }) => {
						const timestamp = new Date().toISOString();
						const resultFile = `output/${suite.replace("/", "-")}-${timestamp.slice(0, 10)}.json`;

						const attestation: CommandAttestation = {
							prompt_hash:
								hashes.find((h) => h.path === commandPath)?.hash || "",
							deps_hash: computeDepsHash(hashes),
							version,
							last_eval: {
								passed: true,
								timestamp,
								git_commit: gitCommit,
								result_file: resultFile,
							},
						};

						const updatedManifest = updateManifest(
							manifest,
							commandKey,
							attestation,
							hashes,
						);
						return pipe(
							saveManifest(updatedManifest),
							TE.map(() => ({
								updated: true as boolean,
								message: `Attestation updated for ${commandKey}`,
							})),
						);
					}),
				);
			},
		),
	);
}

/**
 * Verify a single command's attestation against current file hashes.
 */
function verifyCommand(
	commandKey: string,
	attestation: CommandAttestation,
): TE.TaskEither<Error, VerificationResult> {
	const suite = commandKey.replace(":", "/");
	const commandPath = suiteToCommandPath(suite);

	return pipe(
		buildDependencyGraph(commandPath),
		TE.chain((graph) => computeAllHashes(graph)),
		TE.map((hashes): VerificationResult => {
			const currentDepsHash = computeDepsHash(hashes);

			if (currentDepsHash !== attestation.deps_hash) {
				return {
					command: commandKey,
					status: "stale",
					reason: "Dependency hash mismatch",
					expected_hash: attestation.deps_hash,
					actual_hash: currentDepsHash,
				};
			}

			return {
				command: commandKey,
				status: "current",
			};
		}),
		TE.orElse((error) =>
			TE.right<Error, VerificationResult>({
				command: commandKey,
				status: "missing",
				reason: error.message,
			}),
		),
	);
}

/**
 * Verify attestation currency for all commands in manifest.
 * Compares current file hashes against stored attestations.
 *
 * @returns TaskEither with VerificationSummary containing results for all commands
 */
export function verifyAttestations(): TE.TaskEither<
	Error,
	VerificationSummary
> {
	return pipe(
		loadManifest(),
		TE.chain((manifest) =>
			pipe(
				Object.entries(manifest.commands),
				A.map(([key, attestation]) => verifyCommand(key, attestation)),
				A.sequence(TE.ApplicativePar),
			),
		),
		TE.map((results) => {
			const current = results.filter((r) => r.status === "current").length;
			const stale = results.filter((r) => r.status === "stale").length;
			const missing = results.filter((r) => r.status === "missing").length;

			return {
				passed: stale === 0 && missing === 0,
				total: results.length,
				current,
				stale,
				missing,
				results,
			};
		}),
	);
}

/**
 * Get status of all commands needing re-attestation.
 * Alias for verifyAttestations with same output format.
 *
 * @returns TaskEither with VerificationSummary showing current/stale/missing counts
 */
export function getStatus(): TE.TaskEither<Error, VerificationSummary> {
	return verifyAttestations();
}
