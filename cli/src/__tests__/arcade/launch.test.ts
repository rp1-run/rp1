import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { DaemonConnection } from "../../../web-ui/src/daemon/index.js";
import {
	launchArcade,
	launchArcadeForProject,
	launchArcadeProjectList,
	resolveArcadeProjectRoot,
} from "../../arcade/launch.js";
import {
	cleanupTempDir,
	createTempDir,
	writeFixture,
} from "../helpers/index.js";

const connection: DaemonConnection = {
	port: 6811,
	baseUrl: "http://127.0.0.1:6811",
};

const ensureDaemonMock = mock(async () => ({
	connection,
	action: "started" as const,
	reason: "missing_pid" as const,
	wasRunning: false,
}));

const registerProjectWithDaemonMock = mock(
	async (_connection: DaemonConnection, projectPath: string) => ({
		project: {
			id: "project-123",
			name: "Native App",
			path: projectPath,
			available: true,
			runCount: 0,
			lastActivityAt: null,
		},
		url: `${connection.baseUrl}/projects/project-123`,
	}),
);

mock.module("../../../web-ui/src/daemon/index.js", () => ({
	ensureDaemon: ensureDaemonMock,
	registerProjectWithDaemon: registerProjectWithDaemonMock,
}));

describe("Arcade launch bridge", () => {
	let tempDir: string;
	let originalFetch: typeof fetch;

	beforeEach(async () => {
		tempDir = await createTempDir("arcade-launch");
		originalFetch = globalThis.fetch;
		ensureDaemonMock.mockClear();
		registerProjectWithDaemonMock.mockClear();
	});

	afterEach(async () => {
		globalThis.fetch = originalFetch;
		await cleanupTempDir(tempDir);
	});

	const createProjectRoot = async (): Promise<string> => {
		await mkdir(join(tempDir, ".rp1"), { recursive: true });
		await writeFixture(tempDir, ".rp1/project_id", "project-123\n");
		return tempDir;
	};

	test("resolves valid project roots through existing rp1 project discovery", async () => {
		const projectRoot = await createProjectRoot();

		const resolved = resolveArcadeProjectRoot(projectRoot);

		expect(resolved).toEqual({
			_tag: "Right",
			right: projectRoot,
		});
	});

	test("rejects existing directories that are not rp1 project roots", async () => {
		const resolved = resolveArcadeProjectRoot(tempDir);

		expect(resolved).toMatchObject({
			_tag: "Left",
			left: {
				_tag: "NotFoundError",
			},
		});
	});

	test("launches a valid project through daemon startup and project registration", async () => {
		const projectRoot = await createProjectRoot();

		const result = await launchArcadeForProject({
			projectPath: projectRoot,
			port: 6811,
			cliVersion: "0.7.5-test",
			rp1ExecutablePath: "/tmp/rp1",
		});

		expect(ensureDaemonMock).toHaveBeenCalledWith(6811, {
			cliVersion: "0.7.5-test",
			executablePath: "/tmp/rp1",
		});
		expect(registerProjectWithDaemonMock).toHaveBeenCalledWith(
			connection,
			projectRoot,
		);
		expect(result).toEqual({
			kind: "project",
			projectId: "project-123",
			projectName: "Native App",
			url: `${connection.baseUrl}/projects/project-123`,
			action: "started",
			reason: "missing_pid",
			wasRunning: false,
			daemonPort: 6811,
		});
	});

	test("does not start the daemon or register a project when validation fails", async () => {
		await expect(
			launchArcadeForProject({
				projectPath: join(tempDir, "missing"),
				port: 6811,
			}),
		).rejects.toMatchObject({
			_tag: "NotFoundError",
		});

		expect(ensureDaemonMock).not.toHaveBeenCalled();
		expect(registerProjectWithDaemonMock).not.toHaveBeenCalled();
	});

	test("surfaces project registration failures without returning a stale URL", async () => {
		const projectRoot = await createProjectRoot();
		registerProjectWithDaemonMock.mockImplementationOnce(async () => {
			throw new Error("Registration failed");
		});

		await expect(
			launchArcadeForProject({
				projectPath: projectRoot,
				port: 6811,
			}),
		).rejects.toThrow("Registration failed");

		expect(ensureDaemonMock).toHaveBeenCalledTimes(1);
		expect(registerProjectWithDaemonMock).toHaveBeenCalledTimes(1);
	});

	test("loads the registered project list when no project path is supplied", async () => {
		const fetchMock = mock(async (url: string | URL | Request) => {
			expect(String(url)).toBe(`${connection.baseUrl}/api/v2/projects`);
			return Response.json({
				projects: [
					{
						id: "project-123",
						name: "Native App",
						path: tempDir,
						available: true,
						runCount: 0,
						lastActivityAt: null,
					},
				],
			});
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const result = await launchArcadeProjectList({
			port: 6811,
			cliVersion: "0.7.5-test",
			rp1ExecutablePath: "/tmp/rp1",
		});

		expect(ensureDaemonMock).toHaveBeenCalledWith(6811, {
			cliVersion: "0.7.5-test",
			executablePath: "/tmp/rp1",
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(result).toEqual({
			kind: "project-list",
			projects: [
				{
					id: "project-123",
					name: "Native App",
					path: tempDir,
					available: true,
					runCount: 0,
					lastActivityAt: null,
				},
			],
			url: `${connection.baseUrl}/projects`,
			action: "started",
			reason: "missing_pid",
			wasRunning: false,
			daemonPort: 6811,
		});
	});

	test("routes the shared launch contract to registered projects when enabled without a project path", async () => {
		const fetchMock = mock(async (url: string | URL | Request) => {
			expect(String(url)).toBe(`${connection.baseUrl}/api/v2/projects`);
			return Response.json({ projects: [] });
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const result = await launchArcade({
			port: 6811,
			openProjectListWhenMissing: true,
		});

		expect(result).toEqual({
			kind: "project-list",
			projects: [],
			url: `${connection.baseUrl}/projects`,
			action: "started",
			reason: "missing_pid",
			wasRunning: false,
			daemonPort: 6811,
		});

		expect(registerProjectWithDaemonMock).not.toHaveBeenCalled();
	});

	test("keeps project-list startup successful when the registry is empty", async () => {
		const fetchMock = mock(async (url: string | URL | Request) => {
			expect(String(url)).toBe(`${connection.baseUrl}/api/v2/projects`);
			return Response.json({ projects: [] });
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const result = await launchArcadeProjectList({
			port: 6811,
		});

		expect(result.kind).toBe("project-list");
		expect(result.projects).toEqual([]);
		expect(result.url).toBe(`${connection.baseUrl}/projects`);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(registerProjectWithDaemonMock).not.toHaveBeenCalled();
	});

	test("rejects project-list responses without a projects array", async () => {
		globalThis.fetch = mock(async () =>
			Response.json({}),
		) as unknown as typeof fetch;

		await expect(
			launchArcadeProjectList({
				port: 6811,
			}),
		).rejects.toThrow("Project list response did not include projects");
	});

	test("surfaces project-list API failures without falling back to project registration", async () => {
		const fetchMock = mock(async () =>
			Response.json({ error: "Project API unavailable" }, { status: 503 }),
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		await expect(
			launchArcade({
				port: 6811,
				openProjectListWhenMissing: true,
			}),
		).rejects.toThrow("Project API unavailable");

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(registerProjectWithDaemonMock).not.toHaveBeenCalled();
	});

	test("preserves explicit project registration when project path is supplied with project-list opt-in", async () => {
		const projectRoot = await createProjectRoot();
		const fetchMock = mock(async () => {
			throw new Error("Project list should not be requested");
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const result = await launchArcade({
			projectPath: projectRoot,
			port: 6811,
			openProjectListWhenMissing: true,
		});

		expect(result).toMatchObject({
			kind: "project",
			projectId: "project-123",
			url: `${connection.baseUrl}/projects/project-123`,
		});
		expect(registerProjectWithDaemonMock).toHaveBeenCalledWith(
			connection,
			projectRoot,
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test("requires either a project path or project-list startup opt-in", async () => {
		await expect(launchArcade({ port: 6811 })).rejects.toMatchObject({
			_tag: "UsageError",
		});

		expect(ensureDaemonMock).not.toHaveBeenCalled();
	});

	test("surfaces project-list API failures", async () => {
		globalThis.fetch = mock(async () =>
			Response.json({ error: "Project API unavailable" }, { status: 503 }),
		) as unknown as typeof fetch;

		await expect(
			launchArcadeProjectList({
				port: 6811,
			}),
		).rejects.toThrow("Project API unavailable");
	});

	test("uses HTTP status when project-list API failures are not JSON", async () => {
		globalThis.fetch = mock(
			async () => new Response("not-json", { status: 502 }),
		) as unknown as typeof fetch;

		await expect(
			launchArcadeProjectList({
				port: 6811,
			}),
		).rejects.toThrow("HTTP 502");
	});
});
