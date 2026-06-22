/**
 * `rp1 teach-me` command group.
 *
 * Hosts the self-contained lesson tooling: `render` assembles a hand-authored
 * `lesson.json` into a single inlined `lesson.html`, `validate` gates a rendered
 * lesson with a hybrid static + headless-browser validator, and `export`
 * re-asserts a rendered lesson's self-containment and emits the standalone file.
 *
 * This group is lazy-loaded from `main.ts` (it transitively imports Puppeteer
 * via the diagram pre-renderer and the validation gate), so importing it must
 * stay free of side effects beyond constructing the command.
 */

import { Command } from "commander";
import { exportCommand } from "./export.js";
import { renderCommand } from "./render.js";
import { validateCommand } from "./validate.js";

/** The `teach-me` parent command with its subcommands. */
export const teachMeCommand = new Command("teach-me")
	.description(
		"Render, validate, and export self-contained interactive lessons from a lesson.json",
	)
	.addCommand(renderCommand)
	.addCommand(validateCommand)
	.addCommand(exportCommand);
