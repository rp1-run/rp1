/**
 * Unit tests for the build tool validator module.
 * Tests rp1's validation rules for L1 (syntax) and L2 (schema) validation.
 */

import { describe, expect, test } from "bun:test";
import * as E from "fp-ts/lib/Either.js";
import {
	validateAgent,
	validateAgentSchema,
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

		test("accepts skill with description >= 20 chars", () => {
			const content = `---
name: valid-skill
description: This description has at least 20 characters
---
Content.`;
			const result = validateSkillSchema(content, "test.md");

			expect(E.isRight(result)).toBe(true);
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
---
Content.`;
			const l2Result = validateSkill(shortDesc, "test.md");
			expect(E.isLeft(l2Result)).toBe(true);
		});
	});
});
