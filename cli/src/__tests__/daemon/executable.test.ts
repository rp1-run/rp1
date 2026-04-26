import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmod, mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
	DaemonExecutableResolutionError,
	resolveDaemonExecutablePath,
} from "../../../web-ui/src/daemon/executable.js";
import {
	cleanupTempDir,
	createTempDir,
	writeFixture,
} from "../helpers/index.js";

describe("resolveDaemonExecutablePath", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("daemon-executable");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	const executableFixture = async (relativePath: string): Promise<string> => {
		const path = await writeFixture(
			tempDir,
			relativePath,
			"#!/bin/sh\nexit 0\n",
		);
		await chmod(path, 0o755);
		return path;
	};

	test("uses an explicit executable path before all other native candidates", async () => {
		const explicit = await executableFixture("explicit/rp1");
		const envPath = await executableFixture("env/rp1");

		const resolved = resolveDaemonExecutablePath({
			explicitPath: explicit,
			native: true,
			env: {
				RP1_NATIVE_RP1_EXECUTABLE: envPath,
			},
			processExecPath: join(
				tempDir,
				"NativeShell.app",
				"Contents",
				"MacOS",
				"native",
			),
		});

		expect(resolved).toBe(explicit);
	});

	test("uses the native environment override when no explicit path is provided", async () => {
		const envPath = await executableFixture("env/rp1");

		const resolved = resolveDaemonExecutablePath({
			native: true,
			env: {
				RP1_NATIVE_RP1_EXECUTABLE: envPath,
			},
			processExecPath: join(
				tempDir,
				"NativeShell.app",
				"Contents",
				"MacOS",
				"native",
			),
		});

		expect(resolved).toBe(envPath);
	});

	test("uses the bundled rp1 next to the native launcher", async () => {
		const bundled = await executableFixture(
			"NativeShell.app/Contents/MacOS/rp1",
		);

		const resolved = resolveDaemonExecutablePath({
			native: true,
			env: {},
			processExecPath: join(
				tempDir,
				"NativeShell.app",
				"Contents",
				"MacOS",
				"native",
			),
		});

		expect(resolved).toBe(bundled);
	});

	test("falls back to the development repository binary in native development", async () => {
		const development = await executableFixture("development/rp1");

		const resolved = resolveDaemonExecutablePath({
			native: true,
			env: {},
			developmentExecutablePath: development,
			processExecPath: join(
				tempDir,
				"NativeShell.app",
				"Contents",
				"MacOS",
				"native",
			),
		});

		expect(resolved).toBe(development);
	});

	test("keeps the development repository binary ahead of compiled CLI fallback", async () => {
		const development = await executableFixture("development/rp1");
		await mkdir(join(tempDir, "compiled"), { recursive: true });
		const compiled = await executableFixture("compiled/custom-rp1");

		const resolved = resolveDaemonExecutablePath({
			native: false,
			env: {},
			developmentExecutablePath: development,
			processExecPath: compiled,
		});

		expect(resolved).toBe(development);
	});

	test("uses PATH only for non-native CLI launches after bundled and development candidates", async () => {
		const pathExecutable = await executableFixture("path-bin/rp1");

		const resolved = resolveDaemonExecutablePath({
			native: false,
			env: {
				PATH: join(tempDir, "path-bin"),
			},
			developmentExecutablePath: join(tempDir, "missing-development", "rp1"),
			processExecPath: join(tempDir, "node"),
		});

		expect(resolved).toBe(pathExecutable);
	});

	test("reports a native explicit-path failure without falling back to PATH", async () => {
		await executableFixture("path-bin/rp1");
		const missingExplicit = join(tempDir, "missing", "rp1");

		try {
			resolveDaemonExecutablePath({
				explicitPath: missingExplicit,
				native: true,
				env: {
					PATH: join(tempDir, "path-bin"),
				},
				processExecPath: join(
					tempDir,
					"NativeShell.app",
					"Contents",
					"MacOS",
					"native",
				),
			});
			throw new Error("Expected resolver to fail");
		} catch (error) {
			expect(error).toBeInstanceOf(DaemonExecutableResolutionError);
			const resolutionError = error as DaemonExecutableResolutionError;
			expect(resolutionError.checkedLocations).toEqual([
				{
					source: "explicit",
					path: missingExplicit,
					status: "missing",
				},
			]);
		}
	});

	test("reports non-executable native environment overrides with checked locations", async () => {
		const envPath = await writeFixture(
			tempDir,
			"env/rp1",
			"#!/bin/sh\nexit 0\n",
		);

		try {
			resolveDaemonExecutablePath({
				native: true,
				env: {
					RP1_NATIVE_RP1_EXECUTABLE: envPath,
				},
				processExecPath: join(
					tempDir,
					"NativeShell.app",
					"Contents",
					"MacOS",
					"native",
				),
			});
			throw new Error("Expected resolver to fail");
		} catch (error) {
			expect(error).toBeInstanceOf(DaemonExecutableResolutionError);
			const resolutionError = error as DaemonExecutableResolutionError;
			expect(resolutionError.checkedLocations).toEqual([
				{
					source: "environment",
					path: envPath,
					status: "not_executable",
				},
			]);
			expect(resolutionError.message).toContain("RP1_NATIVE_RP1_EXECUTABLE");
		}
	});
});
