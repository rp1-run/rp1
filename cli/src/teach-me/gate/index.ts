/**
 * Public surface for the teach-me validation gate (T6).
 *
 * The gate has two halves the `validate` command runs against a rendered
 * `lesson.html`:
 *
 * - {@link runStaticGate} — fast, browser-free checks (size, self-containment,
 *   no runtime library, repo `file:line` resolution, references-when-research).
 * - {@link runBrowserGate} — a headless `file://` load asserting zero external
 *   network, no console errors, and a11y of controls/diagrams.
 *
 * {@link assertSelfContained} exposes just the self-containment subset of the
 * static checks for the `export` command (T7), which re-asserts that a rendered
 * artifact is standalone without the repo-provenance checks.
 *
 * {@link combineResults} merges per-gate results so the command can name every
 * failing check and exit non-zero (REQ-008).
 */

export {
	type BrowserGateExpectations,
	runBrowserGate,
} from "./browser-checks.js";
export {
	assertSelfContained,
	DEFAULT_SIZE_LIMIT_BYTES,
	runStaticGate,
	type SelfContainmentOptions,
	type StaticGateContext,
} from "./static-checks.js";
export {
	combineResults,
	type GateCheck,
	type GateResult,
} from "./types.js";
