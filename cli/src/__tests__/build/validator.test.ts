/**
 * Unit tests for the build tool validator module.
 * Tests rp1's validation rules for L1 (syntax) and L2 (schema) validation.
 */

import { describe, expect, test } from "bun:test";
import * as E from "fp-ts/lib/Either.js";
import {
	validateAgent,
	validateAgentSchema,
	validateAgentTierAndEffort,
	validateCommand,
	validateCommandSchema,
	validateCommandSyntax,
	validateSkill,
	validateSkillSchema,
} from "../../build/validator.js";
import { expectLeft } from "../helpers/index.js";

describe("validator", () => {
	describe("validateCommandSyntax (L1)", () => {
		test("rejects content without frontmatter", () => {
			const content = "Just plain content without frontmatter markers.";
			const result = validateCommandSyntax(content, "test.md");

			const error = expectLeft(result);
			expect(error._tag).toBe("ValidationError");
			if (error._tag === "ValidationError") {
				expect(error.level).toBe("L1");
				expect(error.message).toContain("frontmatter");
			}
		});

		test("accepts valid frontmatter structure", () => {
			const content = `---
description: A test command
---
Content here.`;
			const result = validateCommandSyntax(content, "test.md");

			expect(E.isRight(result)).toBe(true);
		});

		test("rejects malformed YAML in frontmatter", () => {
			const content = `---
description: [unclosed bracket
---
Content.`;
			const result = validateCommandSyntax(content, "test.md");

			const error = expectLeft(result);
			expect(error._tag).toBe("ValidationError");
			if (error._tag === "ValidationError") {
				expect(error.level).toBe("L1");
			}
		});
	});

	describe("validateCommandSchema (L2)", () => {
		test("rejects missing description field", () => {
			const content = `---
name: test
---
Content.`;
			const result = validateCommandSchema(content, "test.md");

			const error = expectLeft(result);
			expect(error._tag).toBe("ValidationError");
			if (error._tag === "ValidationError") {
				expect(error.level).toBe("L2");
				expect(error.message).toContain("description");
			}
		});

		test("rejects empty body content", () => {
			const content = `---
description: A test command
---
`;
			const result = validateCommandSchema(content, "test.md");

			const error = expectLeft(result);
			expect(error._tag).toBe("ValidationError");
			if (error._tag === "ValidationError") {
				expect(error.level).toBe("L2");
				expect(error.message).toContain("prompt content");
			}
		});

		test("accepts valid command with description and body", () => {
			const content = `---
description: A test command
---
This is the command content.`;
			const result = validateCommandSchema(content, "test.md");

			expect(E.isRight(result)).toBe(true);
		});
	});

	describe("validateAgentSchema (L2)", () => {
		test("requires mode === 'subagent'", () => {
			const content = `---
description: Test agent
mode: background
tools:
  bash: true
---
Content.`;
			const result = validateAgentSchema(content, "test.md");

			const error = expectLeft(result);
			expect(error._tag).toBe("ValidationError");
			if (error._tag === "ValidationError") {
				expect(error.level).toBe("L2");
				expect(error.message).toContain("subagent");
			}
		});

		test("requires tools to be object (dict), not array", () => {
			const content = `---
description: Test agent
mode: subagent
tools:
  - Read
  - Write
---
Content.`;
			const result = validateAgentSchema(content, "test.md");

			const error = expectLeft(result);
			expect(error._tag).toBe("ValidationError");
			if (error._tag === "ValidationError") {
				expect(error.level).toBe("L2");
				expect(error.message).toContain("object");
			}
		});

		test("accepts valid agent with mode=subagent and tools dict", () => {
			const content = `---
description: Test agent
mode: subagent
tools:
  bash: true
  write: false
---
Content.`;
			const result = validateAgentSchema(content, "test.md");

			expect(E.isRight(result)).toBe(true);
		});
	});

	describe("validateSkillSchema (L2)", () => {
		test("enforces description length >= 20 chars", () => {
			const content = `---
name: short
description: Too short
---
Content.`;
			const result = validateSkillSchema(content, "test.md");

			const error = expectLeft(result);
			expect(error._tag).toBe("ValidationError");
			if (error._tag === "ValidationError") {
				expect(error.level).toBe("L2");
				expect(error.message).toContain("20 chars");
			}
		});

		test("requires discovery metadata for skills", () => {
			const content = `---
name: valid-skill
description: This description has at least 20 characters
metadata:
  version: 1.0.0
---
Content.`;
			const result = validateSkillSchema(content, "test.md");

			const error = expectLeft(result);
			expect(error._tag).toBe("ValidationError");
			if (error._tag === "ValidationError") {
				expect(error.level).toBe("L2");
				expect(error.message).toContain("metadata.category");
				expect(error.message).toContain("metadata.is_workflow");
			}
		});

		test("rejects invalid metadata.category values", () => {
			const content = `---
name: valid-skill
description: This description has at least 20 characters
metadata:
  category: unsupported
  is_workflow: false
---
Content.`;
			const result = validateSkillSchema(content, "test.md");

			const error = expectLeft(result);
			expect(error._tag).toBe("ValidationError");
			if (error._tag === "ValidationError") {
				expect(error.level).toBe("L2");
				expect(error.message).toContain("metadata.category");
				expect(error.message).toContain("development");
			}
		});

		test("rejects non-boolean metadata.is_workflow", () => {
			const content = `---
name: valid-skill
description: This description has at least 20 characters
metadata:
  category: development
  is_workflow: "yes"
---
Content.`;
			const result = validateSkillSchema(content, "test.md");

			const error = expectLeft(result);
			expect(error._tag).toBe("ValidationError");
			if (error._tag === "ValidationError") {
				expect(error.level).toBe("L2");
				expect(error.message).toContain("metadata.is_workflow");
				expect(error.message).toContain("boolean");
			}
		});

		test("rejects non-boolean metadata.arcade_tracked", () => {
			const content = `---
name: valid-skill
description: This description has at least 20 characters
metadata:
  category: development
  is_workflow: true
  arcade_tracked: "no"
  workflow:
    run_policy: fresh
    identity_args: []
---
Content.`;
			const result = validateSkillSchema(content, "test.md");

			const error = expectLeft(result);
			expect(error._tag).toBe("ValidationError");
			if (error._tag === "ValidationError") {
				expect(error.level).toBe("L2");
				expect(error.message).toContain("metadata.arcade_tracked");
				expect(error.message).toContain("boolean");
			}
		});

		test("accepts skill with description >= 20 chars", () => {
			const content = `---
name: valid-skill
description: This description has at least 20 characters
metadata:
  category: development
  is_workflow: false
---
Content.`;
			const result = validateSkillSchema(content, "test.md");

			expect(E.isRight(result)).toBe(true);
		});

		test("accepts boolean metadata.arcade_tracked", () => {
			const content = `---
name: valid-skill
description: This description has at least 20 characters
metadata:
  category: knowledge
  is_workflow: true
  arcade_tracked: false
  workflow:
    run_policy: fresh
    identity_args: []
---
Content.`;
			const result = validateSkillSchema(content, "test.md");

			expect(E.isRight(result)).toBe(true);
		});

		test("rejects tracked workflows without metadata.workflow.run_policy", () => {
			const content = `---
name: tracked-workflow
description: This description has at least 20 characters
metadata:
  category: development
  is_workflow: true
---
Content.`;
			const result = validateSkillSchema(content, "test.md");

			const error = expectLeft(result);
			expect(error._tag).toBe("ValidationError");
			if (error._tag === "ValidationError") {
				expect(error.level).toBe("L2");
				expect(error.message).toContain("metadata.workflow.run_policy");
			}
		});

		test("rejects resumable workflows with identity args that are not declared arguments", () => {
			const content = `---
name: tracked-workflow
description: This description has at least 20 characters
metadata:
  category: development
  is_workflow: true
  arguments:
    - name: FEATURE_ID
      type: string
      required: true
      description: "Feature identifier"
  workflow:
    run_policy: resumable
    identity_args:
      - RUN_ID
---
Content.`;
			const result = validateSkillSchema(content, "test.md");

			const error = expectLeft(result);
			expect(error._tag).toBe("ValidationError");
			if (error._tag === "ValidationError") {
				expect(error.message).toContain("metadata.workflow.identity_args");
				expect(error.message).toContain("RUN_ID");
			}
		});

		test("rejects fresh workflows with non-empty identity args", () => {
			const content = `---
name: tracked-workflow
description: This description has at least 20 characters
metadata:
  category: development
  is_workflow: true
  workflow:
    run_policy: fresh
    identity_args:
      - FEATURE_ID
---
Content.`;
			const result = validateSkillSchema(content, "test.md");

			const error = expectLeft(result);
			expect(error._tag).toBe("ValidationError");
			if (error._tag === "ValidationError") {
				expect(error.message).toContain("metadata.workflow.identity_args");
				expect(error.message).toContain("fresh");
			}
		});

		test("accepts tracked workflows with valid resumable metadata", () => {
			const content = `---
name: tracked-workflow
description: This description has at least 20 characters
metadata:
  category: development
  is_workflow: true
  arguments:
    - name: FEATURE_ID
      type: string
      required: true
      description: "Feature identifier"
  workflow:
    run_policy: resumable
    identity_args:
      - FEATURE_ID
---
Content.`;
			const result = validateSkillSchema(content, "test.md");

			expect(E.isRight(result)).toBe(true);
		});
	});

	describe("validateAgentTierAndEffort", () => {
		test("rejects unknown model tier with allowed values listed", () => {
			const result = validateAgentTierAndEffort(
				"test-agent",
				"turbo",
				undefined,
				"test-agent.md",
			);
			expect(result.errors.length).toBe(1);
			expect(result.errors[0]).toContain("turbo");
			expect(result.errors[0]).toContain("deep");
			expect(result.errors[0]).toContain("standard");
			expect(result.errors[0]).toContain("fast");
			expect(result.errors[0]).toContain("inherit");
			expect(result.warnings.length).toBe(0);
		});

		test("rejects unknown effort level with allowed values listed", () => {
			const result = validateAgentTierAndEffort(
				"test-agent",
				"standard",
				"extreme",
				"test-agent.md",
			);
			expect(result.errors.length).toBe(1);
			expect(result.errors[0]).toContain("extreme");
			expect(result.errors[0]).toContain("low");
			expect(result.errors[0]).toContain("high");
			expect(result.warnings.length).toBe(0);
		});

		test("warns on fast tier with effort set", () => {
			const result = validateAgentTierAndEffort(
				"test-agent",
				"fast",
				"high",
				"test-agent.md",
			);
			expect(result.errors.length).toBe(0);
			expect(result.warnings.length).toBe(1);
			expect(result.warnings[0]).toContain("fast");
			expect(result.warnings[0]).toContain("effort");
		});

		test("warns on protected agent downgrade to standard", () => {
			const result = validateAgentTierAndEffort(
				"feature-architect",
				"standard",
				"high",
				"feature-architect.md",
			);
			expect(result.errors.length).toBe(0);
			expect(result.warnings.length).toBe(1);
			expect(result.warnings[0]).toContain("feature-architect");
			expect(result.warnings[0]).toContain("protected");
		});

		test("warns on protected agent downgrade to fast", () => {
			const result = validateAgentTierAndEffort(
				"task-reviewer",
				"fast",
				undefined,
				"task-reviewer.md",
			);
			expect(result.errors.length).toBe(0);
			// fast + protected = 2 warnings (fast+no-effort is fine since effort is undefined, but protected downgrade)
			// Actually: fast with no effort => no fast+effort warning. Protected downgrade => 1 warning.
			expect(result.warnings.length).toBe(1);
			expect(result.warnings[0]).toContain("protected");
		});

		test("accepts valid tier and effort combination", () => {
			const result = validateAgentTierAndEffort(
				"speedrun-builder",
				"standard",
				"medium",
				"speedrun-builder.md",
			);
			expect(result.errors.length).toBe(0);
			expect(result.warnings.length).toBe(0);
		});

		test("accepts inherit tier with no effort", () => {
			const result = validateAgentTierAndEffort(
				"test-agent",
				"inherit",
				undefined,
				"test-agent.md",
			);
			expect(result.errors.length).toBe(0);
			expect(result.warnings.length).toBe(0);
		});

		test("accepts deep tier on protected agent", () => {
			const result = validateAgentTierAndEffort(
				"feature-architect",
				"deep",
				"high",
				"feature-architect.md",
			);
			expect(result.errors.length).toBe(0);
			expect(result.warnings.length).toBe(0);
		});

		test("does not warn on protected agent with inherit tier", () => {
			const result = validateAgentTierAndEffort(
				"security-validator",
				"inherit",
				undefined,
				"security-validator.md",
			);
			expect(result.errors.length).toBe(0);
			expect(result.warnings.length).toBe(0);
		});

		test("collects both error and warning when both conditions apply", () => {
			const result = validateAgentTierAndEffort(
				"feature-architect",
				"fast",
				"extreme",
				"feature-architect.md",
			);
			// error: unknown effort "extreme"
			// warning: fast+effort (even though effort is invalid, the combo check still warns)
			// warning: protected agent downgrade
			expect(result.errors.length).toBe(1);
			expect(result.errors[0]).toContain("extreme");
			expect(result.warnings.length).toBe(2);
		});
	});

	describe("combined validation", () => {
		test("validateCommand catches both L1 and L2 errors", () => {
			const noFrontmatter = "Just content";
			const l1Result = validateCommand(noFrontmatter, "test.md");
			expect(E.isLeft(l1Result)).toBe(true);

			const noDescription = `---
name: test
---
Content.`;
			const l2Result = validateCommand(noDescription, "test.md");
			expect(E.isLeft(l2Result)).toBe(true);
		});

		test("validateAgent catches both L1 and L2 errors", () => {
			const noFrontmatter = "Just content";
			const l1Result = validateAgent(noFrontmatter, "test.md");
			expect(E.isLeft(l1Result)).toBe(true);

			const wrongMode = `---
description: Test
mode: wrong
tools:
  bash: true
---
Content.`;
			const l2Result = validateAgent(wrongMode, "test.md");
			expect(E.isLeft(l2Result)).toBe(true);
		});

		test("validateSkill catches both L1 and L2 errors", () => {
			const noFrontmatter = "Just content";
			const l1Result = validateSkill(noFrontmatter, "test.md");
			expect(E.isLeft(l1Result)).toBe(true);

			const shortDesc = `---
name: test
description: Short
metadata:
  category: development
  is_workflow: false
---
Content.`;
			const l2Result = validateSkill(shortDesc, "test.md");
			expect(E.isLeft(l2Result)).toBe(true);
		});
	});
});
