import { expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { promisify } from "node:util";

interface EnvironmentSnapshot {
	readonly HOME?: string;
	readonly PATH?: string;
	readonly RP1_TEST_BROWSER_EXECUTABLE_PATH?: string;
	readonly CARGO_HOME?: string;
	readonly RP1_TEST_SANDBOX_HOME?: string;
}

const snapshotScript = `console.log(JSON.stringify({
	HOME: process.env.HOME,
	PATH: process.env.PATH,
	RP1_TEST_BROWSER_EXECUTABLE_PATH:
		process.env.RP1_TEST_BROWSER_EXECUTABLE_PATH,
	CARGO_HOME: process.env.CARGO_HOME,
	RP1_TEST_SANDBOX_HOME: process.env.RP1_TEST_SANDBOX_HOME,
}))`;

const readWorkerEnvironment = (): Promise<EnvironmentSnapshot> =>
	new Promise((resolve, reject) => {
		const worker = new Worker(new URL("./sandbox-worker.ts", import.meta.url));
		worker.onmessage = (event: MessageEvent<EnvironmentSnapshot>) => {
			worker.terminate();
			resolve(event.data);
		};
		worker.onerror = (event) => {
			worker.terminate();
			reject(event.error ?? new Error(event.message));
		};
	});

const readBunChildEnvironment = async (): Promise<EnvironmentSnapshot> => {
	const child = Bun.spawn([process.execPath, "-e", snapshotScript], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	if (exitCode !== 0) throw new Error(stderr);
	return JSON.parse(stdout) as EnvironmentSnapshot;
};

const readNodeChildEnvironment = async (): Promise<EnvironmentSnapshot> => {
	const { stdout } = await promisify(execFile)(process.execPath, [
		"-e",
		snapshotScript,
	]);
	return JSON.parse(stdout) as EnvironmentSnapshot;
};

test("records the isolated test environment", async () => {
	const outputPath = process.env.RP1_TEST_PROBE_OUTPUT;
	if (!outputPath) {
		throw new Error("RP1_TEST_PROBE_OUTPUT is required");
	}
	const [workerEnvironment, bunChildEnvironment, nodeChildEnvironment] =
		await Promise.all([
			readWorkerEnvironment(),
			readBunChildEnvironment(),
			readNodeChildEnvironment(),
		]);

	await writeFile(
		outputPath,
		JSON.stringify({
			pid: process.pid,
			homedir: homedir(),
			PATH: process.env.PATH,
			RP1_TEST_BROWSER_EXECUTABLE_PATH:
				process.env.RP1_TEST_BROWSER_EXECUTABLE_PATH,
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
			workerEnvironment,
			bunChildEnvironment,
			nodeChildEnvironment,
		}),
	);

	if (process.env.RP1_TEST_PROBE_WAIT === "1") {
		await new Promise<never>(() => {});
	}

	expect(process.env.RP1_TEST_PROBE_FAIL).not.toBe("1");
});
