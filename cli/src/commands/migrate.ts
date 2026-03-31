import { Command } from "commander";
import { executeMigrate, formatMigrateSummary } from "../migrate/index.js";

export const migrateCommand = new Command("migrate")
	.description("Migrate an existing rp1 project to the new directory model")
	.addHelpText(
		"after",
		`
Migrates an existing rp1 project to the project-local directory model:

  1. Creates .rp1/project_id (stable UUID) if missing
  2. Creates .rp1/work/ directory if missing
  3. Moves legacy work artifacts from ~/.rp1/work/<key> into .rp1/work/
  4. Updates .gitignore with work ignore and project_id un-ignore rules
  5. Backfills project_id in Arcade database records

The command is idempotent: running it multiple times produces no changes.

Examples:
  rp1 migrate              Migrate current project
`,
	)
	.action(async () => {
		try {
			const result = await executeMigrate(process.cwd());
			console.log(formatMigrateSummary(result));
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`Migration failed: ${message}`);
			process.exit(1);
		}
	});
