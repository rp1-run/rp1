import { afterEach, describe, expect, test } from "bun:test";
import { exists, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, relative } from "node:path";
import { auditInheritedTestEnvironment } from "../../../scripts/test-with-isolated-home.js";

const cliRoot = join(import.meta.dir, "..", "..", "..");
const repositoryRoot = dirname(cliRoot);
const launcherPath = join(cliRoot, "scripts", "test-with-isolated-home.ts");
const probePath = join(
	cliRoot,
	"test-fixtures",
	"test-home",
	"sandbox-probe.test.ts",
);
const tempRoots: string[] = [];

afterEach(async () => {
	await Promise.all(
		tempRoots
			.splice(0)
			.map((path) => rm(path, { recursive: true, force: true })),
	);
});

const isInside = (parent: string, child: string): boolean => {
	const relativePath = relative(parent, child);
	return (
		relativePath === "" ||
		(!relativePath.startsWith("..") && !isAbsolute(relativePath))
	);
};

const waitForFile = async (path: string): Promise<void> => {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (await exists(path)) return;
		await Bun.sleep(10);
	}
	throw new Error(`Timed out waiting for ${path}`);
};

const runLauncher = async (failProbe: boolean) => {
	const outputRoot = await mkdtemp(join(tmpdir(), "rp1-launcher-contract-"));
	tempRoots.push(outputRoot);
	const outputPath = join(outputRoot, "probe.json");
	const child = Bun.spawn([process.execPath, launcherPath, probePath], {
		cwd: cliRoot,
		env: {
			...process.env,
			CARGO_HOME: join(outputRoot, "cargo-home"),
			RP1_TEST_PROBE_OUTPUT: outputPath,
			RP1_TEST_PROBE_FAIL: failProbe ? "1" : "0",
		},
		stdout: "pipe",
		stderr: "pipe",
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	const environment = JSON.parse(await readFile(outputPath, "utf-8")) as Record<
		string,
		string
	>;

	return { environment, exitCode, stderr, stdout };
};

describe("isolated-home test launcher", () => {
	test("classifies inherited home paths before constructing the child environment", async () => {
		const callerHome = await mkdtemp(join(tmpdir(), "rp1-env-audit-"));
		tempRoots.push(callerHome);
		const inherited = {
			HOME: callerHome,
			PATH: `${join(callerHome, "bin")}${delimiter}/usr/bin`,
			PUPPETEER_EXECUTABLE_PATH: join(callerHome, "browser", "chrome"),
			PWD: join(callerHome, "checkout"),
			CARGO_HOME: "/tmp/cargo-state",
			RP1_TOOL_CACHE: join(callerHome, "tool-cache"),
			SSH_AUTH_SOCK: "/tmp/agent.sock",
			EXTERNAL_CONFIG: "/tmp/external-config",
		};

		const audit = await auditInheritedTestEnvironment(inherited, callerHome);

		expect(audit.classifications).toMatchObject({
			HOME: "sandbox-rewritten",
			PATH: "retained-read-only",
			PUPPETEER_EXECUTABLE_PATH: "retained-read-only",
			PWD: "unset",
			CARGO_HOME: "unset",
			RP1_TOOL_CACHE: "unset",
			SSH_AUTH_SOCK: "unset",
		});
		expect(audit.environment.PATH).toBe(inherited.PATH);
		expect(audit.environment.PUPPETEER_EXECUTABLE_PATH).toBe(
			inherited.PUPPETEER_EXECUTABLE_PATH,
		);
		expect(audit.environment.EXTERNAL_CONFIG).toBe(inherited.EXTERNAL_CONFIG);
		for (const key of [
			"HOME",
			"PWD",
			"CARGO_HOME",
			"RP1_TOOL_CACHE",
			"SSH_AUTH_SOCK",
		]) {
			expect(audit.environment[key], key).toBeUndefined();
		}
	});

	test("rejects an unclassified home path without printing its value", async () => {
		const callerHome = await mkdtemp(join(tmpdir(), "rp1-env-reject-"));
		tempRoots.push(callerHome);
		const sensitivePath = join(callerHome, "private", "credentials");
		let error: unknown;

		try {
			await auditInheritedTestEnvironment(
				{ UNCLASSIFIED_TARGET: sensitivePath },
				callerHome,
			);
		} catch (cause) {
			error = cause;
		}

		expect(error).toBeInstanceOf(Error);
		const message = error instanceof Error ? error.message : String(error);
		expect(message).toBe(
			"Test environment audit failed: UNCLASSIFIED_TARGET classification=unclassified",
		);
		expect(message).not.toContain(sensitivePath);
	});

	test("resolves symlink ancestors before classifying missing leaves", async () => {
		const callerHome = await mkdtemp(join(tmpdir(), "rp1-env-link-home-"));
		const externalRoot = await mkdtemp(
			join(tmpdir(), "rp1-env-link-external-"),
		);
		tempRoots.push(callerHome, externalRoot);
		const linkType = process.platform === "win32" ? "junction" : "dir";
		const linkIntoHome = join(externalRoot, "into-home");
		const linkOutOfHome = join(callerHome, "out-of-home");
		await Promise.all([
			symlink(callerHome, linkIntoHome, linkType),
			symlink(externalRoot, linkOutOfHome, linkType),
		]);
		const unsafeCache = join(linkIntoHome, "missing", "cache");
		const safeCache = join(linkOutOfHome, "missing", "cache");

		const audit = await auditInheritedTestEnvironment(
			{
				SYMLINKED_HOME_CACHE: unsafeCache,
				SYMLINKED_EXTERNAL_CACHE: safeCache,
			},
			callerHome,
		);

		expect(audit.classifications.SYMLINKED_HOME_CACHE).toBe("unset");
		expect(audit.environment.SYMLINKED_HOME_CACHE).toBeUndefined();
		expect(audit.classifications.SYMLINKED_EXTERNAL_CACHE).toBeUndefined();
		expect(audit.environment.SYMLINKED_EXTERNAL_CACHE).toBe(safeCache);
	});

	test("routes every maintained CLI test command through the isolated-home launcher", async () => {
		const packageJson = JSON.parse(
			await readFile(join(cliRoot, "package.json"), "utf-8"),
		) as { readonly scripts: Readonly<Record<string, string>> };
		const coverageScript = await readFile(
			join(cliRoot, "scripts", "test-coverage.ts"),
			"utf-8",
		);
		const justfile = await readFile(join(repositoryRoot, "Justfile"), "utf-8");
		const workflow = await readFile(
			join(repositoryRoot, ".github", "workflows", "ci.yml"),
			"utf-8",
		);

		for (const scriptName of [
			"test",
			"test:unit",
			"test:integration",
			"test:watch",
		]) {
			expect(packageJson.scripts[scriptName], scriptName).toContain(
				"test-with-isolated-home.ts",
			);
		}
		expect(coverageScript).toContain("runTestsWithIsolatedHome(testArgs)");
		expect(justfile).not.toContain("cd cli && bun test ");
		expect(workflow).toContain(
			'container_id=$(docker create "$TEST_ISOLATION_IMAGE" bun run scripts/verify-test-home-boundary.ts)',
		);
		expect(workflow).toContain("docker inspect --format '{{ len .Mounts }}'");
		expect(workflow).toContain(
			'run: docker run --rm "$TEST_ISOLATION_IMAGE" bun run test',
		);
		expect(workflow).toContain("bun run test:coverage 2>&1 | tee coverage.txt");
		expect(workflow).toContain("steps.test_home_boundary.outcome == 'success'");
		expect(workflow).not.toContain("cd cli && bun test --coverage");
	});

	test("launches the child with one sandbox-owned environment and cleans it after success", async () => {
		const result = await runLauncher(false);
		const sandboxHome = result.environment.RP1_TEST_SANDBOX_HOME;

		expect(result.exitCode).toBe(0);
		expect(result.environment.homedir).toBe(sandboxHome);
		expect(result.environment.HOME).toBe(sandboxHome);
		expect(result.environment.USERPROFILE).toBe(sandboxHome);
		expect(result.environment.CARGO_HOME).toBeUndefined();
		expect(result.environment.PATH).toBe(process.env.PATH ?? "");
		expect(result.environment.RP1_TEST_BROWSER_EXECUTABLE_PATH).toBeTruthy();
		for (const key of [
			"XDG_CONFIG_HOME",
			"XDG_CACHE_HOME",
			"XDG_DATA_HOME",
			"XDG_STATE_HOME",
			"APPDATA",
			"LOCALAPPDATA",
			"TMPDIR",
			"TEMP",
			"TMP",
		]) {
			expect(isInside(sandboxHome, result.environment[key]), key).toBe(true);
		}
		for (const boundary of [
			"workerEnvironment",
			"bunChildEnvironment",
			"nodeChildEnvironment",
		] as const) {
			const environment = result.environment[boundary] as unknown as Record<
				string,
				string | undefined
			>;
			expect(environment.HOME, boundary).toBe(sandboxHome);
			expect(environment.RP1_TEST_SANDBOX_HOME, boundary).toBe(sandboxHome);
			expect(environment.PATH, boundary).toBe(process.env.PATH ?? "");
			expect(environment.RP1_TEST_BROWSER_EXECUTABLE_PATH, boundary).toBe(
				result.environment.RP1_TEST_BROWSER_EXECUTABLE_PATH,
			);
			expect(environment.CARGO_HOME, boundary).toBeUndefined();
		}
		expect(await exists(dirname(sandboxHome))).toBe(false);
	});

	test("preserves child failure status and cleans the sandbox", async () => {
		const result = await runLauncher(true);
		const sandboxHome = result.environment.RP1_TEST_SANDBOX_HOME;

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("records the isolated test environment");
		expect(await exists(dirname(sandboxHome))).toBe(false);
	});

	test("cleans the sandbox when the launcher is interrupted", async () => {
		const outputRoot = await mkdtemp(join(tmpdir(), "rp1-launcher-interrupt-"));
		tempRoots.push(outputRoot);
		const outputPath = join(outputRoot, "probe.json");
		const launcher = Bun.spawn([process.execPath, launcherPath, probePath], {
			cwd: cliRoot,
			env: {
				...process.env,
				RP1_TEST_PROBE_OUTPUT: outputPath,
				RP1_TEST_PROBE_FAIL: "0",
				RP1_TEST_PROBE_WAIT: "1",
			},
			stdout: "pipe",
			stderr: "pipe",
		});

		await waitForFile(outputPath);
		const environment = JSON.parse(
			await readFile(outputPath, "utf-8"),
		) as Record<string, string>;
		const sandboxRoot = dirname(environment.RP1_TEST_SANDBOX_HOME);
		const probePid = Number(environment.pid);

		try {
			launcher.kill("SIGINT");
			expect(await launcher.exited).not.toBe(0);
			await Bun.sleep(50);
			expect(await exists(sandboxRoot)).toBe(false);
		} finally {
			try {
				process.kill(probePid, "SIGKILL");
			} catch {}
			await rm(sandboxRoot, { recursive: true, force: true });
		}
	});
});
