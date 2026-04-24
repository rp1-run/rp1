import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const projectRoot = join(import.meta.dir, "..", "..", "..", "..", "..");
const skillPath = join(
	projectRoot,
	"plugins/base/skills/socratic-duel/SKILL.md",
);

describe("socratic-duel skill contract", () => {
	test("declares the workflow state machine, coordinator commands, and absolute artifact payload", async () => {
		const content = await readFile(skillPath, "utf-8");

		for (const transition of [
			"[*] --> register",
			"register --> wait_peer : peer_missing",
			"register --> claim_turn : ready",
			"wait_peer --> claim_turn : peer_ready",
			"wait_peer --> adjourn : wait_timeout",
			"claim_turn --> compose_turn : floor_acquired",
			"claim_turn --> wait_turn : peer_has_floor",
			"wait_turn --> claim_turn : retry",
			"wait_turn --> adjourn : wait_timeout",
			"compose_turn --> submit_turn : turn_ready",
			"submit_turn --> claim_turn : yielded",
			"submit_turn --> adjourn : terminal",
			"adjourn --> [*]",
		]) {
			expect(content).toContain(transition);
		}

		for (const command of [
			"rp1 agent-tools socratic-duel join",
			"rp1 agent-tools socratic-duel claim-turn",
			"rp1 agent-tools socratic-duel submit-turn",
			"adjourn` with `TIMEOUT`",
		]) {
			expect(content).toContain(command);
		}

		expect(content).toContain("--type artifact_registered");
		expect(content).toContain('"path":"{TARGET_PATH}"');
		expect(content).toContain('"storageRoot":"absolute"');
		expect(content).toContain('"type":"markdown"');
		expect(content).toContain("Do not call `/rp1-dev:*` commands or agents.");
	});
});
