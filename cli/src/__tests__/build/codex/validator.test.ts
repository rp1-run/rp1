/**
 * Unit tests for the Codex build validators.
 * Tests skill validation (L1 + L2) and TOML validation.
 */

import { describe, expect, test } from "bun:test";
import * as E from "fp-ts/lib/Either.js";
import {
	validateCodexSkill,
	validateCodexToml,
} from "../../../build/codex/validator.js";
import { expectLeft } from "../../helpers/index.js";

describe("validateCodexSkill", () => {
	describe("L1 syntax validation", () => {
		test("rejects content without frontmatter", () => {
			const content = "Just plain content without frontmatter.";
			const error = expectLeft(validateCodexSkill(content, "test/SKILL.md"));

			expect(error._tag).toBe("ValidationError");
			if (error._tag === "ValidationError") {
				expect(error.level).toBe("L1");
				expect(error.message).toContain("frontmatter");
			}
		});

		test("rejects invalid frontmatter structure", () => {
			const content = "---\nOnly opening frontmatter";
			const error = expectLeft(validateCodexSkill(content, "test/SKILL.md"));

			expect(error._tag).toBe("ValidationError");
			if (error._tag === "ValidationError") {
				expect(error.level).toBe("L1");
			}
		});

		test("rejects malformed YAML", () => {
			const content = `---
name: [unclosed bracket
---
Content.`;
			const error = expectLeft(validateCodexSkill(content, "test/SKILL.md"));

			expect(error._tag).toBe("ValidationError");
			if (error._tag === "ValidationError") {
				expect(error.level).toBe("L1");
			}
		});

		test("accepts valid frontmatter", () => {
			const content = `---
name: test-skill
description: A valid test skill for testing purposes here
---
Content here.`;
			const result = validateCodexSkill(content, "test/SKILL.md");
			expect(E.isRight(result)).toBe(true);
		});
	});

	describe("L2 schema validation", () => {
		test("rejects missing name field", () => {
			const content = `---
description: A valid test skill for testing purposes here
---
Content.`;
			const error = expectLeft(validateCodexSkill(content, "test/SKILL.md"));

			expect(error._tag).toBe("ValidationError");
			if (error._tag === "ValidationError") {
				expect(error.level).toBe("L2");
				expect(error.message).toContain("name");
			}
		});

		test("rejects missing description field", () => {
			const content = `---
name: test-skill
---
Content.`;
			const error = expectLeft(validateCodexSkill(content, "test/SKILL.md"));

			expect(error._tag).toBe("ValidationError");
			if (error._tag === "ValidationError") {
				expect(error.level).toBe("L2");
				expect(error.message).toContain("description");
			}
		});

		test("rejects description shorter than 20 chars", () => {
			const content = `---
name: test-skill
description: Too short
---
Content.`;
			const error = expectLeft(validateCodexSkill(content, "test/SKILL.md"));

			expect(error._tag).toBe("ValidationError");
			if (error._tag === "ValidationError") {
				expect(error.level).toBe("L2");
				expect(error.message).toContain("Description too short");
			}
		});

		test("accepts description with exactly 20 chars", () => {
			const content = `---
name: test-skill
description: "12345678901234567890"
---
Content.`;
			const result = validateCodexSkill(content, "test/SKILL.md");
			expect(E.isRight(result)).toBe(true);
		});

		test("rejects empty frontmatter", () => {
			const content = `---
---
Content.`;
			const error = expectLeft(validateCodexSkill(content, "test/SKILL.md"));

			expect(error._tag).toBe("ValidationError");
			if (error._tag === "ValidationError") {
				expect(error.level).toBe("L2");
			}
		});
	});
});

describe("validateCodexToml", () => {
	test("accepts valid TOML with agents table", () => {
		const toml = `[agents.my-agent]
model = "inherit"
role = "worker"
developer_instructions = "You are a worker agent."
`;
		const result = validateCodexToml(toml, "rp1-agents.toml");
		expect(E.isRight(result)).toBe(true);
	});

	test("rejects invalid TOML syntax", () => {
		const toml = "this is not valid toml [[[";
		const error = expectLeft(validateCodexToml(toml, "rp1-agents.toml"));

		expect(error._tag).toBe("ValidationError");
		if (error._tag === "ValidationError") {
			expect(error.level).toBe("L1");
			expect(error.message).toContain("TOML");
		}
	});

	test("rejects missing agents table", () => {
		const toml = `[config]
key = "value"
`;
		const error = expectLeft(validateCodexToml(toml, "rp1-agents.toml"));

		expect(error._tag).toBe("ValidationError");
		if (error._tag === "ValidationError") {
			expect(error.level).toBe("L2");
			expect(error.message).toContain("[agents]");
		}
	});

	test("rejects empty agents table", () => {
		const toml = `[agents]
`;
		const error = expectLeft(validateCodexToml(toml, "rp1-agents.toml"));

		expect(error._tag).toBe("ValidationError");
		if (error._tag === "ValidationError") {
			expect(error.level).toBe("L2");
			expect(error.message).toContain("No agent definitions");
		}
	});

	test("rejects agent section missing developer_instructions", () => {
		const toml = `[agents.my-agent]
model = "inherit"
role = "worker"
`;
		const error = expectLeft(validateCodexToml(toml, "rp1-agents.toml"));

		expect(error._tag).toBe("ValidationError");
		if (error._tag === "ValidationError") {
			expect(error.level).toBe("L2");
			expect(error.message).toContain("developer_instructions");
		}
	});

	test("rejects agent section missing role", () => {
		const toml = `[agents.my-agent]
model = "inherit"
developer_instructions = "Instructions here."
`;
		const error = expectLeft(validateCodexToml(toml, "rp1-agents.toml"));

		expect(error._tag).toBe("ValidationError");
		if (error._tag === "ValidationError") {
			expect(error.level).toBe("L2");
			expect(error.message).toContain("role");
		}
	});

	test("accepts multiple valid agent sections", () => {
		const toml = `[agents.builder]
model = "inherit"
role = "worker"
developer_instructions = "Build things."

[agents.reviewer]
model = "inherit"
role = "reviewer"
developer_instructions = "Review things."
`;
		const result = validateCodexToml(toml, "rp1-agents.toml");
		expect(E.isRight(result)).toBe(true);
	});
});
