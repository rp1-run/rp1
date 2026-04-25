import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const projectRoot = join(import.meta.dir, "..", "..", "..", "..", "..");
const skillPath = join(
	projectRoot,
	"plugins/base/skills/socratic-duel/SKILL.md",
);

describe("socratic-duel skill contract", () => {
	test("declares agent-owned Markdown workflow and lock-only backend commands", async () => {
		const content = await readFile(skillPath, "utf-8");

		for (const transition of [
			"[*] --> register",
			"register --> load_template : registered",
			"load_template --> wait_peer : peer_missing",
			"load_template --> claim_lock : ready",
			"status_check --> claim_lock : peer_ready",
			"status_check --> claim_lock : wait_timeout",
			"claim_lock --> compose_turn : lock_acquired",
			"claim_lock --> update_markdown : timeout_lock_acquired",
			"claim_lock --> wait_turn : peer_has_lock",
			"compose_turn --> update_markdown : turn_ready",
			"update_markdown --> release_lock : markdown_updated",
			"release_lock --> wait_turn : yielded",
			"release_lock --> adjourn : terminal",
			"adjourn --> [*]",
		]) {
			expect(content).toContain(transition);
		}

		for (const command of [
			"rp1 agent-tools socratic-duel join",
			"rp1 agent-tools socratic-duel status",
			"rp1 agent-tools socratic-duel claim-lock",
			"refresh-lock",
			"release-lock",
		]) {
			expect(content).toContain(command);
		}

		for (const backendExclusion of [
			"Do not expect `rp1 agent-tools socratic-duel` to parse, render, validate, or update Markdown.",
			"Do not ask the backend for candidate convergence, terminal content, turn numbers, prior-region hashes, or template text.",
		]) {
			expect(content).toContain(backendExclusion);
		}

		expect(content).toContain(
			"Read `plugins/base/skills/artifact-templates/SKILL.md`",
		);
		expect(content).toContain("managed-debate-region");
		expect(content).toContain(
			"only a successful `claim-lock` or `refresh-lock` result can provide a usable token",
		);
		expect(content).toContain("--for-timeout");
		expect(content).toContain("--unit conclusion:{terminal_outcome}");

		expect(content).toContain("--type artifact_registered");
		expect(content).toContain('"path":"{TARGET_PATH}"');
		expect(content).toContain('"storageRoot":"absolute"');
		expect(content).toContain('"type":"markdown"');
		expect(content).toContain("Do not call `/rp1-dev:*` commands or agents.");
	});
});
