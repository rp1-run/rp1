import { describe, expect, test } from "bun:test";
import {
	isPostSelfUpdateProcess,
	POST_SELF_UPDATE_DAEMON_PORT_ENV,
	POST_SELF_UPDATE_DAEMON_WAS_RUNNING_ENV,
	POST_SELF_UPDATE_ENV,
	readPostSelfUpdateState,
	relaunchPostSelfUpdate,
} from "../post-self-update.js";

type SpawnSyncImpl = NonNullable<
	Parameters<typeof relaunchPostSelfUpdate>[0]
>["spawnSyncImpl"];

describe("post-self-update handoff", () => {
	test("detects post-self-update relaunch from environment", () => {
		expect(isPostSelfUpdateProcess({ [POST_SELF_UPDATE_ENV]: "1" })).toBe(true);
		expect(isPostSelfUpdateProcess({})).toBe(false);
	});

	test("reads daemon lifecycle state from environment", () => {
		expect(
			readPostSelfUpdateState({
				[POST_SELF_UPDATE_DAEMON_WAS_RUNNING_ENV]: "1",
				[POST_SELF_UPDATE_DAEMON_PORT_ENV]: "7710",
			}),
		).toEqual({
			daemonWasRunning: true,
			daemonPort: 7710,
		});

		expect(
			readPostSelfUpdateState({
				[POST_SELF_UPDATE_DAEMON_WAS_RUNNING_ENV]: "0",
				[POST_SELF_UPDATE_DAEMON_PORT_ENV]: "not-a-number",
			}),
		).toEqual({
			daemonWasRunning: false,
			daemonPort: undefined,
		});
	});

	test("relaunches update with yes flag and environment marker", () => {
		let recorded: {
			command?: string;
			args?: readonly string[];
			env?: NodeJS.ProcessEnv;
		} = {};
		const spawnSyncImpl: SpawnSyncImpl = (command, args, options) => {
			recorded = {
				command: String(command),
				args,
				env: options.env,
			};
			return { status: 0 };
		};

		const result = relaunchPostSelfUpdate({
			yes: true,
			execPath: "/opt/homebrew/bin/rp1",
			env: { HOME: "/tmp/home" },
			state: {
				daemonWasRunning: true,
				daemonPort: 7710,
			},
			spawnSyncImpl,
		});

		expect(result).toEqual({ success: true, exitCode: 0 });
		expect(recorded.command).toBe("/opt/homebrew/bin/rp1");
		expect(recorded.args).toEqual(["update", "--yes"]);
		expect(recorded.env?.HOME).toBe("/tmp/home");
		expect(recorded.env?.[POST_SELF_UPDATE_ENV]).toBe("1");
		expect(recorded.env?.[POST_SELF_UPDATE_DAEMON_WAS_RUNNING_ENV]).toBe("1");
		expect(recorded.env?.[POST_SELF_UPDATE_DAEMON_PORT_ENV]).toBe("7710");
	});

	test("surfaces spawn failures", () => {
		const spawnSyncImpl: SpawnSyncImpl = () => ({
			status: null,
			error: new Error("spawn failed"),
		});

		const result = relaunchPostSelfUpdate({
			spawnSyncImpl,
		});

		expect(result.success).toBe(false);
		expect(result.exitCode).toBe(1);
		expect(result.error).toContain("spawn failed");
	});
});
