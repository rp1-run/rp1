import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { WorkspaceTab } from "@/hooks/useWorkspaceTabs";

const activateWorkspaceMock = mock((_key: string) => {});
const closeWorkspaceMock = mock((_key: string) => {});

const tabs: readonly WorkspaceTab[] = [
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

describe("WorkspaceTabStrip", () => {
	beforeEach(() => {
		mock.restore();
		activateWorkspaceMock.mockClear();
		closeWorkspaceMock.mockClear();
		HTMLElement.prototype.scrollIntoView = mock(
			() => {},
		) as typeof HTMLElement.prototype.scrollIntoView;

		mock.module("@/hooks/useWorkspaceTabs", () => ({
			useWorkspaceTabs: () => ({
				tabs,
				activeKey: "run:run-1",
				lastDurableRoute: "/",
				openWorkspace: (_targetRoute: string) => {},
				activateWorkspace: activateWorkspaceMock,
				closeWorkspace: closeWorkspaceMock,
			}),
		}));

		mock.module("@/hooks/usePrefersReducedMotion", () => ({
			usePrefersReducedMotion: () => true,
		}));
	});

	afterEach(() => {
		cleanup();
		mock.restore();
	});

	test("renders tabs and supports keyboard activation and close", async () => {
		const { WorkspaceTabStrip } = await import(
			"../../../components/v2/WorkspaceTabStrip"
		);

		render(<WorkspaceTabStrip />);

		const firstTab = screen.getByRole("button", { name: "Run run-1" });
		const secondTab = screen.getByRole("button", { name: "proj-1, workspace" });

		firstTab.focus();
		fireEvent.keyDown(firstTab, { key: "ArrowRight" });
		expect(document.activeElement).toBe(secondTab);

		fireEvent.keyDown(secondTab, { key: "Enter" });
		expect(activateWorkspaceMock).toHaveBeenCalledWith("project:proj-1");

		fireEvent.keyDown(secondTab, { key: "Delete" });
		expect(closeWorkspaceMock).toHaveBeenCalledWith("project:proj-1");
	});
});
