import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const projectRoot = join(import.meta.dir, "..", "..", "..", "..", "..");
const skillPath = join(
	projectRoot,
	"plugins/base/skills/socratic-duel/SKILL.md",
);

describe("socratic-duel workflow visibility contract", () => {
	test("declares artifact, participant, turn, convergence, and terminal events", async () => {
		const content = await readFile(skillPath, "utf-8");

		expect(content).toContain("--type artifact_registered");
		expect(content).toContain('"storageRoot":"work_dir"');
		expect(content).toContain('"type":"markdown"');
		expect(content).toContain('"path":"debates/{DEBATE_FILENAME}"');

		expect(content).toContain("--unit participant:{participant_id}");
		expect(content).toContain('"event":"participant_registered"');
		expect(content).toContain('"event":"participant_waiting"');
		expect(content).toContain('"event":"lock_acquired"');
		expect(content).toContain('"event":"lock_released"');

		expect(content).toContain("--unit turn:{turn_number}");
		expect(content).toContain('"event":"turn_composing"');
		expect(content).toContain('"event":"artifact_updated"');

		expect(content).toContain("--type btw_update");
		expect(content).toContain('"candidate_convergence":true');
		expect(content).toContain(
			"duel remains active until explicit terminal criteria are met",
		);

		for (const outcome of [
			"ACCEPTED_CONSENSUS",
			"DISSENT",
			"MAX_TURNS",
			"TIMEOUT",
			"INVALIDATED",
		]) {
			expect(content).toContain(outcome);
		}

		expect(content).toContain("--step completed");
		expect(content).toContain('"status":"completed"');
		expect(content).toContain("--step invalidated");
		expect(content).toContain('"status":"failed"');
		expect(content).toContain("--close-run");
	});
});
