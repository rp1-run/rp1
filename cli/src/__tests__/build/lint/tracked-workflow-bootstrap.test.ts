/**
 * Unit tests for L007: tracked-workflow bootstrap lint rule.
 */

import { describe, expect, test } from "bun:test";
import { trackedWorkflowBootstrapRule } from "../../../build/lint/rules/tracked-workflow-bootstrap.js";

const trackedWorkflowFrontmatter = `---
name: rp1-dev-build-fast
metadata:
  category: development
  is_workflow: true
---
`;

describe("L007: tracked-workflow-bootstrap", () => {
	test("passes for tracked workflow with one generated bootstrap command", () => {
		const content = `${trackedWorkflowFrontmatter}
## 0. Workflow Bootstrap

\`\`\`bash
rp1 agent-tools workflow-bootstrap \\
  --name build-fast \\
  --schema-path plugins/dev/skills/build-fast/SKILL.md \\
  --project-root "$PWD" \\
  --harness codex
\`\`\`
`;

		const diagnostics = trackedWorkflowBootstrapRule(
			content,
			"codex",
			"skill.md",
		);

		expect(diagnostics).toEqual([]);
	});

	test("rejects tracked workflow missing bootstrap command", () => {
		const content = `${trackedWorkflowFrontmatter}
Generate \`RUN_ID\` as a UUID at workflow start
`;

		const diagnostics = trackedWorkflowBootstrapRule(
			content,
			"claude-code",
			"skill.md",
		);

		expect(diagnostics.some((d) => d.message.includes("missing"))).toBe(true);
		expect(
			diagnostics.some((d) => d.message.includes("manual RUN_ID generation")),
		).toBe(true);
	});

	test("rejects bootstrap commands without generated target inputs", () => {
		const content = `${trackedWorkflowFrontmatter}
\`\`\`bash
rp1 agent-tools workflow-bootstrap \\
  --project-root "$PWD" \\
  --harness opencode
\`\`\`
`;

		const diagnostics = trackedWorkflowBootstrapRule(
			content,
			"opencode",
			"skill.md",
		);

		expect(
			diagnostics.some((d) => d.message.includes("--name and --schema-path")),
		).toBe(true);
	});

	test("rejects direct emit resume-run calls in tracked workflows", () => {
		const content = `${trackedWorkflowFrontmatter}
rp1 agent-tools emit resume-run --feature test --flow build
`;

		const diagnostics = trackedWorkflowBootstrapRule(
			content,
			"codex",
			"skill.md",
		);

		expect(diagnostics.some((d) => d.message.includes("emit resume-run"))).toBe(
			true,
		);
	});

	test("rejects multiple bootstrap commands", () => {
		const content = `${trackedWorkflowFrontmatter}
\`\`\`bash
rp1 agent-tools workflow-bootstrap --name build --schema-path plugins/dev/skills/build/SKILL.md
\`\`\`

\`\`\`bash
rp1 agent-tools workflow-bootstrap --name build --schema-path plugins/dev/skills/build/SKILL.md
\`\`\`
`;

		const diagnostics = trackedWorkflowBootstrapRule(
			content,
			"codex",
			"skill.md",
		);

		expect(
			diagnostics.some((d) =>
				d.message.includes("multiple workflow-bootstrap"),
			),
		).toBe(true);
	});

	test("ignores non-tracked workflows", () => {
		const content = `---
name: rp1-dev-code-investigate
metadata:
  category: investigation
  is_workflow: false
---
Generate \`RUN_ID\` as a UUID at workflow start
rp1 agent-tools emit resume-run --feature test --flow build
`;

		const diagnostics = trackedWorkflowBootstrapRule(
			content,
			"codex",
			"skill.md",
		);

		expect(diagnostics).toEqual([]);
	});
});
