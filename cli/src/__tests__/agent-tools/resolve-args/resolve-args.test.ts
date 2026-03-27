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
import type { ArgumentDefinition } from "../../../build/models.js";

let tempDir: string;

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "resolve-args-test-"));
});

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true });
	// Clean up any env vars set during tests
	delete process.env.TEST_PLATFORM;
	delete process.env.RP1_ROOT;
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
  - name: RP1_ROOT
    source: "rp1 agent-tools rp1-root-dir"
    description: "Root directory"
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

	test("returns error for missing schema file", async () => {
		const result = await resolveArgs({
			schema_path: join(tempDir, "nonexistent.md"),
			raw_args: "",
			project_root: tempDir,
		})();

		expect(E.isLeft(result)).toBe(true);
	});
});
