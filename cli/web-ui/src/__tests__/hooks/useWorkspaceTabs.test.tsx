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
	const { tabs, activeKey, lastDurableRoute, openWorkspace, closeWorkspace } =
		useWorkspaceTabs();
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
		</div>
	);
}

function setStoredState(state: {
	readonly tabs: readonly WorkspaceTab[];
	readonly activeKey: string | null;
	readonly lastDurableRoute: string;
}) {
	sessionStorage.setItem(WORKSPACE_TABS_STORAGE_KEY, JSON.stringify(state));
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
		sessionStorage.clear();
	});

	afterEach(() => {
		cleanup();
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
});
