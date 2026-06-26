/**
 * Shared result vocabulary for the teach-me validation gate (T6).
 *
 * Both the static gate ({@link ./static-checks}) and the dynamic Puppeteer gate
 * ({@link ./browser-checks}) report a list of named {@link GateCheck}s. A check
 * failing is distinct from the gate being unable to run at all (e.g. a missing
 * Puppeteer-pinned Chrome): the former is a `GateResult` with `passed: false`,
 * the latter is a `Left(CLIError)` from the browser gate. The command combines
 * the per-gate results, names any failing check, and exits non-zero on failure
 * (REQ-008).
 */

/** A single named gate assertion and its outcome. */
export interface GateCheck {
	/** Stable, human-readable check name (named in the failure report). */
	readonly name: string;
	/** Whether the assertion held. */
	readonly passed: boolean;
	/** Actionable detail shown when the check fails (e.g. the offending value). */
	readonly detail?: string;
}

/** The outcome of running one gate: its checks and the aggregate pass/fail. */
export interface GateResult {
	/** True only when every check passed. */
	readonly passed: boolean;
	/** Every check the gate ran, in order. */
	readonly checks: readonly GateCheck[];
}

/** Build a `GateResult` from its checks, deriving `passed` as the conjunction. */
export function gateResult(checks: readonly GateCheck[]): GateResult {
	return { passed: checks.every((check) => check.passed), checks };
}

/** Merge several gate results into one (checks concatenated in order). */
export function combineResults(results: readonly GateResult[]): GateResult {
	return gateResult(results.flatMap((result) => result.checks));
}
