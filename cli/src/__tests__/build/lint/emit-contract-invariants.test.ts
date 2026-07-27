/**
 * Unit tests for L016: emit-contract-invariants lint rule.
 *
 * Guards the three non-inferable emit contracts from AGENTS.md: --run-id
 * presence, storageRoot on artifact_registered, and sub-agent step
 * namespacing. These break machinery silently, so they are the invariants
 * most worth pinning while prompt text is being rewritten.
 */

import { describe, expect, test } from "bun:test";
import { emitContractInvariantsRule } from "../../../build/lint/rules/emit-contract-invariants.js";

const SKILL = "rp1-build/SKILL.md";
const AGENT = "task-builder.md";

describe("L016: emit-contract-invariants", () => {
	describe("--run-id is mandatory", () => {
		test("flags a block command with no --run-id", () => {
			const content = `rp1 agent-tools emit --workflow build --type status_change --step planning`;
			const diagnostics = emitContractInvariantsRule(
				content,
				"claude-code",
				SKILL,
			);
			expect(diagnostics.length).toBe(1);
			expect(diagnostics[0].rule).toBe("L016");
			expect(diagnostics[0].severity).toBe("error");
			expect(diagnostics[0].message).toContain("--run-id");
		});

		test("accepts a block command carrying --run-id", () => {
			const content = `rp1 agent-tools emit \\
  --workflow build \\
  --type status_change \\
  --run-id {RUN_ID} \\
  --step planning`;
			expect(
				emitContractInvariantsRule(content, "claude-code", SKILL),
			).toHaveLength(0);
		});
	});

	describe("artifact_registered requires storageRoot", () => {
		test("flags artifact_registered without storageRoot", () => {
			const content = `rp1 agent-tools emit \\
  --workflow build \\
  --type artifact_registered \\
  --run-id {RUN_ID} \\
  --step planning \\
  --data '{"path": "features/x/design.md", "feature": "x"}'`;
			const diagnostics = emitContractInvariantsRule(
				content,
				"claude-code",
				SKILL,
			);
			expect(diagnostics).toHaveLength(1);
			expect(diagnostics[0].message).toContain("storageRoot");
		});

		test("accepts artifact_registered declaring storageRoot", () => {
			const content = `rp1 agent-tools emit \\
  --workflow build \\
  --type artifact_registered \\
  --run-id {RUN_ID} \\
  --step planning \\
  --data '{"path": "features/x/design.md", "storageRoot": "work_dir"}'`;
			expect(
				emitContractInvariantsRule(content, "claude-code", SKILL),
			).toHaveLength(0);
		});
	});

	describe("sub-agent status_change steps must be namespaced", () => {
		test("flags a bare step in an agent file", () => {
			const content = `rp1 agent-tools emit \\
  --workflow build \\
  --type status_change \\
  --run-id {RUN_ID} \\
  --step building`;
			const diagnostics = emitContractInvariantsRule(
				content,
				"claude-code",
				AGENT,
			);
			expect(diagnostics).toHaveLength(1);
			expect(diagnostics[0].message).toContain("not namespaced");
			expect(diagnostics[0].suggestion).toContain("{agent-name}:building");
		});

		test("accepts a namespaced step in an agent file", () => {
			const content = `rp1 agent-tools emit \\
  --workflow build \\
  --type status_change \\
  --run-id {RUN_ID} \\
  --step task-builder:building`;
			expect(
				emitContractInvariantsRule(content, "claude-code", AGENT),
			).toHaveLength(0);
		});

		test("allows bare steps in skills, which own their state machine", () => {
			const content = `rp1 agent-tools emit \\
  --workflow build \\
  --type status_change \\
  --run-id {RUN_ID} \\
  --step building`;
			expect(
				emitContractInvariantsRule(content, "claude-code", SKILL),
			).toHaveLength(0);
		});

		test("allows bare steps in a skill's reference companion", () => {
			// A companion belongs to the skill that owns the state machine, so its
			// steps are the skill's own, not a sub-agent's.
			const content = `rp1 agent-tools emit \\
  --workflow socratic-duel \\
  --type status_change \\
  --run-id {RUN_ID} \\
  --step debating`;
			expect(
				emitContractInvariantsRule(
					content,
					"claude-code",
					"rp1-socratic-duel/references/protocol.md",
				),
			).toHaveLength(0);
		});

		test("allows an unresolved placeholder step", () => {
			const content = `rp1 agent-tools emit \\
  --workflow build \\
  --type status_change \\
  --run-id {RUN_ID} \\
  --step {CURRENT_STATE}`;
			expect(
				emitContractInvariantsRule(content, "claude-code", AGENT),
			).toHaveLength(0);
		});

		test("does not require namespacing for artifact_registered", () => {
			// The step is a phase label here, intentionally matching the parent's
			// state; step-validation.ts only checks transitions for status_change.
			const content = `rp1 agent-tools emit \\
  --workflow build \\
  --type artifact_registered \\
  --run-id {RUN_ID} \\
  --step planning \\
  --data '{"path": "x.md", "storageRoot": "work_dir"}'`;
			expect(
				emitContractInvariantsRule(content, "claude-code", AGENT),
			).toHaveLength(0);
		});
	});

	describe("option values, not substrings", () => {
		test("does not accept --run-id mentioned inside a payload", () => {
			const content = `rp1 agent-tools emit \\
  --workflow build \\
  --type status_change \\
  --step planning \\
  --data '{"note": "pass --run-id from the bootstrap"}'`;
			const diagnostics = emitContractInvariantsRule(
				content,
				"claude-code",
				SKILL,
			);
			expect(diagnostics).toHaveLength(1);
			expect(diagnostics[0].message).toContain("--run-id");
		});

		test("does not accept storageRoot mentioned outside the payload", () => {
			const content = `rp1 agent-tools emit \\
  --workflow build \\
  --type artifact_registered \\
  --run-id {RUN_ID} \\
  --step planning \\
  --data '{"path": "features/x/design.md"}' # remember storageRoot`;
			const diagnostics = emitContractInvariantsRule(
				content,
				"claude-code",
				SKILL,
			);
			expect(diagnostics).toHaveLength(1);
			expect(diagnostics[0].message).toContain("storageRoot");
		});

		test("holds --step=value to the namespacing rule", () => {
			const content = `rp1 agent-tools emit --workflow build --type status_change --run-id {RUN_ID} --step=building`;
			const diagnostics = emitContractInvariantsRule(
				content,
				"claude-code",
				AGENT,
			);
			expect(diagnostics).toHaveLength(1);
			expect(diagnostics[0].message).toContain("not namespaced");
		});

		test("accepts --flag=value forms of the required options", () => {
			const content = `rp1 agent-tools emit --workflow=build --type=artifact_registered --run-id={RUN_ID} --step=planning --data='{"path": "x.md", "storageRoot": "work_dir"}'`;
			expect(
				emitContractInvariantsRule(content, "claude-code", SKILL),
			).toHaveLength(0);
		});

		test("flags an empty --run-id value", () => {
			const content = `rp1 agent-tools emit --workflow build --type status_change --run-id --step planning`;
			const diagnostics = emitContractInvariantsRule(
				content,
				"claude-code",
				SKILL,
			);
			expect(diagnostics).toHaveLength(1);
			expect(diagnostics[0].message).toContain("--run-id");
		});

		test("ignores artifact_registered named only inside a payload", () => {
			// The event type is status_change; the words in the payload must not
			// pull in the artifact contract.
			const content = `rp1 agent-tools emit \\
  --workflow build \\
  --type status_change \\
  --run-id {RUN_ID} \\
  --step planning \\
  --data '{"status": "running", "next": "artifact_registered"}'`;
			expect(
				emitContractInvariantsRule(content, "claude-code", SKILL),
			).toHaveLength(0);
		});
	});

	describe("prose references are not commands", () => {
		test("ignores an inline mention lacking --workflow", () => {
			const content =
				"Register the artifact via `rp1 agent-tools emit --type artifact_registered` in the output section.";
			expect(
				emitContractInvariantsRule(content, "claude-code", SKILL),
			).toHaveLength(0);
		});

		test("ignores a mention lacking --type", () => {
			const content =
				"See `rp1 agent-tools emit --workflow build` for details.";
			expect(
				emitContractInvariantsRule(content, "claude-code", SKILL),
			).toHaveLength(0);
		});
	});

	test("reports each violating command separately", () => {
		const content = `rp1 agent-tools emit --workflow build --type status_change --step a
prose in between
rp1 agent-tools emit --workflow build --type status_change --step b`;
		const diagnostics = emitContractInvariantsRule(
			content,
			"claude-code",
			SKILL,
		);
		expect(diagnostics).toHaveLength(2);
		expect(diagnostics[0].line).toBe(1);
		expect(diagnostics[1].line).toBe(3);
	});
});
