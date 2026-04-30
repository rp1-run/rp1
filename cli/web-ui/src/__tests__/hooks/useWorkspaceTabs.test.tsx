import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import {
	useWorkspaceTabs,
	WORKSPACE_TABS_STORAGE_KEY,
	type WorkspaceTab,
	WorkspaceTabsProvider,
} from "../../hooks/useWorkspaceTabs";

function WorkspaceTabsHarness() {
	const {
		tabs,
		activeKey,
		lastDurableRoute,
		openWorkspace,
		closeWorkspace,
		closeAllWorkspaces,
	} = useWorkspaceTabs();
	const location = useLocation();

	return (
		<div>
			<div data-testid="location">
				{location.pathname}
				{location.search}
				{location.hash}
			</div>
			<div data-testid="active-key">{activeKey ?? "null"}</div>
			<div data-testid="last-durable-route">{lastDurableRoute}</div>
			<pre data-testid="tabs">{JSON.stringify(tabs)}</pre>
			<button type="button" onClick={() => openWorkspace("/runs/run-1")}>
				open-run-1
			</button>
			<button type="button" onClick={() => closeWorkspace("run:run-1")}>
				close-run-1
			</button>
			<button type="button" onClick={() => closeWorkspace("run:run-2")}>
				close-run-2
			</button>
			<button type="button" onClick={closeAllWorkspaces}>
				close-all
			</button>
		</div>
	);
}

function setStoredState(state: {
	readonly tabs: readonly WorkspaceTab[];
	readonly activeKey: string | null;
	readonly lastDurableRoute: string;
}) {
	localStorage.setItem(
		WORKSPACE_TABS_STORAGE_KEY,
		JSON.stringify({ tabs: state.tabs }),
	);
	sessionStorage.setItem(
		"rp1-workspace-session:v1",
		JSON.stringify({
			activeKey: state.activeKey,
			lastDurableRoute: state.lastDurableRoute,
		}),
	);
}

function parseTabs(): WorkspaceTab[] {
	return JSON.parse(
		screen.getByTestId("tabs").textContent ?? "[]",
	) as WorkspaceTab[];
}

function renderHarness(initialEntries: readonly string[]) {
	return render(
		<MemoryRouter initialEntries={[...initialEntries]}>
			<WorkspaceTabsProvider>
				<WorkspaceTabsHarness />
			</WorkspaceTabsProvider>
		</MemoryRouter>,
	);
}

describe("useWorkspaceTabs", () => {
	beforeEach(() => {
		localStorage.clear();
		sessionStorage.clear();
	});

	afterEach(() => {
		cleanup();
		localStorage.clear();
		sessionStorage.clear();
	});

	test("hydrates and deduplicates stored workspaces", async () => {
		setStoredState({
			tabs: [
				{
					key: "run:run-1",
					kind: "run",
					currentPath: "/runs/run-1",
					rootPath: "/runs/run-1",
					title: "Run one",
					subtitle: null,
					projectId: null,
					lastVisitedAt: 1,
				},
				{
					key: "run:run-1",
					kind: "run",
					currentPath: "/runs/run-1/step/build",
					rootPath: "/runs/run-1",
					title: "Run one",
					subtitle: null,
					projectId: null,
					lastVisitedAt: 2,
				},
			],
			activeKey: "run:run-1",
			lastDurableRoute: "/projects",
		});

		renderHarness(["/projects"]);

		await waitFor(() => {
			expect(parseTabs()).toHaveLength(1);
		});
		expect(parseTabs()[0]?.currentPath).toBe("/runs/run-1/step/build");
		expect(screen.getByTestId("active-key").textContent).toBe("null");
		expect(screen.getByTestId("last-durable-route").textContent).toBe(
			"/projects",
		);
	});

	test("tracks the active workspace from the current route", async () => {
		renderHarness(["/runs/run-2/step/test/artifact/doc-9"]);

		await waitFor(() => {
			expect(screen.getByTestId("active-key").textContent).toBe("run:run-2");
		});

		const [tab] = parseTabs();
		expect(tab).toMatchObject({
			key: "run:run-2",
			kind: "run",
			currentPath: "/runs/run-2/step/test/artifact/doc-9",
			rootPath: "/runs/run-2",
		});
	});

	test("keeps the full route path, including search and hash, as the workspace current path", async () => {
		renderHarness(["/runs/run-2/step/test/artifact/doc-9?view=raw#section-1"]);

		await waitFor(() => {
			expect(screen.getByTestId("active-key").textContent).toBe("run:run-2");
		});

		expect(parseTabs()[0]).toMatchObject({
			currentPath: "/runs/run-2/step/test/artifact/doc-9?view=raw#section-1",
			rootPath: "/runs/run-2",
		});
	});

	test("reopens an existing workspace at its stored path", async () => {
		setStoredState({
			tabs: [
				{
					key: "run:run-1",
					kind: "run",
					currentPath: "/runs/run-1/step/build",
					rootPath: "/runs/run-1",
					title: "Run one",
					subtitle: null,
					projectId: null,
					lastVisitedAt: 5,
				},
			],
			activeKey: null,
			lastDurableRoute: "/projects",
		});

		renderHarness(["/projects"]);

		act(() => {
			fireEvent.click(screen.getByRole("button", { name: "open-run-1" }));
		});

		await waitFor(() => {
			expect(screen.getByTestId("location").textContent).toBe(
				"/runs/run-1/step/build",
			);
		});
	});

	test("falls back to the default durable route when stored durable state is invalid", async () => {
		localStorage.setItem(
			WORKSPACE_TABS_STORAGE_KEY,
			JSON.stringify({ tabs: [] }),
		);
		sessionStorage.setItem(
			"rp1-workspace-session:v1",
			JSON.stringify({
				activeKey: null,
				lastDurableRoute: "/settings",
			}),
		);

		renderHarness(["/settings"]);

		await waitFor(() => {
			expect(screen.getByTestId("last-durable-route").textContent).toBe("/");
		});
		expect(screen.getByTestId("active-key").textContent).toBe("null");
	});

	test("closes the active workspace to the nearest remaining tab", async () => {
		setStoredState({
			tabs: [
				{
					key: "run:run-1",
					kind: "run",
					currentPath: "/runs/run-1",
					rootPath: "/runs/run-1",
					title: "Run one",
					subtitle: null,
					projectId: null,
					lastVisitedAt: 1,
				},
				{
					key: "run:run-2",
					kind: "run",
					currentPath: "/runs/run-2",
					rootPath: "/runs/run-2",
					title: "Run two",
					subtitle: null,
					projectId: null,
					lastVisitedAt: 2,
				},
			],
			activeKey: "run:run-2",
			lastDurableRoute: "/projects",
		});

		renderHarness(["/runs/run-2"]);

		act(() => {
			fireEvent.click(screen.getByRole("button", { name: "close-run-2" }));
		});

		await waitFor(() => {
			expect(screen.getByTestId("location").textContent).toBe("/runs/run-1");
		});
		expect(parseTabs().map((tab) => tab.key)).toEqual(["run:run-1"]);
	});

	test("removes an inactive workspace without changing the active route", async () => {
		setStoredState({
			tabs: [
				{
					key: "run:run-1",
					kind: "run",
					currentPath: "/runs/run-1/step/build?view=raw#artifact",
					rootPath: "/runs/run-1",
					title: "Run one",
					subtitle: null,
					projectId: null,
					lastVisitedAt: 1,
				},
				{
					key: "run:run-2",
					kind: "run",
					currentPath: "/runs/run-2",
					rootPath: "/runs/run-2",
					title: "Run two",
					subtitle: null,
					projectId: null,
					lastVisitedAt: 2,
				},
			],
			activeKey: "run:run-1",
			lastDurableRoute: "/projects",
		});

		renderHarness(["/runs/run-1/step/build?view=raw#artifact"]);

		act(() => {
			fireEvent.click(screen.getByRole("button", { name: "close-run-2" }));
		});

		await waitFor(() => {
			expect(screen.getByTestId("location").textContent).toBe(
				"/runs/run-1/step/build?view=raw#artifact",
			);
		});
		expect(screen.getByTestId("active-key").textContent).toBe("run:run-1");
		expect(parseTabs().map((tab) => tab.key)).toEqual(["run:run-1"]);
	});

	test("falls back to the last durable route when closing the final tab", async () => {
		setStoredState({
			tabs: [
				{
					key: "run:run-1",
					kind: "run",
					currentPath: "/runs/run-1",
					rootPath: "/runs/run-1",
					title: "Run one",
					subtitle: null,
					projectId: null,
					lastVisitedAt: 1,
				},
			],
			activeKey: "run:run-1",
			lastDurableRoute: "/projects",
		});

		renderHarness(["/runs/run-1"]);

		act(() => {
			fireEvent.click(screen.getByRole("button", { name: "close-run-1" }));
		});

		await waitFor(() => {
			expect(screen.getByTestId("location").textContent).toBe("/projects");
		});
		expect(parseTabs()).toEqual([]);
		expect(screen.getByTestId("active-key").textContent).toBe("null");
	});

	test("closes every workspace and returns to the last durable route", async () => {
		setStoredState({
			tabs: [
				{
					key: "run:run-1",
					kind: "run",
					currentPath: "/runs/run-1",
					rootPath: "/runs/run-1",
					title: "Run one",
					subtitle: null,
					projectId: null,
					lastVisitedAt: 1,
				},
				{
					key: "project:proj-1",
					kind: "project",
					currentPath: "/projects/proj-1",
					rootPath: "/projects/proj-1",
					title: "Project one",
					subtitle: null,
					projectId: "proj-1",
					lastVisitedAt: 2,
				},
			],
			activeKey: "run:run-1",
			lastDurableRoute: "/projects",
		});

		renderHarness(["/runs/run-1"]);

		act(() => {
			fireEvent.click(screen.getByRole("button", { name: "close-all" }));
		});

		await waitFor(() => {
			expect(screen.getByTestId("location").textContent).toBe("/projects");
		});
		expect(parseTabs()).toEqual([]);
		expect(screen.getByTestId("active-key").textContent).toBe("null");
	});

	test("adopts remote tabs from a storage event while preserving the local activeKey", async () => {
		setStoredState({
			tabs: [
				{
					key: "run:run-1",
					kind: "run",
					currentPath: "/runs/run-1",
					rootPath: "/runs/run-1",
					title: "Run one",
					subtitle: null,
					projectId: null,
					lastVisitedAt: 1,
				},
			],
			activeKey: "run:run-1",
			lastDurableRoute: "/projects",
		});

		renderHarness(["/runs/run-1"]);

		await waitFor(() => {
			expect(screen.getByTestId("active-key").textContent).toBe("run:run-1");
		});

		act(() => {
			const remoteState = JSON.stringify({
				tabs: [
					{
						key: "run:run-1",
						kind: "run",
						currentPath: "/runs/run-1",
						rootPath: "/runs/run-1",
						title: "Run one",
						subtitle: null,
						projectId: null,
						lastVisitedAt: 1,
					},
					{
						key: "run:run-3",
						kind: "run",
						currentPath: "/runs/run-3",
						rootPath: "/runs/run-3",
						title: "Run three",
						subtitle: null,
						projectId: null,
						lastVisitedAt: 5,
					},
				],
			});

			window.dispatchEvent(
				new StorageEvent("storage", {
					key: WORKSPACE_TABS_STORAGE_KEY,
					newValue: remoteState,
					storageArea: localStorage,
				}),
			);
		});

		await waitFor(() => {
			expect(parseTabs()).toHaveLength(2);
		});
		expect(parseTabs().map((tab) => tab.key)).toEqual([
			"run:run-1",
			"run:run-3",
		]);
		expect(screen.getByTestId("active-key").textContent).toBe("run:run-1");
	});

	test("removes tabs that were closed in another browser tab via storage event", async () => {
		setStoredState({
			tabs: [
				{
					key: "run:run-1",
					kind: "run",
					currentPath: "/runs/run-1",
					rootPath: "/runs/run-1",
					title: "Run one",
					subtitle: null,
					projectId: null,
					lastVisitedAt: 1,
				},
				{
					key: "run:run-2",
					kind: "run",
					currentPath: "/runs/run-2",
					rootPath: "/runs/run-2",
					title: "Run two",
					subtitle: null,
					projectId: null,
					lastVisitedAt: 2,
				},
			],
			activeKey: "run:run-1",
			lastDurableRoute: "/projects",
		});

		renderHarness(["/runs/run-1"]);

		await waitFor(() => {
			expect(parseTabs()).toHaveLength(2);
		});

		act(() => {
			const remoteState = JSON.stringify({
				tabs: [
					{
						key: "run:run-1",
						kind: "run",
						currentPath: "/runs/run-1",
						rootPath: "/runs/run-1",
						title: "Run one",
						subtitle: null,
						projectId: null,
						lastVisitedAt: 1,
					},
				],
			});

			window.dispatchEvent(
				new StorageEvent("storage", {
					key: WORKSPACE_TABS_STORAGE_KEY,
					newValue: remoteState,
					storageArea: localStorage,
				}),
			);
		});

		await waitFor(() => {
			expect(parseTabs()).toHaveLength(1);
		});
		expect(parseTabs().map((tab) => tab.key)).toEqual(["run:run-1"]);
		expect(screen.getByTestId("active-key").textContent).toBe("run:run-1");
	});
});
