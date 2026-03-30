import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

let tempDir: string;

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "resolve-args-test-"));
});

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true });
	// Clean up any env vars set during tests
	delete process.env.TEST_PLATFORM;
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

	test("parses boolean flag", () => {
		const result = parseRawArgs("my-feature --afk", schema);
		expect(result).toEqual({ FEATURE_ID: "my-feature", AFK: true });
	});

	test("parses alias trigger", () => {
		const result = parseRawArgs('my-feature "no prompts"', schema);
		expect(result).toEqual({ FEATURE_ID: "my-feature", AFK: true });
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
			expect(result.right.environment).toEqual({});
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

	test("resolves the full directory environment set from one stable directory resolution", async () => {
		const rp1Dir = join(tempDir, ".rp1");
		await mkdir(join(rp1Dir, "context"), { recursive: true });

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

		const firstResult = await resolveArgs({
			schema_path: schemaPath,
			raw_args: "",
			project_root: tempDir,
		})();
		const secondResult = await resolveArgs({
			schema_path: schemaPath,
			raw_args: "",
			project_root: tempDir,
		})();

		expect(E.isRight(firstResult)).toBe(true);
		expect(E.isRight(secondResult)).toBe(true);
		if (E.isRight(firstResult) && E.isRight(secondResult)) {
			expect(firstResult.right.environment).toEqual({
				RP1_PROJECT_ROOT: tempDir,
				RP1_KB_ROOT: join(tempDir, ".rp1", "context"),
				RP1_WORK_ROOT: firstResult.right.environment.RP1_WORK_ROOT,
			});
			expect(secondResult.right.environment).toEqual(
				firstResult.right.environment,
			);
		}
	});

	test("explicit directory environment variables override resolver outputs", async () => {
		process.env.RP1_PROJECT_ROOT = join(tempDir, "project-override");
		process.env.RP1_KB_ROOT = join(tempDir, "kb-override");
		process.env.RP1_WORK_ROOT = join(tempDir, "work-override");

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
			expect(result.right.environment).toEqual({
				RP1_PROJECT_ROOT: join(tempDir, "project-override"),
				RP1_KB_ROOT: join(tempDir, "kb-override"),
				RP1_WORK_ROOT: join(tempDir, "work-override"),
			});
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

	test("resolves via name using development dist path", async () => {
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

	test("resolves agent by name from development dist", async () => {
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

	test("resolves skill by name from development dist", async () => {
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
