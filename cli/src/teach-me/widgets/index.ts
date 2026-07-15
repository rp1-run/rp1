/**
 * teach-me widget library entry point.
 *
 * Registers every `<tm-*>` custom element for the §22 MVP set. This module is
 * the build entry that T3 compiles into a single `tm-widgets.js` bundle for
 * embedding in the single-executable CLI; the companion `src/base.css` provides
 * the base styling. Importing this module (or running it as the bundle) is
 * side-effecting: it calls `registerWidgets()` immediately so a rendered
 * `lesson.html` upgrades its elements as soon as the script runs.
 *
 * Widget contract:
 * - Static blocks (`prose`, `callout`, `code`, `table`, `key-insight`,
 *   `glossary`, `diagram`) are rendered server-side by the assembler; their
 *   custom elements only add accessibility semantics to existing content.
 * - Interactive blocks (`timeline`, `decision-tree`, `stepper`,
 *   `state-explorer`, `layer-explorer`, `compare-cards`, `code-walkthrough`,
 *   `quiz`) hydrate from a co-located `<script type="application/json">` island
 *   whose content is the schema interactive-block `data` object.
 */

import { registerCodeWalkthrough } from "./src/code-walkthrough.js";
import { registerCompareCards } from "./src/compare-cards.js";
import { registerDecisionTree } from "./src/decision-tree.js";
import { registerLayerExplorer } from "./src/layer-explorer.js";
import { registerQuiz } from "./src/quiz.js";
import { registerStateExplorer } from "./src/state-explorer.js";
import { registerStaticBlocks } from "./src/static-blocks.js";
import { registerStepper } from "./src/stepper.js";
import { registerTimeline } from "./src/timeline.js";

/** Register all teach-me widget custom elements (idempotent). */
export function registerWidgets(): void {
	registerStaticBlocks();
	registerTimeline();
	registerDecisionTree();
	registerStepper();
	registerStateExplorer();
	registerLayerExplorer();
	registerCompareCards();
	registerCodeWalkthrough();
	registerQuiz();
}

registerWidgets();
