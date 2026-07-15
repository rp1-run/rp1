import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as E from "fp-ts/lib/Either.js";
import {
	parseRawArgs,
	resolveArgs,
	resolveImpliesChains,
} from "../../../agent-tools/resolve-args/resolver.js";
import {
	parseNamespace,
	resolveSchemaFromNameOrPath,
} from "../../../agent-tools/resolve-args/schema-lookup.js";
import type { ArgumentDefinition } from "../../../build/models.js";
import {
	createInitialCommit,
	createTestWorktree,
	initTestRepo,
	writeFixture,
} from "../../helpers/index.js";

/** True when dist/ bundle manifests exist (i.e. a build has been run). */
// Test file is at cli/src/__tests__/agent-tools/resolve-args/ — 5 levels up to repo root
const hasDevDist = existsSync(
	join(
		dirname(fileURLToPath(import.meta.url)),
		"..",
		"..",
		"..",
		"..",
		"..",
		"dist",
		"claude-code",
		"bundle-manifest.json",
	),
);
const testIfDist = hasDevDist ? test : test.skip;

let tempDir: string;

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "resolve-args-test-"));
});

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true });
	// Clean up any env vars set during tests
	delete process.env.TEST_PLATFORM;
	delete process.env.RP1_ROOT;
	delete process.env.RP1_PROJECT_ROOT;
	delete process.env.RP1_KB_ROOT;
	delete process.env.RP1_WORK_ROOT;
});

const createSkillFile = async (
	dir: string,
	frontmatter: string,
): Promise<string> => {
	const skillDir = join(dir, "skills", "test-skill");
	await mkdir(skillDir, { recursive: true });
	const path = join(skillDir, "SKILL.md");
	await writeFile(path, frontmatter);
	return path;
};

const createAgentFile = async (
	dir: string,
	frontmatter: string,
): Promise<string> => {
	const agentDir = join(dir, "agents");
	await mkdir(agentDir, { recursive: true });
	const path = join(agentDir, "test-agent.md");
	await writeFile(path, frontmatter);
	return path;
};

describe("parseRawArgs", () => {
	const schema: readonly ArgumentDefinition[] = [
		{
			name: "FEATURE_ID",
			type: "string",
			required: true,
			description: "Feature ID",
		},
		{
			name: "AFK",
			type: "boolean",
			required: false,
			default: false,
			description: "Non-interactive",
			aliases: ["afk", "no prompts"],
		},
		{
			name: "GIT_COMMIT",
			type: "boolean",
			required: false,
			default: false,
			description: "Commit changes",
		},
	];

	test("parses positional argument", () => {
		const result = parseRawArgs("my-feature", schema);
		expect(result).toEqual({ FEATURE_ID: "my-feature" });
	});

	test("flag value never consumes a double-dash token (intentional asymmetry)", () => {
		// Pins the boundary asymmetry documented in resolver.ts: a declared
		// flag's VALUE stops at ANY double-dash token (declared or not), while
		// positional capture stops only at DECLARED flags. `--mode --unknown`
		// must leave MODE valueless (true) rather than binding "--unknown".
		const modeSchema: readonly ArgumentDefinition[] = [
			{
				name: "FEATURE_ID",
				type: "string",
				required: true,
				description: "Feature ID",
			},
			{
				name: "MODE",
				type: "string",
				required: false,
				description: "Mode",
			},
		];
		const result = parseRawArgs("feat --mode --unknown-thing", modeSchema);
		expect(result.MODE).toBe(true);
		expect(result.UNKNOWN_THING).toBe(true);
		expect(result.FEATURE_ID).toBe("feat");
	});

	test("parses optional positional string and enum arguments", () => {
		const optionalSchema: readonly ArgumentDefinition[] = [
			{
				name: "TARGET",
				type: "string",
				required: false,
				description: "PR number, URL, or branch",
			},
			{
				name: "BASE_BRANCH",
				type: "string",
				required: false,
				default: "main",
				description: "Base branch",
			},
			{
				name: "REVIEW_DEPTH",
				type: "enum",
				required: false,
				default: "standard",
				description: "Review depth",
				enum_values: ["quick", "standard", "detailed"],
			},
		];

		const result = parseRawArgs(
			"https://github.com/squareup/cash-server/pull/83764 main detailed",
			optionalSchema,
		);

		expect(result).toEqual({
			TARGET: "https://github.com/squareup/cash-server/pull/83764",
			BASE_BRANCH: "main",
			REVIEW_DEPTH: "detailed",
		});
	});

	test("parses boolean flag", () => {
		const result = parseRawArgs("my-feature --afk", schema);
		expect(result).toEqual({ FEATURE_ID: "my-feature", AFK: true });
	});

	test("bare alias in greedy capture is treated as prose, not flag trigger", () => {
		const result = parseRawArgs('my-feature "no prompts"', schema);
		expect(result).toEqual({ FEATURE_ID: "my-feature no prompts" });
	});

	test("bare alias as standalone trailing token after positionals are consumed", () => {
		const multiRequiredSchema: readonly ArgumentDefinition[] = [
			{
				name: "FEATURE_ID",
				type: "string",
				required: true,
				description: "Feature ID",
			},
			{
				name: "TASK_IDS",
				type: "string",
				required: true,
				description: "Task IDs",
			},
			{
				name: "AFK",
				type: "boolean",
				required: false,
				default: false,
				description: "Non-interactive",
				aliases: ["afk", "no prompts"],
			},
		];
		const result = parseRawArgs("my-feature T1,T2 afk", multiRequiredSchema);
		expect(result).toEqual({
			FEATURE_ID: "my-feature",
			TASK_IDS: "T1,T2",
			AFK: true,
		});
	});

	test("returns empty for empty input", () => {
		const result = parseRawArgs("", schema);
		expect(result).toEqual({});
	});

	test("parses multiple flags", () => {
		const result = parseRawArgs("my-feature --afk --git-commit", schema);
		expect(result).toEqual({
			FEATURE_ID: "my-feature",
			AFK: true,
			GIT_COMMIT: true,
		});
	});

	test("captures variadic positional input across multiple words", () => {
		const variadicSchema: readonly ArgumentDefinition[] = [
			{
				name: "PROBLEM_STATEMENT",
				type: "string",
				required: true,
				variadic: true,
				description: "Problem statement",
			},
			{
				name: "ISSUE_ID",
				type: "string",
				required: false,
				description: "Issue identifier",
			},
		];

		const result = parseRawArgs(
			"running evals clobber the arcade UI --issue-id running-evals",
			variadicSchema,
		);

		expect(result).toEqual({
			PROBLEM_STATEMENT: "running evals clobber the arcade UI",
			ISSUE_ID: "running-evals",
		});
	});

	test("required scalar + variadic: leading token to scalar, remainder to variadic", () => {
		// build's shape: FEATURE_ID (required, non-variadic) + REQUIREMENTS
		// (variadic). The scalar must NOT greedily swallow the whole request — it
		// takes a single leading token and the variadic captures the rest.
		const buildShape: readonly ArgumentDefinition[] = [
			{
				name: "FEATURE_ID",
				type: "string",
				required: true,
				description: "Feature identifier",
			},
			{
				name: "REQUIREMENTS",
				type: "string",
				required: false,
				default: "",
				variadic: true,
				description: "Raw requirements text",
			},
		];

		const result = parseRawArgs(
			"harden-1up-install fix the issues in the research doc",
			buildShape,
		);

		expect(result).toEqual({
			FEATURE_ID: "harden-1up-install",
			REQUIREMENTS: "fix the issues in the research doc",
		});
	});

	test("captures multi-word value for sole required string positional", () => {
		const result = parseRawArgs("fix the login bug on the dashboard", schema);
		expect(result).toEqual({
			FEATURE_ID: "fix the login bug on the dashboard",
		});
	});

	test("captures multi-word positional with trailing recognized flag", () => {
		const result = parseRawArgs(
			"fix the login bug on the dashboard --afk",
			schema,
		);
		expect(result).toEqual({
			FEATURE_ID: "fix the login bug on the dashboard",
			AFK: true,
		});
	});

	test("embedded double-dash in prose does not terminate greedy positional capture", () => {
		const result = parseRawArgs(
			"fix the --broken login on dashboard --afk",
			schema,
		);
		expect(result).toEqual({
			FEATURE_ID: "fix the --broken login on dashboard",
			AFK: true,
		});
	});

	test("embedded double-dash in variadic prose does not terminate capture", () => {
		const variadicSchema: readonly ArgumentDefinition[] = [
			{
				name: "PROBLEM_STATEMENT",
				type: "string",
				required: true,
				variadic: true,
				description: "Problem statement",
			},
			{
				name: "ISSUE_ID",
				type: "string",
				required: false,
				description: "Issue identifier",
			},
		];

		const result = parseRawArgs(
			"the UI breaks when --verbose flag is passed --issue-id ui-verbose",
			variadicSchema,
		);

		expect(result).toEqual({
			PROBLEM_STATEMENT: "the UI breaks when --verbose flag is passed",
			ISSUE_ID: "ui-verbose",
		});
	});

	test("passing --afk does not set GIT_COMMIT in parsed output", () => {
		const result = parseRawArgs("my-feature --afk", schema);
		expect(result.AFK).toBe(true);
		expect(result.GIT_COMMIT).toBeUndefined();
	});

	test("trailing recognized flags after multi-word positional text", () => {
		const extendedSchema: readonly ArgumentDefinition[] = [
			{
				name: "REQUEST",
				type: "string",
				required: true,
				description: "User request",
			},
			{
				name: "MODE",
				type: "string",
				required: false,
				description: "Mode",
			},
			{
				name: "AFK",
				type: "boolean",
				required: false,
				default: false,
				description: "Non-interactive",
			},
		];
		const result = parseRawArgs(
			"fix the login bug --mode custom --afk",
			extendedSchema,
		);
		expect(result).toEqual({
			REQUEST: "fix the login bug",
			MODE: "custom",
			AFK: true,
		});
	});

	test("boolean flag with --key=value after greedy positional", () => {
		const result = parseRawArgs("my-feature --afk --git-commit=false", schema);
		expect(result).toEqual({
			FEATURE_ID: "my-feature",
			AFK: true,
			GIT_COMMIT: false,
		});
	});

	test("bare alias words mid-prose do not terminate greedy capture", () => {
		const aliasRichSchema: readonly ArgumentDefinition[] = [
			{
				name: "REQUEST",
				type: "string",
				required: true,
				description: "User request",
			},
			{
				name: "AFK",
				type: "boolean",
				required: false,
				default: false,
				description: "Non-interactive",
				aliases: ["afk"],
			},
			{
				name: "REVIEW",
				type: "boolean",
				required: false,
				default: false,
				description: "Review changes",
				aliases: ["review"],
			},
			{
				name: "GIT_COMMIT",
				type: "boolean",
				required: false,
				default: false,
				description: "Commit changes",
				aliases: ["commit"],
			},
			{
				name: "GIT_PUSH",
				type: "boolean",
				required: false,
				default: false,
				description: "Push branch",
				aliases: ["push"],
			},
		];

		const result = parseRawArgs(
			"fix the commit message review for the push notification feature",
			aliasRichSchema,
		);
		expect(result).toEqual({
			REQUEST:
				"fix the commit message review for the push notification feature",
		});
	});

	test("greedy capture does not activate with multiple required string args", () => {
		const multiRequiredSchema: readonly ArgumentDefinition[] = [
			{
				name: "FEATURE_ID",
				type: "string",
				required: true,
				description: "Feature ID",
			},
			{
				name: "TASK_IDS",
				type: "string",
				required: true,
				description: "Task IDs",
			},
			{
				name: "AFK",
				type: "boolean",
				required: false,
				default: false,
				description: "Non-interactive",
			},
		];
		const result = parseRawArgs("my-feature T1,T2 --afk", multiRequiredSchema);
		expect(result).toEqual({
			FEATURE_ID: "my-feature",
			TASK_IDS: "T1,T2",
			AFK: true,
		});
	});

	test("trailing double-dash flags parse after alias-containing prose", () => {
		const aliasRichSchema: readonly ArgumentDefinition[] = [
			{
				name: "REQUEST",
				type: "string",
				required: true,
				description: "User request",
			},
			{
				name: "AFK",
				type: "boolean",
				required: false,
				default: false,
				description: "Non-interactive",
				aliases: ["afk"],
			},
			{
				name: "GIT_COMMIT",
				type: "boolean",
				required: false,
				default: false,
				description: "Commit changes",
				aliases: ["commit"],
			},
			{
				name: "REVIEW",
				type: "boolean",
				required: false,
				default: false,
				description: "Review changes",
				aliases: ["review"],
			},
		];

		const result = parseRawArgs(
			"fix the commit review logic on the afk handler --git-commit --review",
			aliasRichSchema,
		);
		expect(result).toEqual({
			REQUEST: "fix the commit review logic on the afk handler",
			GIT_COMMIT: true,
			REVIEW: true,
		});
	});

	test("KEY=VALUE tokens mid-prose do not bind as flags", () => {
		const result = parseRawArgs(
			"set MODE=fast in the config file for review",
			schema,
		);
		expect(result).toEqual({
			FEATURE_ID: "set MODE=fast in the config file for review",
		});
	});

	test("multi-alias schema with prose containing all alias words resolves full text", () => {
		const aliasRichSchema: readonly ArgumentDefinition[] = [
			{
				name: "REQUEST",
				type: "string",
				required: true,
				description: "User request",
			},
			{
				name: "AFK",
				type: "boolean",
				required: false,
				default: false,
				description: "Non-interactive",
				aliases: ["afk"],
			},
			{
				name: "REVIEW",
				type: "boolean",
				required: false,
				default: false,
				description: "Review changes",
				aliases: ["review"],
			},
			{
				name: "GIT_COMMIT",
				type: "boolean",
				required: false,
				default: false,
				description: "Commit changes",
				aliases: ["commit"],
			},
			{
				name: "GIT_PUSH",
				type: "boolean",
				required: false,
				default: false,
				description: "Push branch",
				aliases: ["push"],
			},
		];

		const result = parseRawArgs(
			"review the commit message then push afk notification changes",
			aliasRichSchema,
		);
		expect(result).toEqual({
			REQUEST: "review the commit message then push afk notification changes",
		});
	});
});

describe("resolveImpliesChains", () => {
	const schema: readonly ArgumentDefinition[] = [
		{
			name: "GIT_PR",
			type: "boolean",
			required: false,
			default: false,
			description: "Create PR",
			implies: ["GIT_PUSH", "GIT_COMMIT"],
		},
		{
			name: "GIT_PUSH",
			type: "boolean",
			required: false,
			default: false,
			description: "Push branch",
			implies: ["GIT_COMMIT"],
		},
		{
			name: "GIT_COMMIT",
			type: "boolean",
			required: false,
			default: false,
			description: "Commit changes",
		},
	];

	test("propagates direct implications", () => {
		const resolved: Record<string, string | boolean> = {
			GIT_PR: true,
			GIT_PUSH: false,
			GIT_COMMIT: false,
		};
		resolveImpliesChains(resolved, schema);
		expect(resolved.GIT_PUSH).toBe(true);
		expect(resolved.GIT_COMMIT).toBe(true);
	});

	test("propagates transitive implications", () => {
		const resolved: Record<string, string | boolean> = {
			GIT_PR: false,
			GIT_PUSH: true,
			GIT_COMMIT: false,
		};
		resolveImpliesChains(resolved, schema);
		expect(resolved.GIT_COMMIT).toBe(true);
		expect(resolved.GIT_PR).toBe(false);
	});

	test("does nothing when no flags are true", () => {
		const resolved: Record<string, string | boolean> = {
			GIT_PR: false,
			GIT_PUSH: false,
			GIT_COMMIT: false,
		};
		resolveImpliesChains(resolved, schema);
		expect(resolved.GIT_PR).toBe(false);
		expect(resolved.GIT_PUSH).toBe(false);
		expect(resolved.GIT_COMMIT).toBe(false);
	});
});

describe("resolveArgs", () => {
	test("empty schema returns empty result", async () => {
		const schemaPath = await createSkillFile(
			tempDir,
			`---
name: empty-skill
description: "A skill with no arguments for testing purposes"
---
# Empty skill
`,
		);

		const result = await resolveArgs({
			schema_path: schemaPath,
			raw_args: "",
			project_root: tempDir,
		})();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.arguments).toEqual({});
			expect(result.right.directories).toEqual({
				projectRoot: tempDir,
				projectId: undefined,
				kbRoot: join(tempDir, ".rp1", "context"),
				workRoot: join(tempDir, ".rp1", "work"),
				codeRoot: tempDir,
				isWorktree: false,
				status: "uninitialized",
				nextStepCommand: "rp1 init",
			});
			expect(result.right.unresolved).toEqual([]);
		}
	});

	test("resolves positional user input", async () => {
		const schemaPath = await createSkillFile(
			tempDir,
			`---
name: test-skill
description: "A test skill with structured arguments for validation"
metadata:
  arguments:
    - name: FEATURE_ID
      type: string
      required: true
      description: "Feature identifier"
---
# Test skill
`,
		);

		const result = await resolveArgs({
			schema_path: schemaPath,
			raw_args: "my-feature",
			project_root: tempDir,
		})();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.arguments.FEATURE_ID).toBe("my-feature");
			expect(result.right.unresolved).toEqual([]);
		}
	});

	test("boolean defaults to false when not specified", async () => {
		const schemaPath = await createSkillFile(
			tempDir,
			`---
name: test-skill
description: "A test skill with structured arguments for validation"
metadata:
  arguments:
    - name: AFK
      type: boolean
      required: false
      description: "Non-interactive mode"
---
# Test skill
`,
		);

		const result = await resolveArgs({
			schema_path: schemaPath,
			raw_args: "",
			project_root: tempDir,
		})();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.arguments.AFK).toBe(false);
		}
	});

	test("required arguments without value appear in unresolved", async () => {
		const schemaPath = await createSkillFile(
			tempDir,
			`---
name: test-skill
description: "A test skill with structured arguments for validation"
metadata:
  arguments:
    - name: FEATURE_ID
      type: string
      required: true
      description: "Feature identifier"
    - name: TASK_IDS
      type: string
      required: true
      description: "Task IDs"
---
# Test skill
`,
		);

		const result = await resolveArgs({
			schema_path: schemaPath,
			raw_args: "",
			project_root: tempDir,
		})();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.unresolved).toContain("FEATURE_ID");
			expect(result.right.unresolved).toContain("TASK_IDS");
		}
	});

	test("schema default is used when no other source provides value", async () => {
		const schemaPath = await createSkillFile(
			tempDir,
			`---
name: test-skill
description: "A test skill with structured arguments for validation"
metadata:
  arguments:
    - name: MODE
      type: string
      required: false
      default: "standard"
      description: "Build mode"
---
# Test skill
`,
		);

		const result = await resolveArgs({
			schema_path: schemaPath,
			raw_args: "",
			project_root: tempDir,
		})();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.arguments.MODE).toBe("standard");
		}
	});

	test("user input takes precedence over schema default", async () => {
		const schemaPath = await createSkillFile(
			tempDir,
			`---
name: test-skill
description: "A test skill with structured arguments for validation"
metadata:
  arguments:
    - name: MODE
      type: string
      required: false
      default: "standard"
      description: "Build mode"
    - name: FEATURE_ID
      type: string
      required: true
      description: "Feature ID"
---
# Test skill
`,
		);

		const result = await resolveArgs({
			schema_path: schemaPath,
			raw_args: "my-feat --mode custom",
			project_root: tempDir,
		})();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.arguments.MODE).toBe("custom");
		}
	});

	test("resolves variadic required arguments from freeform prose", async () => {
		const schemaPath = await createSkillFile(
			tempDir,
			`---
name: test-skill
description: "A test skill with variadic freeform input"
metadata:
  arguments:
    - name: PROBLEM_STATEMENT
      type: string
      required: true
      variadic: true
      description: "Problem statement"
    - name: ISSUE_ID
      type: string
      required: false
      default: ""
      description: "Issue identifier"
---
# Test skill
`,
		);

		const result = await resolveArgs({
			schema_path: schemaPath,
			raw_args:
				"running evals clobber our arcade UI until the daemon restarts --issue-id running-evals",
			project_root: tempDir,
		})();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.arguments.PROBLEM_STATEMENT).toBe(
				"running evals clobber our arcade UI until the daemon restarts",
			);
			expect(result.right.arguments.ISSUE_ID).toBe("running-evals");
			expect(result.right.unresolved).toEqual([]);
		}
	});

	test("ENV var source is used as fallback", async () => {
		process.env.TEST_PLATFORM = "codex";

		const schemaPath = await createSkillFile(
			tempDir,
			`---
name: test-skill
description: "A test skill with structured arguments for validation"
metadata:
  arguments:
    - name: PLATFORM
      type: string
      required: false
      description: "Target platform"
      source:
        env: TEST_PLATFORM
---
# Test skill
`,
		);

		const result = await resolveArgs({
			schema_path: schemaPath,
			raw_args: "",
			project_root: tempDir,
		})();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.arguments.PLATFORM).toBe("codex");
		}
	});

	test("user input takes precedence over ENV var", async () => {
		process.env.TEST_PLATFORM = "codex";

		const schemaPath = await createSkillFile(
			tempDir,
			`---
name: test-skill
description: "A test skill with structured arguments for validation"
metadata:
  arguments:
    - name: FEATURE_ID
      type: string
      required: true
      description: "Feature ID"
    - name: PLATFORM
      type: string
      required: false
      description: "Target platform"
      source:
        env: TEST_PLATFORM
---
# Test skill
`,
		);

		const result = await resolveArgs({
			schema_path: schemaPath,
			raw_args: "feat --platform opencode",
			project_root: tempDir,
		})();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.arguments.PLATFORM).toBe("opencode");
		}
	});

	test("implies chains are resolved in final output", async () => {
		const schemaPath = await createSkillFile(
			tempDir,
			`---
name: test-skill
description: "A test skill with structured arguments for validation"
metadata:
  arguments:
    - name: FEATURE_ID
      type: string
      required: true
      description: "Feature ID"
    - name: GIT_PR
      type: boolean
      required: false
      default: false
      description: "Create PR"
      implies:
        - GIT_PUSH
        - GIT_COMMIT
    - name: GIT_PUSH
      type: boolean
      required: false
      default: false
      description: "Push branch"
      implies:
        - GIT_COMMIT
    - name: GIT_COMMIT
      type: boolean
      required: false
      default: false
      description: "Commit changes"
---
# Test skill
`,
		);

		const result = await resolveArgs({
			schema_path: schemaPath,
			raw_args: "my-feature --git-pr",
			project_root: tempDir,
		})();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.arguments.GIT_PR).toBe(true);
			expect(result.right.arguments.GIT_PUSH).toBe(true);
			expect(result.right.arguments.GIT_COMMIT).toBe(true);
		}
	});

	test("passing --afk does not change GIT_COMMIT schema default", async () => {
		const schemaPath = await createSkillFile(
			tempDir,
			`---
name: test-skill
description: "Test implies isolation between unrelated boolean flags"
metadata:
  arguments:
    - name: FEATURE_ID
      type: string
      required: true
      description: "Feature ID"
    - name: AFK
      type: boolean
      required: false
      default: false
      description: "Non-interactive"
    - name: GIT_COMMIT
      type: boolean
      required: false
      default: true
      description: "Commit changes"
---
# Test skill
`,
		);

		const result = await resolveArgs({
			schema_path: schemaPath,
			raw_args: "my-feature --afk",
			project_root: tempDir,
		})();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.arguments.AFK).toBe(true);
			expect(result.right.arguments.GIT_COMMIT).toBe(true);
		}
	});

	test("project settings take precedence over schema default", async () => {
		// Create settings file
		const rp1Dir = join(tempDir, ".rp1");
		await mkdir(rp1Dir, { recursive: true });
		await writeFile(
			join(rp1Dir, "settings.toml"),
			`[arguments.test-skill]
GIT_COMMIT = true
`,
		);

		const schemaPath = await createSkillFile(
			tempDir,
			`---
name: test-skill
description: "A test skill with structured arguments for validation"
metadata:
  arguments:
    - name: GIT_COMMIT
      type: boolean
      required: false
      default: false
      description: "Commit changes"
---
# Test skill
`,
		);

		const result = await resolveArgs({
			schema_path: schemaPath,
			raw_args: "",
			project_root: tempDir,
		})();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.arguments.GIT_COMMIT).toBe(true);
		}
	});

	test("discovers the canonical project root for settings lookup from nested directories", async () => {
		await writeFixture(tempDir, ".rp1/project_id", "project-123");
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			`[arguments.test-skill]
FEATURE_ID = "from-project-settings"
`,
		);

		const nestedDir = join(tempDir, "packages", "app");
		await mkdir(nestedDir, { recursive: true });

		const schemaPath = await createSkillFile(
			tempDir,
			`---
name: test-skill
description: "A test skill with settings-driven defaults"
metadata:
  arguments:
    - name: FEATURE_ID
      type: string
      required: true
      description: "Feature identifier"
---
# Test skill
`,
		);

		const result = await resolveArgs({
			schema_path: schemaPath,
			raw_args: "",
			project_root: nestedDir,
		})();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.arguments.FEATURE_ID).toBe("from-project-settings");
			expect(result.right.directories).toEqual({
				projectRoot: tempDir,
				projectId: "project-123",
				kbRoot: join(tempDir, ".rp1", "context"),
				workRoot: join(tempDir, ".rp1", "work"),
				codeRoot: tempDir,
				isWorktree: false,
				status: "initialized",
			});
		}
	});

	test("returns migrate guidance when project_root points at a legacy .rp1 directory", async () => {
		const legacyProjectRoot = join(tempDir, "legacy-project");
		const nestedDir = join(legacyProjectRoot, "packages", "app");

		await mkdir(join(legacyProjectRoot, ".rp1"), { recursive: true });
		await mkdir(nestedDir, { recursive: true });

		const schemaPath = await createSkillFile(
			tempDir,
			`---
name: test-skill
description: "A test skill with structured arguments for validation"
metadata:
  arguments:
    - name: FEATURE_ID
      type: string
      required: false
      description: "Feature identifier"
---
# Test skill
`,
		);

		const result = await resolveArgs({
			schema_path: schemaPath,
			raw_args: "",
			project_root: nestedDir,
		})();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.directories).toEqual({
				projectRoot: legacyProjectRoot,
				projectId: undefined,
				kbRoot: join(legacyProjectRoot, ".rp1", "context"),
				workRoot: join(legacyProjectRoot, ".rp1", "work"),
				codeRoot: legacyProjectRoot,
				isWorktree: false,
				status: "legacy",
				nextStepCommand: "rp1 migrate",
			});
		}
	});

	test("returns init guidance when project_root is not an rp1 project", async () => {
		const nestedDir = join(tempDir, "scratch", "app");
		await mkdir(nestedDir, { recursive: true });

		const schemaPath = await createSkillFile(
			tempDir,
			`---
name: test-skill
description: "A test skill with structured arguments for validation"
metadata:
  arguments:
    - name: FEATURE_ID
      type: string
      required: false
      description: "Feature identifier"
---
# Test skill
`,
		);

		const result = await resolveArgs({
			schema_path: schemaPath,
			raw_args: "",
			project_root: nestedDir,
		})();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.directories).toEqual({
				projectRoot: nestedDir,
				projectId: undefined,
				kbRoot: join(nestedDir, ".rp1", "context"),
				workRoot: join(nestedDir, ".rp1", "work"),
				codeRoot: nestedDir,
				isWorktree: false,
				status: "uninitialized",
				nextStepCommand: "rp1 init",
			});
		}
	});

	test("does not treat the home directory as an initialized project", async () => {
		const fakeHome = join(tempDir, "fake-home");
		const nestedPathUnderHome = join(fakeHome, "scratch", "app");
		await writeFixture(fakeHome, ".rp1/project_id", "project-123");
		await mkdir(nestedPathUnderHome, { recursive: true });

		const schemaPath = await createSkillFile(
			tempDir,
			`---
name: test-skill
description: "A test skill with structured arguments for validation"
metadata:
  arguments:
    - name: FEATURE_ID
      type: string
      required: false
      description: "Feature identifier"
---
# Test skill
`,
		);

		const result = await resolveArgs(
			{
				schema_path: schemaPath,
				raw_args: "",
				project_root: nestedPathUnderHome,
			},
			{ homeDir: fakeHome },
		)();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.directories).toEqual({
				projectRoot: nestedPathUnderHome,
				projectId: undefined,
				kbRoot: join(nestedPathUnderHome, ".rp1", "context"),
				workRoot: join(nestedPathUnderHome, ".rp1", "work"),
				codeRoot: nestedPathUnderHome,
				isWorktree: false,
				status: "uninitialized",
				nextStepCommand: "rp1 init",
			});
		}
	});

	test("surfaces canonical worktree directories when project_root is a linked worktree", async () => {
		const mainRepoRoot = join(tempDir, "worktree-main");
		const linkedWorktreePath = join(tempDir, "linked-worktree");

		await mkdir(join(mainRepoRoot, ".rp1"), { recursive: true });
		await writeFile(join(mainRepoRoot, ".rp1", "project_id"), "project-123");
		await initTestRepo(mainRepoRoot);
		await createInitialCommit(mainRepoRoot);
		await createTestWorktree(mainRepoRoot, linkedWorktreePath, "test-branch");
		const canonicalMainRepoRoot = await realpath(mainRepoRoot).catch(
			() => mainRepoRoot,
		);
		const canonicalLinkedWorktreePath = await realpath(
			linkedWorktreePath,
		).catch(() => linkedWorktreePath);

		const schemaPath = await createSkillFile(
			tempDir,
			`---
name: test-skill
description: "A test skill with structured arguments for validation"
metadata:
  arguments:
    - name: FEATURE_ID
      type: string
      required: false
      description: "Feature identifier"
---
# Test skill
`,
		);

		const result = await resolveArgs({
			schema_path: schemaPath,
			raw_args: "",
			project_root: linkedWorktreePath,
		})();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.directories).toEqual({
				projectRoot: canonicalMainRepoRoot,
				projectId: "project-123",
				kbRoot: join(canonicalMainRepoRoot, ".rp1", "context"),
				workRoot: join(canonicalMainRepoRoot, ".rp1", "work"),
				codeRoot: canonicalLinkedWorktreePath,
				isWorktree: true,
				worktreeName: "test-branch",
				status: "initialized",
			});
		}
	});

	test("agent frontmatter with top-level arguments", async () => {
		const schemaPath = await createAgentFile(
			tempDir,
			`---
name: test-agent
description: "A test agent with structured arguments"
tools: Read, Write
model: inherit
arguments:
  - name: FEATURE_ID
    type: string
    required: true
    description: "Feature identifier"
  - name: GIT_COMMIT
    type: boolean
    required: false
    default: false
    description: "Commit changes"
environment:
  - name: RP1_KB_ROOT
    source: "rp1 agent-tools rp1-root-dir"
    description: "KB directory"
---
# Test agent
`,
		);

		const result = await resolveArgs({
			schema_path: schemaPath,
			raw_args: "my-feature --git-commit",
			project_root: tempDir,
		})();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.arguments.FEATURE_ID).toBe("my-feature");
			expect(result.right.arguments.GIT_COMMIT).toBe(true);
		}
	});

	test("RP1_* environment schemas do not affect resolved output", async () => {
		const schemaPath = await createAgentFile(
			tempDir,
			`---
name: test-agent
description: "A test agent with resolved directory environment"
tools: Read
model: inherit
environment:
  - name: RP1_PROJECT_ROOT
    source: "rp1 agent-tools rp1-root-dir"
    description: "Project root"
  - name: RP1_KB_ROOT
    source: "rp1 agent-tools rp1-root-dir"
    description: "KB directory"
  - name: RP1_WORK_ROOT
    source: "rp1 agent-tools rp1-root-dir"
    description: "Work directory"
---
# Test agent
`,
		);

		const result = await resolveArgs({
			schema_path: schemaPath,
			raw_args: "",
			project_root: tempDir,
		})();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right).not.toHaveProperty("environment");
		}
	});

	test("returns error for missing schema file", async () => {
		const result = await resolveArgs({
			schema_path: join(tempDir, "nonexistent.md"),
			raw_args: "",
			project_root: tempDir,
		})();

		expect(E.isLeft(result)).toBe(true);
	});

	test("resolves via schema_path when both name and schema_path are provided", async () => {
		const schemaPath = await createSkillFile(
			tempDir,
			`---
name: test-skill
description: "A test skill with structured arguments for validation"
metadata:
  arguments:
    - name: FEATURE_ID
      type: string
      required: true
      description: "Feature identifier"
---
# Test skill
`,
		);

		const result = await resolveArgs({
			name: "rp1-nonexistent:nonexistent",
			schema_path: schemaPath,
			raw_args: "my-feature",
			project_root: tempDir,
		})();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.arguments.FEATURE_ID).toBe("my-feature");
		}
	});

	testIfDist("resolves via name using development dist path", async () => {
		const result = await resolveArgs({
			name: "rp1-dev:build",
			raw_args: "",
			project_root: tempDir,
		})();

		// This should succeed in development (dist/ exists with built artifacts)
		expect(E.isRight(result)).toBe(true);
	});

	test("returns error when name references unknown plugin", async () => {
		const result = await resolveArgs({
			name: "rp1-nonexistent:some-skill",
			raw_args: "",
			project_root: tempDir,
		})();

		expect(E.isLeft(result)).toBe(true);
	});

	test("returns error when name references unknown skill in valid plugin", async () => {
		const result = await resolveArgs({
			name: "rp1-dev:nonexistent-skill-xyz",
			raw_args: "",
			project_root: tempDir,
		})();

		expect(E.isLeft(result)).toBe(true);
	});

	test("returns error when neither name nor schema_path is provided", async () => {
		const result = await resolveArgs({
			raw_args: "",
			project_root: tempDir,
		})();

		expect(E.isLeft(result)).toBe(true);
	});
});

describe("parseNamespace", () => {
	test("parses valid namespace with rp1- prefix", () => {
		const result = parseNamespace("rp1-dev:build");
		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.plugin).toBe("dev");
			expect(result.right.artifact).toBe("build");
		}
	});

	test("parses namespace without rp1- prefix", () => {
		const result = parseNamespace("dev:build");
		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.plugin).toBe("dev");
			expect(result.right.artifact).toBe("build");
		}
	});

	test("parses base plugin namespace", () => {
		const result = parseNamespace("rp1-base:knowledge-load");
		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.plugin).toBe("base");
			expect(result.right.artifact).toBe("knowledge-load");
		}
	});

	test("returns error for name without colon", () => {
		const result = parseNamespace("build");
		expect(E.isLeft(result)).toBe(true);
	});

	test("returns error for empty plugin part", () => {
		const result = parseNamespace(":build");
		expect(E.isLeft(result)).toBe(true);
	});

	test("returns error for empty name part", () => {
		const result = parseNamespace("rp1-dev:");
		expect(E.isLeft(result)).toBe(true);
	});
});

describe("resolveSchemaFromNameOrPath", () => {
	test("schema_path takes precedence over name", async () => {
		const schemaPath = await createSkillFile(
			tempDir,
			`---
name: override-skill
description: "Schema path override test"
---
# Override skill
`,
		);

		const result = await resolveSchemaFromNameOrPath(
			"rp1-nonexistent:nonexistent",
			schemaPath,
		)();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right).toBe(schemaPath);
		}
	});

	test("returns error when schema_path does not exist", async () => {
		const result = await resolveSchemaFromNameOrPath(
			undefined,
			join(tempDir, "nonexistent.md"),
		)();

		expect(E.isLeft(result)).toBe(true);
	});

	test("returns error when no source specified", async () => {
		const result = await resolveSchemaFromNameOrPath(undefined, undefined)();

		expect(E.isLeft(result)).toBe(true);
	});

	testIfDist("resolves agent by name from development dist", async () => {
		const result = await resolveSchemaFromNameOrPath(
			"rp1-dev:task-builder",
			undefined,
		)();

		// Should find the agent in dist/claude-code/dev/agents/task-builder.md
		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right).toContain("agents/task-builder.md");
		}
	});

	testIfDist("resolves skill by name from development dist", async () => {
		const result = await resolveSchemaFromNameOrPath(
			"rp1-dev:build",
			undefined,
		)();

		// Should find the skill in dist/claude-code/dev/skills/build/SKILL.md
		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right).toContain("skills/build/SKILL.md");
		}
	});
});
