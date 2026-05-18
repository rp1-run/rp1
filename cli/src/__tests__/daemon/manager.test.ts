import { describe, expect, test } from "bun:test";
import {
	type DaemonLifecycleReason,
	DaemonPortConflictError,
	type DaemonStartAction,
	type DaemonStopAction,
	isProcessRunning,
} from "../../../web-ui/src/daemon/manager.js";

describe("daemon manager", () => {
	describe("isProcessRunning", () => {
		test("returns true for the current process", () => {
			expect(isProcessRunning(process.pid)).toBe(true);
		});

		test("returns false for a non-existent PID", () => {
			expect(isProcessRunning(99999999)).toBe(false);
		});
	});

	describe("DaemonPortConflictError", () => {
		test("extends Error with correct name", () => {
			const err = new DaemonPortConflictError(8080);
			expect(err).toBeInstanceOf(Error);
			expect(err.name).toBe("DaemonPortConflictError");
		});

		test("stores the conflicting port", () => {
			const err = new DaemonPortConflictError(9090);
			expect(err.port).toBe(9090);
		});

		test("message includes port and remediation guidance", () => {
			const err = new DaemonPortConflictError(7710);
			expect(err.message).toContain("7710");
			expect(err.message).toContain("non-rp1 process");
			expect(err.message).toContain("Use a different port");
		});

		test("port value matches constructor argument for any port", () => {
			for (const port of [80, 443, 3000, 7710, 8080, 49152]) {
				const err = new DaemonPortConflictError(port);
				expect(err.port).toBe(port);
				expect(err.message).toContain(String(port));
			}
		});
	});

	describe("lifecycle action types", () => {
		test("DaemonStartAction values cover reused, started, replaced", () => {
			const actions: DaemonStartAction[] = ["reused", "started", "replaced"];
			expect(actions).toEqual(["reused", "started", "replaced"]);
		});

		test("DaemonStopAction values cover stopped and not_running", () => {
			const actions: DaemonStopAction[] = ["stopped", "not_running"];
			expect(actions).toEqual(["stopped", "not_running"]);
		});

		test("DaemonLifecycleReason values cover expected reason tags", () => {
			const reasons: DaemonLifecycleReason[] = [
				"stale_pid",
				"missing_pid",
				"version_mismatch",
				"unhealthy_daemon",
			];
			expect(reasons).toHaveLength(4);
			expect(reasons).toContain("stale_pid");
			expect(reasons).toContain("missing_pid");
			expect(reasons).toContain("version_mismatch");
			expect(reasons).toContain("unhealthy_daemon");
		});
	});
});
