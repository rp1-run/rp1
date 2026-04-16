import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import {
	WORKSPACE_TABS_STORAGE_KEY,
	type WorkspaceTab,
	WorkspaceTabsProvider,
} from "@/hooks/useWorkspaceTabs";

const baseTabs: readonly WorkspaceTab[] = [
	{
		key: "run:run-1",
		kind: "run",
		currentPath: "/runs/run-1",
		rootPath: "/runs/run-1",
		title: "Run run-1",
		subtitle: null,
		projectId: null,
		lastVisitedAt: 1,
	},
	{
		key: "project:proj-1",
		kind: "project",
		currentPath: "/projects/proj-1",
		rootPath: "/projects/proj-1",
		title: "proj-1",
		subtitle: "workspace",
		projectId: "proj-1",
		lastVisitedAt: 2,
	},
];

const originalRequestAnimationFrame = window.requestAnimationFrame;
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
const scrollIntoViewMock = mock(
	(_options?: boolean | ScrollIntoViewOptions) => {},
);

let importVersion = 0;
let prefersReducedMotion = true;

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

function LocationProbe() {
	const location = useLocation();
	return <span data-testid="location-probe">{location.pathname}</span>;
}

async function renderStrip(
	initialEntries: readonly string[],
	options: {
		action?: ReactNode;
	} = {},
) {
	mock.module("@/hooks/usePrefersReducedMotion", () => ({
		usePrefersReducedMotion: () => prefersReducedMotion,
	}));

	const { WorkspaceTabStrip } = await import(
		`../../../components/v2/WorkspaceTabStrip.tsx?workspace-tab-strip-test=${++importVersion}`
	);

	return render(
		<MemoryRouter initialEntries={[...initialEntries]}>
			<WorkspaceTabsProvider>
				<WorkspaceTabStrip action={options.action} />
				<Routes>
					<Route path="/" element={<LocationProbe />} />
					<Route path="/runs/:runId/*" element={<LocationProbe />} />
					<Route path="/projects/:projectId" element={<LocationProbe />} />
				</Routes>
			</WorkspaceTabsProvider>
		</MemoryRouter>,
	);
}

describe("WorkspaceTabStrip", () => {
	beforeEach(() => {
		mock.restore();
		scrollIntoViewMock.mockClear();
		prefersReducedMotion = true;
		localStorage.clear();
		sessionStorage.clear();
		HTMLElement.prototype.scrollIntoView =
			scrollIntoViewMock as typeof HTMLElement.prototype.scrollIntoView;
		window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		}) as typeof window.requestAnimationFrame;
	});

	afterEach(() => {
		cleanup();
		mock.restore();
		localStorage.clear();
		sessionStorage.clear();
		window.requestAnimationFrame = originalRequestAnimationFrame;
		HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
	});

	test("renders close affordances and supports keyboard activation and close", async () => {
		setStoredState({
			tabs: baseTabs,
			activeKey: "run:run-1",
			lastDurableRoute: "/",
		});

		await renderStrip(["/runs/run-1"]);

		const firstTab = await screen.findByRole("button", { name: "Run run-1" });
		const secondTab = screen.getByRole("button", { name: "proj-1, workspace" });

		expect(
			screen.getByRole("button", { name: "Close Run run-1" }),
		).toBeTruthy();
		expect(screen.getByRole("button", { name: "Close proj-1" })).toBeTruthy();

		firstTab.focus();
		fireEvent.keyDown(firstTab, { key: "ArrowRight" });
		expect(document.activeElement).toBe(secondTab);

		fireEvent.keyDown(secondTab, { key: "Enter" });
		await waitFor(() => {
			expect(screen.getByTestId("location-probe").textContent).toBe(
				"/projects/proj-1",
			);
		});

		fireEvent.keyDown(secondTab, { key: "Delete" });
		await waitFor(() => {
			expect(screen.getByTestId("location-probe").textContent).toBe(
				"/runs/run-1",
			);
		});
	});

	test("supports home/end focus movement plus space and backspace keyboard controls", async () => {
		setStoredState({
			tabs: baseTabs,
			activeKey: "run:run-1",
			lastDurableRoute: "/",
		});

		await renderStrip(["/runs/run-1"]);

		const firstTab = await screen.findByRole("button", { name: "Run run-1" });
		const secondTab = screen.getByRole("button", { name: "proj-1, workspace" });
		const secondCloseButton = screen.getByRole("button", {
			name: "Close proj-1",
		});

		firstTab.focus();
		fireEvent.keyDown(firstTab, { key: "End" });
		expect(document.activeElement).toBe(secondTab);

		fireEvent.keyDown(secondTab, { key: " " });
		await waitFor(() => {
			expect(screen.getByTestId("location-probe").textContent).toBe(
				"/projects/proj-1",
			);
		});

		fireEvent.keyDown(secondTab, { key: "Home" });
		expect(document.activeElement).toBe(firstTab);

		secondCloseButton.focus();
		fireEvent.keyDown(secondCloseButton, { key: "Backspace" });
		await waitFor(() => {
			expect(screen.getByTestId("location-probe").textContent).toBe(
				"/runs/run-1",
			);
		});
	});

	test("scrolls the active tab with auto behavior when reduced motion is enabled", async () => {
		setStoredState({
			tabs: baseTabs,
			activeKey: "run:run-1",
			lastDurableRoute: "/",
		});

		await renderStrip(["/runs/run-1"]);

		await waitFor(() => {
			expect(scrollIntoViewMock).toHaveBeenCalledWith(
				expect.objectContaining({ behavior: "auto" }),
			);
		});
	});

	test("scrolls the active tab with smooth behavior when reduced motion is disabled", async () => {
		prefersReducedMotion = false;
		setStoredState({
			tabs: baseTabs,
			activeKey: "run:run-1",
			lastDurableRoute: "/",
		});

		await renderStrip(["/runs/run-1"]);

		await waitFor(() => {
			expect(scrollIntoViewMock).toHaveBeenCalledWith(
				expect.objectContaining({ behavior: "smooth" }),
			);
		});
	});

	test("keeps the top bar visible for actions even when there are no open tabs", async () => {
		await renderStrip(["/"], {
			action: <button type="button">Notifications</button>,
		});

		expect(screen.getByRole("button", { name: "Notifications" })).toBeTruthy();
		expect(
			screen.queryByRole("navigation", { name: "Open workspaces" }),
		).toBeNull();
	});
});
