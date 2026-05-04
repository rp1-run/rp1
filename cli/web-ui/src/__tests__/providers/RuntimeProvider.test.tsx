import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import {
	buildRuntimeEndpoint,
	RuntimeProvider,
	useRuntimeContract,
} from "@/providers/RuntimeProvider";
import {
	ARCADE_RUNTIME_SCHEMA_VERSION,
	type ArcadeRuntimeContract,
	DEFAULT_ARCADE_RECONNECT_POLICY,
} from "@/types/runtime";

const TEST_RUNTIME: ArcadeRuntimeContract = {
	schemaVersion: ARCADE_RUNTIME_SCHEMA_VERSION,
	baseUrl: "http://127.0.0.1:7710",
	hostMode: "native",
	version: "0.7.6",
	buildId: "build-1",
	cacheBust: "cache-1",
	reconnectPolicy: DEFAULT_ARCADE_RECONNECT_POLICY,
};

function RuntimeProbe() {
	const runtime = useRuntimeContract();

	return (
		<div>
			<span data-testid="host-mode">{runtime.hostMode}</span>
			<span data-testid="initial-delay">
				{runtime.reconnectPolicy.initialDelayMs}
			</span>
		</div>
	);
}

describe("RuntimeProvider", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		window.location.href = "http://localhost/";
		window.sessionStorage.clear();
	});

	afterEach(() => {
		cleanup();
		globalThis.fetch = originalFetch;
		window.location.href = "http://localhost/";
		window.sessionStorage.clear();
	});

	test("builds the runtime endpoint from host launch metadata", () => {
		expect(
			buildRuntimeEndpoint(
				"?host-mode=native&cache-bust=native-load&projectId=ignored",
			),
		).toBe("/api/v2/runtime?hostMode=native&cacheBust=native-load");
	});

	test("fetches the runtime contract without cache and exposes it to children", async () => {
		window.location.href =
			"http://localhost/?hostMode=native&cacheBust=cache-1";
		const fetchMock = mock(async () => {
			return new Response(JSON.stringify(TEST_RUNTIME), {
				headers: { "Content-Type": "application/json" },
			});
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		render(
			<RuntimeProvider>
				<RuntimeProbe />
			</RuntimeProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("host-mode").textContent).toBe("native");
		});

		expect(screen.getByTestId("initial-delay").textContent).toBe("2000");
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/v2/runtime?hostMode=native&cacheBust=cache-1",
			{ cache: "no-store" },
		);
	});

	test("renders a controlled failure for unsupported host modes", async () => {
		const fetchMock = mock(async () => {
			return new Response(
				JSON.stringify({ ...TEST_RUNTIME, hostMode: "mobile" }),
				{ headers: { "Content-Type": "application/json" } },
			);
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		render(
			<RuntimeProvider>
				<RuntimeProbe />
			</RuntimeProvider>,
		);

		await waitFor(() => {
			expect(screen.getByRole("alert").textContent).toContain(
				"Unsupported Arcade host mode: mobile",
			);
		});
	});

	test("renders a controlled failure when the runtime request fails", async () => {
		const fetchMock = mock(async () => {
			throw new Error("runtime unavailable");
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		render(
			<RuntimeProvider>
				<RuntimeProbe />
			</RuntimeProvider>,
		);

		await waitFor(() => {
			expect(screen.getByRole("alert").textContent).toContain(
				"runtime unavailable",
			);
		});
	});

	test("accepts the development runtime fallback without a reload loop", async () => {
		const devRuntime: ArcadeRuntimeContract = {
			...TEST_RUNTIME,
			buildId: `dev-${TEST_RUNTIME.version}`,
			cacheBust: `dev-${TEST_RUNTIME.version}`,
		};
		const loadRuntime = mock(async () => devRuntime);
		const reloadRuntime = mock((_contract: ArcadeRuntimeContract) => {});

		render(
			<RuntimeProvider
				loadRuntime={loadRuntime}
				clientBuildMetadata={{
					buildId: "vite-dev-build",
					version: TEST_RUNTIME.version,
				}}
				reloadRuntime={reloadRuntime}
			>
				<RuntimeProbe />
			</RuntimeProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("host-mode").textContent).toBe("native");
		});
		expect(reloadRuntime).not.toHaveBeenCalled();
	});

	test("attempts one cache-busted reload before failing a persistent runtime build mismatch", async () => {
		const updatedRuntime: ArcadeRuntimeContract = {
			...TEST_RUNTIME,
			buildId: "build-2",
			cacheBust: "build-2",
		};
		const loadRuntime = mock(async () => updatedRuntime);
		const reloadRuntime = mock((_contract: ArcadeRuntimeContract) => {});
		const clientBuildMetadata = {
			buildId: "build-1",
			version: TEST_RUNTIME.version,
		};

		render(
			<RuntimeProvider
				loadRuntime={loadRuntime}
				clientBuildMetadata={clientBuildMetadata}
				reloadRuntime={reloadRuntime}
			>
				<RuntimeProbe />
			</RuntimeProvider>,
		);

		await waitFor(() => {
			expect(reloadRuntime).toHaveBeenCalledWith(updatedRuntime);
		});
		expect(screen.queryByTestId("host-mode")).toBeNull();

		cleanup();

		render(
			<RuntimeProvider
				loadRuntime={loadRuntime}
				clientBuildMetadata={clientBuildMetadata}
				reloadRuntime={reloadRuntime}
			>
				<RuntimeProbe />
			</RuntimeProvider>,
		);

		await waitFor(() => {
			expect(screen.getByRole("alert").textContent).toContain(
				"cache-busted reload did not resolve",
			);
		});
		expect(reloadRuntime).toHaveBeenCalledTimes(1);
	});
});
