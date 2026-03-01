/**
 * Core command logic for eval attestation system.
 * Provides attest, verify, and status operations for tracking prompt changes.
 */

import path from "node:path";
import { spawnSync } from "bun";
import * as A from "fp-ts/Array";
import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import { buildDependencyGraph, PLUGIN_SUFFIXES } from "./deps-graph.js";
import { loadManifest, saveManifest, updateManifest } from "./manifest.js";
import { computeDepsHash, computePromptHash } from "./prompt-hash.js";
import type {
	DependencyGraph,
	HashResult,
	SkillAttestation,
	VerificationResult,
	VerificationSummary,
} from "./types.js";

/**
 * Promptfoo output structure for parsing eval results.
 */
interface PromptfooOutput {
	evalId: string;
	results: {
		version: number;
		timestamp: string;
		prompts: Array<{
			id: string;
			metrics: {
				score: number;
				testPassCount: number;
				testFailCount: number;
				testErrorCount: number;
			};
		}>;
	};
}

/**
 * Map suite path to skill key.
 * e.g., "rp1-dev/build-fast" -> "rp1-dev:build-fast"
 */
function suiteToSkillKey(suite: string): string {
	return suite.replace("/", ":");
}

/**
 * Extract suite name from output filename.
 * Handles both fixed and legacy timestamped filenames:
 * - "rp1-dev-build-fast.json" -> "rp1-dev/build-fast" (fixed)
 * - "rp1-dev-build-fast-2026-01-22T10-30-00.json" -> "rp1-dev/build-fast" (legacy)
 *
 * @param outputPath - Path to the output file
 * @returns Suite path in format "plugin/skill"
 */
export function extractSuiteFromFilename(outputPath: string): string {
	const filename = path.basename(outputPath, ".json");
	// Remove timestamp suffix if present (pattern: -YYYY-MM-DDTHH-MM-SS)
	// This handles legacy timestamped files while fixed filenames pass through unchanged
	const withoutTimestamp = filename.replace(
		/-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/,
		"",
	);
	// Convert plugin prefix separator to slash
	// Pattern: rp1-{plugin}-{skill} -> rp1-{plugin}/{skill}
	// Use PLUGIN_SUFFIXES as single source of truth
	const pluginPattern = new RegExp(
		`^(rp1-(?:${PLUGIN_SUFFIXES.join("|")}))-(.+)$`,
	);
	const pluginMatch = withoutTimestamp.match(pluginPattern);
	if (pluginMatch) {
		return `${pluginMatch[1]}/${pluginMatch[2]}`;
	}
	// Fallback: convert first dash to slash
	return withoutTimestamp.replace("-", "/");
}

/**
 * Detect pass rate from promptfoo output.
 * Returns true only if all prompts have zero failures and zero errors.
 *
 * @param output - Parsed promptfoo output
 * @returns True if 100% pass rate, false otherwise
 */
export function detectPassRate(output: PromptfooOutput): boolean {
	const { prompts } = output.results;
	if (!prompts || prompts.length === 0) {
		return false;
	}
	return prompts.every(
		(prompt) =>
			prompt.metrics.testFailCount === 0 && prompt.metrics.testErrorCount === 0,
	);
}

/**
 * Map suite path to skill file path (relative to repo root).
 * e.g., "rp1-dev/build-fast" -> "plugins/dev/skills/build-fast/SKILL.md"
 */
function suiteToSkillPath(suite: string): string {
	const [plugin, skill] = suite.split("/");
	const pluginDir = plugin.replace("rp1-", "");
	return `plugins/${pluginDir}/skills/${skill}/SKILL.md`;
}

/**
 * Get current git commit SHA (short form).
 */
async function getGitCommit(): Promise<string> {
	const proc = Bun.spawn(["git", "rev-parse", "--short", "HEAD"], {
		stdout: "pipe",
	});
	const output = await new Response(proc.stdout).text();
	await proc.exited;
	return output.trim();
}

/**
 * Get skill version from frontmatter metadata map.
 * Looks for `metadata.version` in SKILL.md frontmatter.
 * Falls back to top-level `version:` for backward compat.
 */
async function getSkillVersion(skillPath: string): Promise<string> {
	const file = Bun.file(skillPath);
	const content = await file.text();
	const metadataMatch = content.match(
		/^---[\s\S]*?metadata:\s*\n[\s\S]*?version:\s*([^\n]+)/,
	);
	if (metadataMatch) {
		return metadataMatch[1].trim();
	}
	const topLevelMatch = content.match(/^---[\s\S]*?version:\s*([^\n]+)/);
	return topLevelMatch ? topLevelMatch[1].trim() : "0.0.0";
}

/**
 * Run eval suite via promptfoo.
 * Returns true only on 100% pass (exit code 0).
 * Note: Uses bunx which delegates to Node.js for better-sqlite3 compat.
 *
 * @param suite - Suite path (e.g., "rp1-dev/build-fast")
 * @param outputPath - Path to save JSON results (relative to evals/)
 * @param concurrency - Max concurrent API calls (default: 1)
 */
function runEvalSuite(
	suite: string,
	outputPath: string,
	concurrency = 1,
): boolean {
	const configPath = `suites/${suite}/evals.yaml`;
	const args = [
		"bunx",
		"promptfoo",
		"eval",
		"-c",
		configPath,
		"--output",
		outputPath,
	];
	if (concurrency > 1) {
		args.push("-j", String(concurrency));
	}
	// Use spawnSync to ensure stdout/stderr are fully flushed before returning
	// (avoids race condition where bunx delegates to Node.js which may not flush)
	const result = spawnSync(args, {
		cwd: "evals",
		stdout: "inherit",
		stderr: "inherit",
	});
	return result.exitCode === 0;
}

/**
 * Compute hashes for all files in dependency graph.
 */
function computeAllHashes(
	graph: DependencyGraph,
): TE.TaskEither<Error, readonly HashResult[]> {
	const allPaths = [graph.skillPath, ...graph.agents, ...graph.skills];
	return pipe(
		allPaths,
		A.map(computePromptHash),
		A.sequence(TE.ApplicativePar),
	);
}

/**
 * Attest a skill after running its eval suite.
 * Only updates attestation on 100% pass.
 * Uses a fixed output filename per suite (overwrites on each run).
 *
 * @param suite - Suite path (e.g., "rp1-dev/build-fast")
 * @param concurrency - Max concurrent API calls (default: 1)
 * @returns TaskEither with result indicating whether attestation was updated
 */
export function attestCommand(
	suite: string,
	concurrency = 1,
): TE.TaskEither<Error, { updated: boolean; message: string }> {
	const skillKey = suiteToSkillKey(suite);
	const skillPath = suiteToSkillPath(suite);
	const timestamp = new Date().toISOString();
	// Fixed filename per suite (no timestamp accumulation)
	const resultFile = `output/${suite.replace("/", "-")}.json`;

	return pipe(
		TE.Do,
		TE.bind("passed", () =>
			TE.tryCatch(
				async () => runEvalSuite(suite, resultFile, concurrency),
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
					TE.bind("graph", () => buildDependencyGraph(skillPath)),
					TE.bind("hashes", ({ graph }) => computeAllHashes(graph)),
					TE.bind("version", () =>
						TE.tryCatch(
							() => getSkillVersion(skillPath),
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
						const attestation: SkillAttestation = {
							prompt_hash: hashes.find((h) => h.path === skillPath)?.hash || "",
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
							skillKey,
							attestation,
							hashes,
						);
						return pipe(
							saveManifest(updatedManifest),
							TE.map(() => ({
								updated: true as boolean,
								message: `Attestation updated for ${skillKey}`,
							})),
						);
					}),
				);
			},
		),
	);
}

/**
 * Generate attestation from existing eval output file.
 * Does NOT run evals or spawn any external processes.
 * Only updates attestation if 100% pass rate detected.
 *
 * @param outputPath - Path to promptfoo output JSON file
 * @returns TaskEither with result indicating whether attestation was updated
 */
export function attestFromOutput(
	outputPath: string,
): TE.TaskEither<Error, { updated: boolean; message: string }> {
	return pipe(
		TE.Do,
		TE.bind("output", () =>
			TE.tryCatch(
				async () => {
					const file = Bun.file(outputPath);
					if (!(await file.exists())) {
						throw new Error(`Output file not found: ${outputPath}`);
					}
					return (await file.json()) as PromptfooOutput;
				},
				(e) => new Error(`Failed to read output file: ${e}`),
			),
		),
		TE.chain(({ output }) => {
			const passed = detectPassRate(output);
			const suite = extractSuiteFromFilename(outputPath);
			const skillKey = suiteToSkillKey(suite);
			const skillPath = suiteToSkillPath(suite);
			const timestamp = output.results.timestamp;

			if (!passed) {
				return TE.right({
					updated: false as boolean,
					message: `Eval suite ${suite} did not pass (failures or errors detected). Attestation not updated.`,
				});
			}

			return pipe(
				TE.Do,
				TE.bind("manifest", () => loadManifest()),
				TE.bind("graph", () => buildDependencyGraph(skillPath)),
				TE.bind("hashes", ({ graph }) => computeAllHashes(graph)),
				TE.bind("version", () =>
					TE.tryCatch(
						() => getSkillVersion(skillPath),
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
					const attestation: SkillAttestation = {
						prompt_hash: hashes.find((h) => h.path === skillPath)?.hash || "",
						deps_hash: computeDepsHash(hashes),
						version,
						last_eval: {
							passed: true,
							timestamp,
							git_commit: gitCommit,
							result_file: outputPath,
						},
					};

					const updatedManifest = updateManifest(
						manifest,
						skillKey,
						attestation,
						hashes,
					);
					return pipe(
						saveManifest(updatedManifest),
						TE.map(() => ({
							updated: true as boolean,
							message: `Attestation updated for ${skillKey}`,
						})),
					);
				}),
			);
		}),
	);
}

/**
 * Verify a single skill's attestation against current file hashes.
 */
function verifySkill(
	skillKey: string,
	attestation: SkillAttestation,
): TE.TaskEither<Error, VerificationResult> {
	const suite = skillKey.replace(":", "/");
	const skillPath = suiteToSkillPath(suite);

	return pipe(
		buildDependencyGraph(skillPath),
		TE.chain((graph) => computeAllHashes(graph)),
		TE.map((hashes): VerificationResult => {
			const currentDepsHash = computeDepsHash(hashes);

			if (currentDepsHash !== attestation.deps_hash) {
				return {
					skill: skillKey,
					status: "stale",
					reason: "Dependency hash mismatch",
					expected_hash: attestation.deps_hash,
					actual_hash: currentDepsHash,
				};
			}

			return {
				skill: skillKey,
				status: "current",
			};
		}),
		TE.orElse((error) =>
			TE.right<Error, VerificationResult>({
				skill: skillKey,
				status: "missing",
				reason: error.message,
			}),
		),
	);
}

/**
 * Verify attestation currency for all skills in manifest.
 * Compares current file hashes against stored attestations.
 *
 * @returns TaskEither with VerificationSummary containing results for all skills
 */
export function verifyAttestations(): TE.TaskEither<
	Error,
	VerificationSummary
> {
	return pipe(
		loadManifest(),
		TE.chain((manifest) =>
			pipe(
				Object.entries(manifest.skills),
				A.map(([key, attestation]) => verifySkill(key, attestation)),
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
 * Get status of all skills needing re-attestation.
 * Alias for verifyAttestations with same output format.
 *
 * @returns TaskEither with VerificationSummary showing current/stale/missing counts
 */
export function getStatus(): TE.TaskEither<Error, VerificationSummary> {
	return verifyAttestations();
}
