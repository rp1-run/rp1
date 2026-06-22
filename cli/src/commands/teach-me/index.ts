/**
 * `rp1 teach-me` command group.
 *
 * Hosts the self-contained lesson tooling: `render` assembles a hand-authored
 * `lesson.json` into a single inlined `lesson.html`. The `validate` and `export`
 * subcommands (T6/T7) attach here as they land.
 *
 * This group is lazy-loaded from `main.ts` (it transitively imports Puppeteer
 * via the diagram pre-renderer), so importing it must stay free of side effects
 * beyond constructing the command.
 */

import { Command } from "commander";
import { renderCommand } from "./render.js";

/** The `teach-me` parent command with its subcommands. */
export const teachMeCommand = new Command("teach-me")
	.description(
		"Render, validate, and export self-contained interactive lessons from a lesson.json",
	)
	.addCommand(renderCommand);
