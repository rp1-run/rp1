import { Command } from "commander";
import { executeMigrate, formatMigrateSummary } from "../migrate/index.js";

export const migrateCommand = new Command("migrate")
	.description("Migrate an existing rp1 project to the new directory model")
	.option("--dry-run", "Preview migration actions without making changes")
	.addHelpText(
		"after",
		`
Migrates an existing rp1 project to the project-local directory model:

  1. Creates .rp1/project_id (stable UUID) if missing
  2. Creates .rp1/work/ directory if missing
  3. Moves legacy work artifacts from ~/.rp1/work/<key> into .rp1/work/
  4. Updates .gitignore with work ignore and project_id un-ignore rules
  5. Repairs Arcade run/artifact/task/notification project identity metadata
  6. Moves misplaced project-local artifacts into the canonical .rp1 directory when possible
  7. Rebuilds derived Activity search rows for existing workflow history
  8. Upgrades stale stanza content in CLAUDE.md, AGENTS.md, .gitignore

The command is idempotent: running it multiple times produces no changes.
Use --dry-run to report planned Activity search rebuild work without modifying files or database rows.

Examples:
  rp1 migrate              Migrate current project
  rp1 migrate --dry-run    Preview migration work
`,
	)
	.action(async (options: { dryRun?: boolean }) => {
		try {
			const result = await executeMigrate(process.cwd(), {
				dryRun: options.dryRun === true,
			});
			console.log(formatMigrateSummary(result));
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`Migration failed: ${message}`);
			process.exit(1);
		}
	});
