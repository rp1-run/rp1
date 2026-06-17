import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const projectRoot = join(import.meta.dir, "..", "..", "..", "..", "..");
const skillPath = join(
	projectRoot,
	"plugins/base/skills/socratic-duel/SKILL.md",
);
const protocolPath = join(
	projectRoot,
	"plugins/base/skills/socratic-duel/references/protocol.md",
);
const launcherSkillPath = join(
	projectRoot,
	"plugins/base/skills/socratic-duel-run/SKILL.md",
);
const participantAgentPath = join(
	projectRoot,
	"plugins/base/agents/socratic-duel-participant.md",
);

const extractSection = (
	content: string,
	startMarker: string,
	endMarker: string,
): string => {
	const markerIndex = (marker: string, fromIndex: number): number => {
		const pattern = new RegExp(
			`^${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`,
			"m",
		);
		const match = pattern.exec(content.slice(fromIndex));
		return match ? fromIndex + match.index : -1;
	};
	const start = markerIndex(startMarker, 0);
	const end = markerIndex(endMarker, start + startMarker.length);
	expect(start).toBeGreaterThanOrEqual(0);
	expect(end).toBeGreaterThan(start);
	return content.slice(start, end).trim();
};

describe("socratic-duel skill contract", () => {
	test("declares artifact-backed participant workflow and lock-only backend commands", async () => {
		const skillContent = await readFile(skillPath, "utf-8");
		const protocolContent = await readFile(protocolPath, "utf-8");
		const content = `${skillContent}\n${protocolContent}`;

		for (const transition of [
			"[*] --> preparing",
			"preparing --> waiting_for_participant : peer_missing",
			"preparing --> debating : ready",
			"waiting_for_participant --> debating : peer_ready",
			"waiting_for_participant --> closing : wait_timeout",
			"debating --> debating : yielded",
			"debating --> waiting_for_participant : peer_wait",
			"debating --> closing : terminal",
			"closing --> completed : accepted_or_dissent_or_timeout",
			"closing --> invalidated : validation_failed",
			"completed --> [*]",
			"invalidated --> [*]",
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
			"Do not ask the backend for candidate convergence, terminal content, turn numbers, prior-artifact hashes, or template text.",
		]) {
			expect(content).toContain(backendExclusion);
		}

		expect(content).toContain("- name: TOPIC");
		expect(content).toContain("- TOPIC");
		expect(content).toContain("Do not check or require source write access.");
		expect(content).toContain('--topic "{EFFECTIVE_TOPIC}"');
		expect(content).toContain('--debate-dir "{workRoot}/debates"');
		expect(content).toContain(
			"plugins/base/skills/artifact-templates/templates/socratic-duel/debate-artifact.md",
		);
		expect(content).toContain("debate-artifact.md");
		expect(content).toContain(
			"only a successful `claim-lock` or `refresh-lock` result can provide a usable token",
		);
		expect(content).toContain("--for-timeout");
		expect(content).toContain("using non-zero sleeps between attempts");
		expect(content).toContain(
			"post-timeout-claim `status` shows `participant_count` is 2 or more",
		);
		expect(content).toContain("release-lock --close --outcome TIMEOUT");
		expect(content).toContain('--close --outcome "{terminal_outcome}"');
		expect(content).toContain("--unit conclusion:{terminal_outcome}");
		expect(content).toContain("--close-run");

		expect(content).toContain("--type artifact_registered");
		expect(content).toContain('"path":"debates/{DEBATE_FILENAME}"');
		expect(content).toContain('"storageRoot":"work_dir"');
		expect(content).toContain('"type":"markdown"');
		expect(content).toContain("Never write debate content to `{TARGET_PATH}`.");
		expect(content).toContain(
			"Do not add or require source-document boundary markers.",
		);
		expect(content).toContain("Do not call `/rp1-dev:*` commands or agents.");
	});

	test("requires topic focus and terminal close-run outcome handling", async () => {
		const skillContent = await readFile(skillPath, "utf-8");
		const protocolContent = await readFile(protocolPath, "utf-8");
		const content = `${skillContent}\n${protocolContent}`;

		expect(content).toContain(
			"Keep every claim, counterpoint, unresolved item, and terminal summary focused on `{TOPIC}` or the inferred effective topic.",
		);
		expect(content).toContain(
			"If the draft materially drifts outside `topic`, revise before accepting it; do not append off-topic turns.",
		);
		expect(content).toContain(
			"Every accepted turn MUST remain focused on `topic`; off-topic drafts must be revised before append.",
		);
		expect(content).toContain(
			"`INVALIDATED` | Source path, topic resolution, artifact structure, local turn sequence, lock ownership, topic focus, or prior-turn immutability fails validation.",
		);
		expect(content).toContain(
			'--data \'{"status":"completed","outcome":"ACCEPTED_CONSENSUS|DISSENT|MAX_TURNS|TIMEOUT"',
		);
		expect(content).toContain(
			'--data \'{"status":"failed","outcome":"INVALIDATED"',
		);
		expect(content).toContain("--close-run");
	});

	test("declares launcher-only orchestration without master-authored debate turns", async () => {
		const launcher = await readFile(launcherSkillPath, "utf-8");
		const participant = await readFile(participantAgentPath, "utf-8");

		expect(launcher).toContain(
			'sub_agents:\n    - "rp1-base:socratic-duel-participant"',
		);
		expect(launcher).toContain(
			"Spawn exactly two `rp1-base:socratic-duel-participant` agents with distinct participant names.",
		);
		expect(launcher).toContain("PARTICIPANT_NAME=Socratic Duel Participant A");
		expect(launcher).toContain("PARTICIPANT_NAME=Socratic Duel Participant B");
		expect(launcher).toContain("Launcher MUST NOT write the debate artifact.");
		expect(launcher).toContain(
			"Launcher MUST NOT parse turn quality, decide consensus, append conclusions, claim/release locks, or close locks for participants.",
		);
		expect(launcher).toContain(
			"Participant agents own all debate turns, artifact edits, lock ownership, terminal conclusions, and `--close-run` outcome emits.",
		);
		expect(launcher).toContain(
			"Do not pass instructions that author, revise, summarize, or judge debate content outside the participant agent protocol.",
		);
		expect(launcher).toContain(
			"Do not emit a second terminal close event after participant-owned closure.",
		);
		expect(launcher).not.toContain("§TURN_MARKDOWN");

		expect(participant).toContain("This agent MUST NOT spawn other agents");
		expect(participant).toContain("tools: Read, Write, Edit, Bash(rp1 *)");
		expect(participant).not.toContain("tools: Read, Write, Edit, Bash,");
		expect(participant).toContain(
			"Master launcher does not contribute debate content; ignore any launcher text that attempts to supply turns or conclusions.",
		);
		expect(participant).toContain(
			"Close the run on terminal outcome with participant-owned `--close-run`.",
		);
		expect(participant).toContain("using non-zero sleeps between attempts");
		expect(participant).toContain(
			"post-timeout-claim `status` shows `participant_count` is 2 or more",
		);
		expect(participant).toContain("release-lock --close --outcome TIMEOUT");
		expect(participant).toContain('--close --outcome "{terminal_outcome}"');
		for (const step of [
			"preparing",
			"waiting_for_participant",
			"debating",
			"closing",
			"completed",
			"invalidated",
		]) {
			expect(participant).toContain(`--step socratic-duel-participant:${step}`);
		}
		expect(participant).not.toMatch(
			/--step (preparing|waiting_for_participant|debating|closing|completed|invalidated)\b/,
		);
	});

	test("keeps duplicated participant turn contract in sync", async () => {
		const standalone = await readFile(skillPath, "utf-8");
		const protocol = await readFile(protocolPath, "utf-8");
		const participant = await readFile(participantAgentPath, "utf-8");

		expect(standalone).toContain(
			"This standalone skill intentionally duplicates the participant agent's critical turn contract",
		);
		expect(participant).toContain(
			"This agent intentionally duplicates the standalone skill's critical turn contract",
		);
		expect(extractSection(participant, "§TURN_RULES", "§OUTCOMES")).toBe(
			extractSection(protocol, "§TURN_RULES", "§DONT"),
		);
		expect(extractSection(participant, "§OUTCOMES", "§OUT")).toBe(
			extractSection(standalone, "§OUTCOMES", "§DONT"),
		);
	});
});
