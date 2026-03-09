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
	test("accepts valid TOML with description and config_file", () => {
		const toml = `[agents.my-agent]
description = "A worker agent that builds things."
config_file = "./agents/rp1/my-agent.toml"
`;
		const result = validateCodexToml(toml, "config.toml");
		expect(E.isRight(result)).toBe(true);
	});

	test("rejects invalid TOML syntax", () => {
		const toml = "this is not valid toml [[[";
		const error = expectLeft(validateCodexToml(toml, "config.toml"));

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
		const error = expectLeft(validateCodexToml(toml, "config.toml"));

		expect(error._tag).toBe("ValidationError");
		if (error._tag === "ValidationError") {
			expect(error.level).toBe("L2");
			expect(error.message).toContain("[agents]");
		}
	});

	test("rejects empty agents table", () => {
		const toml = `[agents]
`;
		const error = expectLeft(validateCodexToml(toml, "config.toml"));

		expect(error._tag).toBe("ValidationError");
		if (error._tag === "ValidationError") {
			expect(error.level).toBe("L2");
			expect(error.message).toContain("No agent definitions");
		}
	});

	test("rejects agent section missing description", () => {
		const toml = `[agents.my-agent]
config_file = "./agents/rp1/my-agent.toml"
`;
		const error = expectLeft(validateCodexToml(toml, "config.toml"));

		expect(error._tag).toBe("ValidationError");
		if (error._tag === "ValidationError") {
			expect(error.level).toBe("L2");
			expect(error.message).toContain("description");
		}
	});

	test("rejects agent section with empty description", () => {
		const toml = `[agents.my-agent]
description = ""
config_file = "./agents/rp1/my-agent.toml"
`;
		const error = expectLeft(validateCodexToml(toml, "config.toml"));

		expect(error._tag).toBe("ValidationError");
		if (error._tag === "ValidationError") {
			expect(error.level).toBe("L2");
			expect(error.message).toContain("description");
		}
	});

	test("rejects agent section missing config_file", () => {
		const toml = `[agents.my-agent]
description = "A worker agent that builds things."
`;
		const error = expectLeft(validateCodexToml(toml, "config.toml"));

		expect(error._tag).toBe("ValidationError");
		if (error._tag === "ValidationError") {
			expect(error.level).toBe("L2");
			expect(error.message).toContain("config_file");
		}
	});

	test("rejects agent section with empty config_file", () => {
		const toml = `[agents.my-agent]
description = "A worker agent that builds things."
config_file = ""
`;
		const error = expectLeft(validateCodexToml(toml, "config.toml"));

		expect(error._tag).toBe("ValidationError");
		if (error._tag === "ValidationError") {
			expect(error.level).toBe("L2");
			expect(error.message).toContain("config_file");
		}
	});

	test("accepts multiple valid agent sections", () => {
		const toml = `[agents.builder]
description = "Builds features from task specifications."
config_file = "./agents/rp1/builder.toml"

[agents.reviewer]
description = "Reviews code changes for quality."
config_file = "./agents/rp1/reviewer.toml"
`;
		const result = validateCodexToml(toml, "config.toml");
		expect(E.isRight(result)).toBe(true);
	});
});
