import { afterEach, describe, expect, test } from "bun:test";
import {
	exists,
	mkdir,
	mkdtemp,
	realpath,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const admissionPath = join(
	import.meta.dir,
	"..",
	"helpers",
	"test-home-admission.ts",
);

const tempRoots: string[] = [];

afterEach(async () => {
	await Promise.all(
		tempRoots
			.splice(0)
			.map((path) => rm(path, { recursive: true, force: true })),
	);
});

const sandboxEnvironment = (
	home: string,
	controlHome: string | undefined,
): Record<string, string | undefined> => ({
	...process.env,
	HOME: home,
	USERPROFILE: home,
	HOMEDRIVE: process.platform === "win32" ? home.slice(0, 2) : "/",
	HOMEPATH: process.platform === "win32" ? home.slice(2) : home,
	XDG_CONFIG_HOME: join(home, ".config"),
	XDG_CACHE_HOME: join(home, ".cache"),
	APPDATA: join(home, ".appdata"),
	LOCALAPPDATA: join(home, ".localappdata"),
	TMPDIR: join(home, ".tmp"),
	TEMP: join(home, ".tmp"),
	TMP: join(home, ".tmp"),
	RP1_TEST_SANDBOX_HOME: controlHome,
});

const runSentinel = async (
	home: string,
	controlHome: string | undefined,
): Promise<{
	readonly exitCode: number;
	readonly stderr: string;
	readonly sentinelImported: boolean;
}> => {
	const suiteRoot = await mkdtemp(join(tmpdir(), "rp1-admission-suite-"));
	tempRoots.push(suiteRoot);
	const markerPath = join(suiteRoot, "sentinel-imported");
	const sentinelPath = join(suiteRoot, "sentinel.test.ts");
	await writeFile(
		join(suiteRoot, "bunfig.toml"),
		`[test]\npreload = [${JSON.stringify(admissionPath)}]\n`,
	);
	await writeFile(
		sentinelPath,
		`import { writeFileSync } from "node:fs";\n` +
			`import { test } from "bun:test";\n` +
			`writeFileSync(${JSON.stringify(markerPath)}, "imported");\n` +
			`test("sentinel", () => {});\n`,
	);

	const child = Bun.spawn([process.execPath, "test", sentinelPath], {
		cwd: suiteRoot,
		env: sandboxEnvironment(home, controlHome),
		stdout: "pipe",
		stderr: "pipe",
	});
	const [exitCode, stderr] = await Promise.all([
		child.exited,
		new Response(child.stderr).text(),
	]);

	return {
		exitCode,
		stderr,
		sentinelImported: await exists(markerPath),
	};
};

describe("test home admission", () => {
	test("admits discovery when the resolved child home is inside the declared sandbox", async () => {
		const root = await mkdtemp(join(tmpdir(), "rp1-admission-valid-"));
		tempRoots.push(root);
		const sandboxHome = join(root, "sandbox-home");
		const childHome = join(sandboxHome, "nested-home");
		await mkdir(childHome, { recursive: true });

		const result = await runSentinel(
			await realpath(childHome),
			await realpath(sandboxHome),
		);

		expect(result.exitCode).toBe(0);
		expect(result.stderr).not.toContain("Test home admission failed");
		expect(result.sentinelImported).toBe(true);
	});

	test("rejects discovery when sandbox control is missing, malformed, or outside the resolved child home", async () => {
		const root = await mkdtemp(join(tmpdir(), "rp1-admission-contract-"));
		tempRoots.push(root);
		const childHome = join(root, "child-home");
		const otherHome = join(root, "other-home");
		await Promise.all([
			mkdir(childHome, { recursive: true }),
			mkdir(otherHome, { recursive: true }),
		]);
		const canonicalChildHome = await realpath(childHome);
		const canonicalOtherHome = await realpath(otherHome);

		const cases = [
			{
				name: "missing control",
				controlHome: undefined,
				expectedError: "RP1_TEST_SANDBOX_HOME is required",
			},
			{
				name: "malformed control",
				controlHome: join(root, "does-not-exist"),
				expectedError: "could not canonicalize RP1_TEST_SANDBOX_HOME",
			},
			{
				name: "home outside control",
				controlHome: canonicalOtherHome,
				expectedError: "resolved home is outside RP1_TEST_SANDBOX_HOME",
			},
		] as const;

		for (const testCase of cases) {
			const result = await runSentinel(
				canonicalChildHome,
				testCase.controlHome,
			);
			expect(result.exitCode, testCase.name).not.toBe(0);
			expect(result.stderr, testCase.name).toContain(testCase.expectedError);
			expect(result.sentinelImported, testCase.name).toBe(false);
		}
	});
});
