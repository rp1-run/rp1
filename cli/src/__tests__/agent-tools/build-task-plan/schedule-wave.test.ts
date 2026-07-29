import { describe, expect, test } from "bun:test";
import { scheduleWave } from "../../../agent-tools/build-task-plan/index.js";
import type {
	BuildTaskPlanTask,
	BuildTaskUnit,
	ScheduleWaveInput,
} from "../../../agent-tools/build-task-plan/models.js";

const task = (
	id: string,
	target: string,
	overrides: Partial<BuildTaskPlanTask> = {},
): BuildTaskPlanTask => ({
	id,
	title: `Task ${id}`,
	type: "code",
	status: "pending",
	complexity: "simple",
	acceptance_refs: ["REQ-001"],
	dependencies: [],
	target,
	...overrides,
});

const unit = (
	unit_id: number,
	task_ids: string[],
	depends_on: string[] = [],
): BuildTaskUnit => ({
	unit_id,
	task_ids,
	complexity: "simple",
	depends_on,
});

const wave = (
	overrides: Partial<ScheduleWaveInput> = {},
): ScheduleWaveInput => ({
	task_units: [],
	tasks: [],
	completed_task_ids: [],
	built_task_ids: [],
	pending_integration_task_ids: [],
	max_builders: 4,
	git_commit: true,
	clean_tree: true,
	...overrides,
});

describe("scheduleWave", () => {
	test("returns empty dispatch when no units exist", () => {
		const result = scheduleWave(wave());

		expect(result.dispatch).toEqual([]);
		expect(result.held).toEqual([]);
		expect(result.mode).toBe("serial");
		expect(result.reason).toBe("no_ready_units");
	});

	test("returns empty dispatch when all units are completed", () => {
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1"]), unit(2, ["T2"])],
				tasks: [task("T1", "src/a.ts"), task("T2", "src/b.ts")],
				completed_task_ids: ["T1", "T2"],
			}),
		);

		expect(result.dispatch).toEqual([]);
		expect(result.reason).toBe("no_ready_units");
	});

	test("returns empty dispatch when all ready units are dependency-blocked", () => {
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1"]), unit(2, ["T2"], ["T1"])],
				tasks: [task("T1", "src/a.ts"), task("T2", "src/b.ts")],
				completed_task_ids: [],
			}),
		);

		expect(result.dispatch).toHaveLength(1);
		expect(result.dispatch[0].unit_id).toBe(1);
	});

	test("dispatches single primary unit in serial mode when git_commit is false", () => {
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1"]), unit(2, ["T2"])],
				tasks: [task("T1", "src/a.ts"), task("T2", "src/b.ts")],
				git_commit: false,
			}),
		);

		expect(result.mode).toBe("serial");
		expect(result.dispatch).toEqual([
			{ unit_id: 1, task_ids: ["T1"], role: "primary" },
		]);
		expect(result.held).toEqual([2]);
	});

	test("dispatches single primary unit in serial mode when tree is dirty", () => {
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1"]), unit(2, ["T2"])],
				tasks: [task("T1", "src/a.ts"), task("T2", "src/b.ts")],
				clean_tree: false,
			}),
		);

		expect(result.mode).toBe("serial");
		expect(result.dispatch).toHaveLength(1);
		expect(result.dispatch[0].role).toBe("primary");
		expect(result.held).toEqual([2]);
	});

	test("dispatches parallel-wave with two disjoint units", () => {
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1"]), unit(2, ["T2"])],
				tasks: [task("T1", "src/a.ts"), task("T2", "src/b.ts")],
			}),
		);

		expect(result.mode).toBe("parallel-wave");
		expect(result.dispatch).toEqual([
			{ unit_id: 1, task_ids: ["T1"], role: "primary" },
			{ unit_id: 2, task_ids: ["T2"], role: "secondary" },
		]);
		expect(result.held).toEqual([]);
		expect(result.review).toEqual([]);
	});

	test("dispatches up to max_builders secondaries", () => {
		const result = scheduleWave(
			wave({
				task_units: [
					unit(1, ["T1"]),
					unit(2, ["T2"]),
					unit(3, ["T3"]),
					unit(4, ["T4"]),
					unit(5, ["T5"]),
				],
				tasks: [
					task("T1", "src/a.ts"),
					task("T2", "src/b.ts"),
					task("T3", "src/c.ts"),
					task("T4", "src/d.ts"),
					task("T5", "src/e.ts"),
				],
				max_builders: 3,
			}),
		);

		expect(result.mode).toBe("parallel-wave");
		expect(result.dispatch).toHaveLength(3);
		expect(result.dispatch[0].role).toBe("primary");
		expect(result.dispatch[1].role).toBe("secondary");
		expect(result.dispatch[2].role).toBe("secondary");
		expect(result.held).toEqual([4, 5]);
	});

	test("falls back to serial when all candidates overlap on target", () => {
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1"]), unit(2, ["T2"])],
				tasks: [task("T1", "src/shared.ts"), task("T2", "src/shared.ts")],
			}),
		);

		expect(result.mode).toBe("serial");
		expect(result.dispatch).toHaveLength(1);
		expect(result.dispatch[0].role).toBe("primary");
	});

	test("treats lockfiles as always-overlapping via shared sentinel", () => {
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1"]), unit(2, ["T2"])],
				tasks: [task("T1", "bun.lockb"), task("T2", "package-lock.json")],
			}),
		);

		expect(result.mode).toBe("serial");
		expect(result.dispatch).toHaveLength(1);
	});

	test("treats catalog agents.yaml as known-shared", () => {
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1"]), unit(2, ["T2"])],
				tasks: [
					task("T1", "catalog/agents.yaml"),
					task("T2", "catalog/agents.yaml"),
				],
			}),
		);

		expect(result.mode).toBe("serial");
	});

	test("skips dependency-blocked units entirely (not ready)", () => {
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1"]), unit(2, ["T2"], ["T1"]), unit(3, ["T3"])],
				tasks: [
					task("T1", "src/a.ts"),
					task("T2", "src/b.ts"),
					task("T3", "src/c.ts"),
				],
			}),
		);

		expect(result.mode).toBe("parallel-wave");
		expect(result.dispatch).toEqual([
			{ unit_id: 1, task_ids: ["T1"], role: "primary" },
			{ unit_id: 3, task_ids: ["T3"], role: "secondary" },
		]);
		expect(result.held).toEqual([]);
	});

	test("pipelines one builder alongside the review of a built unit", () => {
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1"]), unit(2, ["T2"])],
				tasks: [task("T1", "src/a.ts"), task("T2", "src/b.ts")],
				built_task_ids: ["T1"],
				git_commit: false,
			}),
		);

		expect(result.mode).toBe("serial");
		expect(result.review).toEqual([{ unit_id: 1, task_ids: ["T1"] }]);
		expect(result.dispatch).toEqual([
			{ unit_id: 2, task_ids: ["T2"], role: "primary" },
		]);
	});

	test("does not pipeline a builder that depends on the unit under review", () => {
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1"]), unit(2, ["T2"], ["T1"])],
				tasks: [task("T1", "src/a.ts"), task("T2", "src/b.ts")],
				built_task_ids: ["T1"],
				git_commit: false,
			}),
		);

		expect(result.mode).toBe("review-only");
		expect(result.review).toEqual([{ unit_id: 1, task_ids: ["T1"] }]);
		expect(result.dispatch).toEqual([]);
		// Unit 2 is dependency-blocked rather than held: its dependency is built
		// but not yet reviewed, so it is not a ready unit at all.
		expect(result.held).toEqual([]);
	});

	test("does not pipeline a builder overlapping a built unit that is only held", () => {
		// Built A (src/a.ts) is reviewed now; built B (src/shared.ts) is held for a
		// later cycle. Ready C also targets src/shared.ts. Dispatching C would
		// contaminate B's files before B is ever reviewed, and a later retry of B
		// would rebuild over C's edits.
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["A"]), unit(2, ["B"]), unit(3, ["C"])],
				tasks: [
					task("A", "src/a.ts"),
					task("B", "src/shared.ts"),
					task("C", "src/shared.ts"),
				],
				built_task_ids: ["A", "B"],
				git_commit: false,
			}),
		);

		expect(result.mode).toBe("review-only");
		expect(result.review).toEqual([{ unit_id: 1, task_ids: ["A"] }]);
		expect(result.dispatch).toEqual([]);
		expect(result.held).toEqual([2, 3]);
	});

	test("still pipelines a builder that is disjoint from every built unit", () => {
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["A"]), unit(2, ["B"]), unit(3, ["C"])],
				tasks: [
					task("A", "src/a.ts"),
					task("B", "src/b.ts"),
					task("C", "src/c.ts"),
				],
				built_task_ids: ["A", "B"],
				git_commit: false,
			}),
		);

		expect(result.review).toEqual([{ unit_id: 1, task_ids: ["A"] }]);
		expect(result.dispatch).toEqual([
			{ unit_id: 3, task_ids: ["C"], role: "primary" },
		]);
		expect(result.held).toEqual([2]);
	});

	test("does not pipeline a builder sharing files with the unit under review", () => {
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1"]), unit(2, ["T2"])],
				tasks: [task("T1", "src/shared.ts"), task("T2", "src/shared.ts")],
				built_task_ids: ["T1"],
				git_commit: false,
			}),
		);

		expect(result.mode).toBe("review-only");
		expect(result.dispatch).toEqual([]);
		expect(result.held).toEqual([2]);
	});

	test("never re-dispatches a builder for a unit that is already built", () => {
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1"]), unit(2, ["T2"])],
				tasks: [task("T1", "src/a.ts"), task("T2", "src/b.ts")],
				built_task_ids: ["T2"],
				git_commit: false,
			}),
		);

		expect(result.review).toEqual([{ unit_id: 2, task_ids: ["T2"] }]);
		expect(result.dispatch.map((d) => d.unit_id)).not.toContain(2);
	});

	test("offers a built unit for review before starting a parallel wave", () => {
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1"]), unit(2, ["T2"]), unit(3, ["T3"])],
				tasks: [
					task("T1", "src/a.ts"),
					task("T2", "src/b.ts"),
					task("T3", "src/c.ts"),
				],
				built_task_ids: ["T1"],
			}),
		);

		expect(result.review).toEqual([{ unit_id: 1, task_ids: ["T1"] }]);
		expect(result.dispatch).toHaveLength(1);
		expect(result.mode).toBe("serial");
	});

	test("reviews built units in ascending unit order", () => {
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1"]), unit(2, ["T2"])],
				tasks: [task("T1", "src/a.ts"), task("T2", "src/b.ts")],
				built_task_ids: ["T2", "T1"],
			}),
		);

		expect(result.review).toEqual([{ unit_id: 1, task_ids: ["T1"] }]);
		expect(result.mode).toBe("review-only");
		expect(result.held).toEqual([2]);
	});

	test("treats a directory target as overlapping a file beneath it", () => {
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1"]), unit(2, ["T2"])],
				tasks: [
					task("T1", "cli/src/build"),
					task("T2", "cli/src/build/filters/index.ts"),
				],
			}),
		);

		expect(result.mode).toBe("serial");
		expect(result.dispatch).toHaveLength(1);
		expect(result.held).toEqual([2]);
	});

	test("does not treat a sibling path sharing a prefix as overlapping", () => {
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1"]), unit(2, ["T2"])],
				tasks: [task("T1", "cli/src/build"), task("T2", "cli/src/buildx")],
			}),
		);

		expect(result.mode).toBe("parallel-wave");
		expect(result.dispatch).toHaveLength(2);
	});

	test("normalizes equivalent target spellings as overlapping", () => {
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1"]), unit(2, ["T2"])],
				tasks: [task("T1", "./src/a.ts"), task("T2", "src/a.ts")],
			}),
		);

		expect(result.mode).toBe("serial");
		expect(result.held).toEqual([2]);
	});

	test("resolves dot segments so the same file never parallelizes", () => {
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1"]), unit(2, ["T2"])],
				tasks: [task("T1", "src/x/../shared.ts"), task("T2", "src/shared.ts")],
			}),
		);

		expect(result.mode).toBe("serial");
		expect(result.held).toEqual([2]);
	});

	test("keeps a leading dot-dot distinct from a bare path", () => {
		// `../shared.ts` escapes the tree and is a different file from
		// `shared.ts`, so these two units may still run concurrently.
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1"]), unit(2, ["T2"])],
				tasks: [task("T1", "../shared.ts"), task("T2", "shared.ts")],
			}),
		);

		expect(result.mode).toBe("parallel-wave");
	});

	test("splits a regrouped unit so built work is reviewed and new work is built", () => {
		// Grouping is recomputed every call: a plan holding only T1 groups as [T1],
		// and the add-task path regroups it as [T1, T2]. T1 is already built, so the
		// unit must not be handed to a builder as a whole.
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1", "T2"])],
				tasks: [task("T1", "src/a.ts"), task("T2", "src/b.ts")],
				built_task_ids: ["T1"],
				git_commit: false,
			}),
		);

		expect(result.review).toEqual([{ unit_id: 1, task_ids: ["T1"] }]);
		expect(result.dispatch).toEqual([
			{ unit_id: 2, task_ids: ["T2"], role: "primary" },
		]);
	});

	test("holds new work that depended on a built task in the same regrouped unit", () => {
		// T2 depended on T1 inside the original unit. Splitting turns that into a
		// cross-unit dependency, so T2 waits until T1 is reviewed rather than
		// building against unreviewed work.
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1", "T2"])],
				tasks: [
					task("T1", "src/a.ts"),
					task("T2", "src/b.ts", { dependencies: ["T1"] }),
				],
				built_task_ids: ["T1"],
				git_commit: false,
			}),
		);

		expect(result.review).toEqual([{ unit_id: 1, task_ids: ["T1"] }]);
		expect(result.dispatch).toEqual([]);
		expect(result.mode).toBe("review-only");
	});

	test("drops completed tasks when splitting a partially completed unit", () => {
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1", "T2"])],
				tasks: [task("T1", "src/a.ts"), task("T2", "src/b.ts")],
				completed_task_ids: ["T1"],
			}),
		);

		expect(result.dispatch).toEqual([
			{ unit_id: 1, task_ids: ["T2"], role: "primary" },
		]);
	});

	test("treats a repo-root target as overlapping every nested path", () => {
		// A task targeting the whole repo cannot run beside anything. Prefix
		// matching alone misses this: "." is not a slash-prefix of "src/a.ts".
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1"]), unit(2, ["T2"])],
				tasks: [task("T1", "."), task("T2", "src/a.ts")],
			}),
		);

		expect(result.mode).toBe("serial");
		expect(result.held).toEqual([2]);
	});

	test("does not review a unit whose work is also pending integration", () => {
		// Precondition-violating input that the CLI rejects, but the pure function
		// must still fail safe: pending integration outranks built, because the
		// edits are not all on the primary tree.
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1"])],
				tasks: [task("T1", "src/a.ts")],
				built_task_ids: ["T1"],
				pending_integration_task_ids: ["T1"],
			}),
		);

		expect(result.review).toEqual([]);
		expect(result.held).toEqual([1]);
		expect(result.reason).toBe("pending_integration");
	});

	test("holds a unit pending integration instead of reviewing or rebuilding it", () => {
		// T2 was built by a secondary whose worktree is not yet integrated: its
		// edits are absent from the primary tree, so it can be neither reviewed
		// nor rebuilt.
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1"]), unit(2, ["T2"])],
				tasks: [task("T1", "src/a.ts"), task("T2", "src/b.ts")],
				completed_task_ids: ["T1"],
				pending_integration_task_ids: ["T2"],
			}),
		);

		expect(result.review).toEqual([]);
		expect(result.dispatch).toEqual([]);
		expect(result.held).toEqual([2]);
		expect(result.reason).toBe("pending_integration");
	});

	test("reports no_ready_units rather than pending_integration when nothing is pending", () => {
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1"])],
				tasks: [task("T1", "src/a.ts")],
				completed_task_ids: ["T1"],
			}),
		);

		expect(result.held).toEqual([]);
		expect(result.reason).toBe("no_ready_units");
	});

	test("does not dispatch a builder over files pending integration", () => {
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1"]), unit(2, ["T2"])],
				tasks: [task("T1", "src/shared.ts"), task("T2", "src/shared.ts")],
				completed_task_ids: [],
				pending_integration_task_ids: ["T1"],
			}),
		);

		expect(result.dispatch).toEqual([]);
		expect(result.held).toEqual([1, 2]);
		expect(result.reason).toBe("pending_integration");
	});

	test("dispatches a builder that is disjoint from pending integration work", () => {
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1"]), unit(2, ["T2"])],
				tasks: [task("T1", "src/a.ts"), task("T2", "src/b.ts")],
				pending_integration_task_ids: ["T1"],
			}),
		);

		expect(result.mode).toBe("serial");
		expect(result.dispatch).toEqual([
			{ unit_id: 2, task_ids: ["T2"], role: "primary" },
		]);
		expect(result.held).toEqual([1]);
	});

	test("handles multi-task units with mixed targets", () => {
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1", "T2"]), unit(2, ["T3", "T4"])],
				tasks: [
					task("T1", "src/a.ts"),
					task("T2", "src/b.ts"),
					task("T3", "src/c.ts"),
					task("T4", "src/d.ts"),
				],
			}),
		);

		expect(result.mode).toBe("parallel-wave");
		expect(result.dispatch).toHaveLength(2);
	});

	test("blocks parallel-wave when multi-task units share a target", () => {
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1", "T2"]), unit(2, ["T3", "T4"])],
				tasks: [
					task("T1", "src/a.ts"),
					task("T2", "src/overlap.ts"),
					task("T3", "src/c.ts"),
					task("T4", "src/overlap.ts"),
				],
			}),
		);

		expect(result.mode).toBe("serial");
		expect(result.dispatch).toHaveLength(1);
	});

	test("respects unit ordering by unit_id", () => {
		const result = scheduleWave(
			wave({
				task_units: [unit(3, ["T3"]), unit(1, ["T1"]), unit(2, ["T2"])],
				tasks: [
					task("T1", "src/a.ts"),
					task("T2", "src/b.ts"),
					task("T3", "src/c.ts"),
				],
			}),
		);

		expect(result.dispatch[0].unit_id).toBe(1);
	});

	test("excludes third unit from parallel-wave when it overlaps with second", () => {
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1"]), unit(2, ["T2"]), unit(3, ["T3"])],
				tasks: [
					task("T1", "src/a.ts"),
					task("T2", "src/b.ts"),
					task("T3", "src/b.ts"),
				],
			}),
		);

		expect(result.mode).toBe("parallel-wave");
		expect(result.dispatch).toHaveLength(2);
		expect(result.dispatch.map((d) => d.unit_id)).toEqual([1, 2]);
		expect(result.held).toEqual([3]);
	});

	test("single ready unit dispatches as serial primary", () => {
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1"])],
				tasks: [task("T1", "src/a.ts")],
			}),
		);

		expect(result.mode).toBe("serial");
		expect(result.dispatch).toEqual([
			{ unit_id: 1, task_ids: ["T1"], role: "primary" },
		]);
		expect(result.held).toEqual([]);
	});

	test("handles completed_task_ids unlocking dependent units", () => {
		const result = scheduleWave(
			wave({
				task_units: [unit(1, ["T1"]), unit(2, ["T2"], ["T1"]), unit(3, ["T3"])],
				tasks: [
					task("T1", "src/a.ts"),
					task("T2", "src/b.ts"),
					task("T3", "src/c.ts"),
				],
				completed_task_ids: ["T1"],
			}),
		);

		expect(result.mode).toBe("parallel-wave");
		expect(result.dispatch.map((d) => d.unit_id)).toEqual([2, 3]);
	});

	test("default max_builders of 4 allows primary plus 3 secondaries", () => {
		const result = scheduleWave(
			wave({
				task_units: [
					unit(1, ["T1"]),
					unit(2, ["T2"]),
					unit(3, ["T3"]),
					unit(4, ["T4"]),
					unit(5, ["T5"]),
				],
				tasks: [
					task("T1", "src/a.ts"),
					task("T2", "src/b.ts"),
					task("T3", "src/c.ts"),
					task("T4", "src/d.ts"),
					task("T5", "src/e.ts"),
				],
				max_builders: 4,
			}),
		);

		expect(result.dispatch).toHaveLength(4);
		expect(result.dispatch[0].role).toBe("primary");
		expect(result.dispatch[1].role).toBe("secondary");
		expect(result.dispatch[2].role).toBe("secondary");
		expect(result.dispatch[3].role).toBe("secondary");
		expect(result.held).toEqual([5]);
	});
});
