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
import { useWorkspaceDescriptor } from "../../hooks/useWorkspaceDescriptor";
import {
	useWorkspaceTabs,
	WORKSPACE_TABS_STORAGE_KEY,
	type WorkspaceTab,
	WorkspaceTabsProvider,
} from "../../hooks/useWorkspaceTabs";

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

function DescriptorHarness({
	title,
	subtitle,
	projectId,
	unavailable = false,
}: {
	readonly title?: string | null;
	readonly subtitle?: string | null;
	readonly projectId?: string | null;
	readonly unavailable?: boolean;
}) {
	const { workspaceCommands } = useWorkspaceDescriptor({
		title,
		subtitle,
		projectId,
		unavailable,
	});
	const { tabs, activeKey } = useWorkspaceTabs();
	const location = useLocation();

	return (
		<div>
			<div data-testid="location">{location.pathname}</div>
			<div data-testid="active-key">{activeKey ?? "null"}</div>
			<pre data-testid="tabs">{JSON.stringify(tabs)}</pre>
			{workspaceCommands.map((command) => (
				<button key={command.id} type="button" onClick={command.action}>
					{command.id}
				</button>
			))}
		</div>
	);
}

function parseTabs(): WorkspaceTab[] {
	return JSON.parse(
		screen.getByTestId("tabs").textContent ?? "[]",
	) as WorkspaceTab[];
}

function renderHarness(
	initialEntries: readonly string[],
	props: {
		readonly title?: string | null;
		readonly subtitle?: string | null;
		readonly projectId?: string | null;
		readonly unavailable?: boolean;
	},
) {
	return render(
		<MemoryRouter initialEntries={[...initialEntries]}>
			<WorkspaceTabsProvider>
				<DescriptorHarness {...props} />
			</WorkspaceTabsProvider>
		</MemoryRouter>,
	);
}

describe("useWorkspaceDescriptor", () => {
	beforeEach(() => {
		localStorage.clear();
		sessionStorage.clear();
	});

	afterEach(() => {
		cleanup();
		localStorage.clear();
		sessionStorage.clear();
	});

	test("publishes metadata and exposes adjacent workspace commands", async () => {
		setStoredState({
			tabs: [
				{
					key: "run:run-0",
					kind: "run",
					currentPath: "/runs/run-0",
					rootPath: "/runs/run-0",
					title: "Run 0",
					subtitle: null,
					projectId: null,
					lastVisitedAt: 1,
				},
				{
					key: "run:run-1",
					kind: "run",
					currentPath: "/runs/run-1",
					rootPath: "/runs/run-1",
					title: "Run 1",
					subtitle: null,
					projectId: null,
					lastVisitedAt: 2,
				},
				{
					key: "run:run-2",
					kind: "run",
					currentPath: "/runs/run-2",
					rootPath: "/runs/run-2",
					title: "Run 2",
					subtitle: null,
					projectId: null,
					lastVisitedAt: 3,
				},
			],
			activeKey: "run:run-1",
			lastDurableRoute: "/projects",
		});

		renderHarness(["/runs/run-1"], {
			title: "Primary Run",
			subtitle: "Project One",
			projectId: "proj-1",
		});

		await waitFor(() => {
			expect(parseTabs()[1]).toMatchObject({
				title: "Primary Run",
				subtitle: "Project One",
				projectId: "proj-1",
			});
		});
		expect(
			screen.getByRole("button", { name: "previous-workspace" }),
		).toBeTruthy();
		expect(screen.getByRole("button", { name: "next-workspace" })).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "close-workspace" }),
		).toBeTruthy();

		act(() => {
			fireEvent.click(
				screen.getByRole("button", { name: "previous-workspace" }),
			);
		});

		await waitFor(() => {
			expect(screen.getByTestId("location").textContent).toBe("/runs/run-0");
		});
	});

	test("reconciles unavailable workspaces to the last durable route", async () => {
		setStoredState({
			tabs: [
				{
					key: "run:run-1",
					kind: "run",
					currentPath: "/runs/run-1",
					rootPath: "/runs/run-1",
					title: "Run 1",
					subtitle: null,
					projectId: null,
					lastVisitedAt: 1,
				},
			],
			activeKey: "run:run-1",
			lastDurableRoute: "/projects",
		});

		renderHarness(["/runs/run-1"], {
			unavailable: true,
		});

		await waitFor(() => {
			expect(screen.getByTestId("location").textContent).toBe("/projects");
		});
		expect(parseTabs()).toEqual([]);
		expect(screen.getByTestId("active-key").textContent).toBe("null");
	});
});
