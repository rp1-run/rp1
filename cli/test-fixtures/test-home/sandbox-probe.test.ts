import { expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";

test("records the isolated test environment", async () => {
	const outputPath = process.env.RP1_TEST_PROBE_OUTPUT;
	if (!outputPath) {
		throw new Error("RP1_TEST_PROBE_OUTPUT is required");
	}

	await writeFile(
		outputPath,
		JSON.stringify({
			pid: process.pid,
			homedir: homedir(),
			PATH: process.env.PATH,
			CARGO_HOME: process.env.CARGO_HOME,
			HOME: process.env.HOME,
			USERPROFILE: process.env.USERPROFILE,
			HOMEDRIVE: process.env.HOMEDRIVE,
			HOMEPATH: process.env.HOMEPATH,
			XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
			XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
			XDG_DATA_HOME: process.env.XDG_DATA_HOME,
			XDG_STATE_HOME: process.env.XDG_STATE_HOME,
			APPDATA: process.env.APPDATA,
			LOCALAPPDATA: process.env.LOCALAPPDATA,
			TMPDIR: process.env.TMPDIR,
			TEMP: process.env.TEMP,
			TMP: process.env.TMP,
			RP1_TEST_SANDBOX_HOME: process.env.RP1_TEST_SANDBOX_HOME,
		}),
	);

	if (process.env.RP1_TEST_PROBE_WAIT === "1") {
		await new Promise<never>(() => {});
	}

	expect(process.env.RP1_TEST_PROBE_FAIL).not.toBe("1");
});
