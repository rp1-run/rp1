import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import {
	closeDatabase,
	getEmitDatabase,
	resetInstance,
} from "../../../agent-tools/emit/database.js";
import {
	executeClaimTurn,
	executeJoin,
	executeStatus,
	executeSubmitTurn,
} from "../../../agent-tools/socratic-duel/index.js";
import type { TurnInput } from "../../../agent-tools/socratic-duel/models.js";
import { expectTaskRight } from "../../helpers/index.js";

const realDateNow = Date.now;

const makeTurn = (
	label: string,
	overrides: Partial<TurnInput> = {},
): TurnInput => ({
	stance: "OPEN_TO_DEBATE",
	position: `Position ${label}`,
	counterpoints: [
		{
			addresses: "Target document",
			claim: `Counterpoint ${label}`,
			support: ["Principle: test evidence"],
		},
	],
	agreements: [`Agreement ${label}`],
	novel_argument: {
		claim: `Novel claim ${label}`,
		support: ["Principle: test evidence"],
	},
	unresolved_items: [{ item: `Unresolved ${label}`, blocking: false }],
	...overrides,
});

describe("socratic-duel coordinator", () => {
	let tempDir: string;
	let dbPath: string;
	let targetPath: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "socratic-duel-coordinator-"));
		dbPath = join(tempDir, "rp1.db");
		targetPath = join(tempDir, "target.md");
		await writeFile(targetPath, "# Target\n\nOriginal body.\n", "utf-8");
	});

	afterEach(async () => {
		Date.now = realDateNow;
		closeDatabase();
		resetInstance();
		await rm(tempDir, { recursive: true, force: true });
	});

	const joinParticipant = async (participantName: string) => {
		const result = await expectTaskRight(
			executeJoin(
				{
					targetPath,
					participantName,
					harness: "test-harness",
					modelId: "test-model",
				},
				dbPath,
			),
		);

		expect(result.success).toBe(true);
		return result.data;
	};

	const claimAndSubmit = async (
		duelId: string,
		participantId: string,
		turn: TurnInput,
	) => {
		const claim = await expectTaskRight(
			executeClaimTurn({ duelId, participantId }, dbPath),
		);
		expect(claim.success).toBe(true);
		expect(claim.data.acquired).toBe(true);
		expect(claim.data.prior_region_hash).not.toBeNull();

		const submit = await expectTaskRight(
			executeSubmitTurn(
				{
					duelId,
					participantId,
					priorRegionHash: claim.data.prior_region_hash ?? "",
					turn,
				},
				dbPath,
			),
		);
		expect(submit.success).toBe(true);
		return submit.data;
	};

	test("rejects accepted consensus while the current turn has blocking unresolved items", async () => {
		const first = await joinParticipant("participant-a");
		const second = await joinParticipant("participant-b");

		await claimAndSubmit(first.duel_id, first.participant_id, makeTurn("a1"));
		await claimAndSubmit(
			first.duel_id,
			second.participant_id,
			makeTurn("b1", {
				stance: "ACCEPTING_CONSENSUS",
				terminal_summary: "Participant B sees consensus.",
			}),
		);

		const claim = await expectTaskRight(
			executeClaimTurn(
				{ duelId: first.duel_id, participantId: first.participant_id },
				dbPath,
			),
		);
		const beforeSubmit = await readFile(targetPath, "utf-8");
		const rejected = await expectTaskRight(
			executeSubmitTurn(
				{
					duelId: first.duel_id,
					participantId: first.participant_id,
					priorRegionHash: claim.data.prior_region_hash ?? "",
					turn: makeTurn("a2", {
						stance: "ACCEPTING_CONSENSUS",
						unresolved_items: [
							{ item: "Blocking support gap remains", blocking: true },
						],
						stance_revision_support: ["Principle: test evidence"],
						terminal_outcome: "ACCEPTED_CONSENSUS",
						terminal_summary: "Consensus despite a blocker.",
					}),
				},
				dbPath,
			),
		);

		expect(rejected.success).toBe(false);
		expect(rejected.errors?.map((error) => error.message).join("\n")).toContain(
			"requires no blocking unresolved items",
		);
		expect(await readFile(targetPath, "utf-8")).toBe(beforeSubmit);

		const status = await expectTaskRight(
			executeStatus({ duelId: first.duel_id }, dbPath),
		);
		expect(status.data.duel.status).toBe("ACTIVE");
		expect(status.data.turns).toHaveLength(2);
	});

	test("does not append Markdown when database turn persistence fails", async () => {
		const first = await joinParticipant("participant-a");
		await joinParticipant("participant-b");
		const claim = await expectTaskRight(
			executeClaimTurn(
				{ duelId: first.duel_id, participantId: first.participant_id },
				dbPath,
			),
		);
		expect(claim.success).toBe(true);
		expect(claim.data.acquired).toBe(true);

		const db = await expectTaskRight(getEmitDatabase(dbPath));
		db.prepare(
			"UPDATE socratic_duels SET lease_expires_at = $leaseExpiresAt WHERE id = $id",
		).run({
			$id: first.duel_id,
			$leaseExpiresAt: new Date(1000).toISOString(),
		});

		const beforeSubmit = await readFile(targetPath, "utf-8");
		let nowCalls = 0;
		Date.now = () => {
			nowCalls += 1;
			return nowCalls === 1 ? 500 : 1500;
		};

		const result = await executeSubmitTurn(
			{
				duelId: first.duel_id,
				participantId: first.participant_id,
				priorRegionHash: claim.data.prior_region_hash ?? "",
				turn: makeTurn("db-failure"),
			},
			dbPath,
		)();
		Date.now = realDateNow;

		expect(E.isLeft(result)).toBe(true);
		expect(await readFile(targetPath, "utf-8")).toBe(beforeSubmit);

		const status = await expectTaskRight(
			executeStatus({ duelId: first.duel_id }, dbPath),
		);
		expect(status.data.turns).toHaveLength(0);
		expect(status.data.duel.status).toBe("ACTIVE");
	});
});
