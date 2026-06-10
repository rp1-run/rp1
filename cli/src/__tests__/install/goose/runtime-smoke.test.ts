import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	closeDatabase,
	getArtifactsForRun,
	getEmitDatabase,
	getRunById,
	resetInstance,
} from "../../../agent-tools/emit/database.js";
import {
	cleanupTempDir,
	createTempDir,
	expectTaskRight,
} from "../../helpers/index.js";

const repoRoot = join(import.meta.dir, "..", "..", "..", "..", "..");
const cliRoot = join(repoRoot, "cli");
const smokeEnabled = process.env.RP1_GOOSE_RUNTIME_SMOKE === "1";
const testIfSmokeEnabled = smokeEnabled ? test : test.skip;
const smokeFeatureId = "goose-harness-core";
const smokeArgs = `FEATURE_ID=${smokeFeatureId}`;
const artifactPath = `features/${smokeFeatureId}/goose-runtime-smoke.md`;

const writeSmokeSkill = async (projectRoot: string): Promise<void> => {
	const skillPath = join(
		projectRoot,
		"plugins",
		"dev",
		"skills",
		"goose-harness-smoke",
		"SKILL.md",
	);
	await mkdir(join(skillPath, ".."), { recursive: true });
	await writeFile(
		skillPath,
		`---
name: goose-harness-smoke
description: "Goose harness runtime smoke"
metadata:
  category: development
  is_workflow: true
  workflow:
    run_policy: fresh
    identity_args: []
  arguments:
    - name: FEATURE_ID
      type: string
      required: true
      description: "Feature identifier"
---
# Goose Harness Smoke
`,
		"utf-8",
	);
};

const writeSmokeRecipe = async (options: {
	readonly recipePath: string;
	readonly projectRoot: string;
	readonly dbPath: string;
}): Promise<void> => {
	await writeFile(
		options.recipePath,
		`version: 1.0.0
title: rp1-goose-runtime-smoke
description: Runtime smoke for rp1 Goose harness validation
instructions: |
  You are running a deterministic rp1 Goose smoke. Use the developer shell only. Do not ask the user questions.
  Run the exact shell script below once. After it succeeds, summarize the run id and artifact path.
  The recipe ARGUMENTS value is: {{ ARGUMENTS }}.
  SCRIPT:
  set -euo pipefail
  cd ${cliRoot}
  export RP1_DB="${options.dbPath}"
  export PROJECT_ROOT="${options.projectRoot}"
  export ARGUMENTS="{{ ARGUMENTS }}"
  BOOTSTRAP=$(bun src/main.ts agent-tools workflow-bootstrap --name goose-harness-smoke --schema-path plugins/dev/skills/goose-harness-smoke/SKILL.md --args "$ARGUMENTS" --project-root "$PROJECT_ROOT" --harness goose)
  RUN_ID=$(printf '%s' "$BOOTSTRAP" | bun -e 'const input=await new Response(Bun.stdin.stream()).text(); const parsed=JSON.parse(input); console.log(parsed.data.run.runId)')
  ARTIFACT_PATH="${artifactPath}"
  mkdir -p "$PROJECT_ROOT/.rp1/work/features/${smokeFeatureId}"
  printf '# Goose runtime smoke\\n\\nrunId=%s\\nharness=goose\\narguments=%s\\n' "$RUN_ID" "$ARGUMENTS" > "$PROJECT_ROOT/.rp1/work/$ARTIFACT_PATH"
  bun src/main.ts agent-tools emit --workflow goose-harness-smoke --type artifact_registered --run-id "$RUN_ID" --harness goose --project "$PROJECT_ROOT" --data "{\\"path\\":\\"$ARTIFACT_PATH\\",\\"feature\\":\\"${smokeFeatureId}\\",\\"storageRoot\\":\\"work_dir\\",\\"format\\":\\"markdown\\"}"
prompt: |
  Run the deterministic smoke script with ARGUMENTS={{ ARGUMENTS }}.
extensions:
  - type: builtin
    name: developer
    display_name: Developer
    timeout: 300
    bundled: true
parameters:
  - key: ARGUMENTS
    input_type: string
    requirement: required
    description: Raw argument string
`,
		"utf-8",
	);
};

const parseGooseJsonOutput = (stdout: string): { messages: unknown[] } => {
	const match = stdout.match(/\{\s*"messages"[\s\S]*$/);
	if (!match) {
		throw new Error(`Goose JSON output was not found:\n${stdout}`);
	}
	return JSON.parse(match[0]) as { messages: unknown[] };
};

describe("Goose runtime smoke", () => {
	let tempDir: string;
	let originalDbEnv: string | undefined;

	beforeEach(async () => {
		tempDir = await createTempDir("goose-runtime-smoke");
		originalDbEnv = process.env.RP1_DB;
		closeDatabase();
		resetInstance();
	});

	afterEach(async () => {
		closeDatabase();
		resetInstance();
		if (originalDbEnv === undefined) {
			delete process.env.RP1_DB;
		} else {
			process.env.RP1_DB = originalDbEnv;
		}
		await cleanupTempDir(tempDir);
	});

	testIfSmokeEnabled(
		"runs an opt-in local recipe smoke with arguments, harness, JSON output, and artifact registration",
		async () => {
			const goosePath = Bun.which("goose");
			expect(goosePath).toBeTruthy();
			const projectRoot = join(tempDir, "project");
			const dbPath = join(tempDir, "rp1-goose-smoke.db");
			const recipePath = join(tempDir, "rp1-goose-runtime-smoke.yaml");
			await mkdir(join(projectRoot, ".rp1", "context"), { recursive: true });
			await mkdir(join(projectRoot, ".rp1", "work"), { recursive: true });
			await writeFile(
				join(projectRoot, ".rp1", "project_id"),
				"rp1-goose-smoke-project\n",
				"utf-8",
			);
			await writeSmokeSkill(projectRoot);
			await writeSmokeRecipe({ recipePath, projectRoot, dbPath });

			const validation = spawnSync(
				"goose",
				["recipe", "validate", recipePath],
				{
					encoding: "utf-8",
				},
			);
			expect(`${validation.stdout}${validation.stderr}`).toContain(
				"recipe file is valid",
			);
			expect(validation.status).toBe(0);

			const smoke = spawnSync(
				"goose",
				[
					"run",
					"--recipe",
					recipePath,
					"--params",
					`ARGUMENTS=${smokeArgs}`,
					"--no-session",
					"--output-format",
					"json",
					"--quiet",
					"--no-profile",
					"--with-builtin",
					"developer",
					"--max-turns",
					"8",
				],
				{
					encoding: "utf-8",
					timeout: 120000,
				},
			);

			expect(smoke.error).toBeUndefined();
			expect(smoke.status).toBe(0);
			const parsed = parseGooseJsonOutput(smoke.stdout);
			expect(Array.isArray(parsed.messages)).toBe(true);
			expect(smoke.stdout).toContain('"messages"');
			expect(smoke.stdout).toContain(smokeArgs);

			const db = await expectTaskRight(getEmitDatabase(dbPath));
			const runs = db
				.query("SELECT id FROM runs WHERE flow = ? ORDER BY created_at ASC")
				.all("goose-harness-smoke") as { id: string }[];
			expect(runs).toHaveLength(1);
			const run = getRunById(db, runs[0]!.id);
			expect(run?.harness).toBe("goose");
			expect(run?.bootstrapContext).toContain('"harness":"goose"');

			const artifacts = getArtifactsForRun(db, runs[0]!.id);
			expect(artifacts).toEqual([
				expect.objectContaining({
					path: artifactPath,
					storageRoot: "work_dir",
					feature: smokeFeatureId,
				}),
			]);

			const artifact = await readFile(
				join(projectRoot, ".rp1", "work", artifactPath),
				"utf-8",
			);
			expect(artifact).toContain("harness=goose");
			expect(artifact).toContain(`arguments=${smokeArgs}`);
		},
		{ timeout: 150000 },
	);
});
