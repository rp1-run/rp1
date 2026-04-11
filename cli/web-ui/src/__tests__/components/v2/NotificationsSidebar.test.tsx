import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

let notificationsSidebarImportVersion = 0;

async function loadNotificationsSidebar() {
	mock.module("@lobehub/icons", () => ({
		Claude: () => <span data-testid="claude-icon" />,
		OpenAI: () => <span data-testid="openai-icon" />,
		OpenCode: () => <span data-testid="opencode-icon" />,
	}));

	mock.module("@/components/v2/HarnessIcon", () => ({
		HarnessIcon: () => <span data-testid="harness-icon" />,
	}));

	const { NotificationsSidebar } = await import(
		`../../../components/v2/NotificationsSidebar.tsx?notifications-sidebar-test=${++notificationsSidebarImportVersion}`
	);

	return NotificationsSidebar;
}

describe("NotificationsSidebar", () => {
	beforeEach(() => {
		mock.restore();
		document.body.innerHTML = "";
	});

	afterEach(() => {
		cleanup();
		mock.restore();
	});

	function LocationProbe() {
		const location = useLocation();
		return <span data-testid="location-probe">{location.pathname}</span>;
	}

	test("renders grouped notifications with separate open and dismiss controls", async () => {
		const dismissMock = mock(() => Promise.resolve());
		const closeMock = mock(() => {});
		const NotificationsSidebar = await loadNotificationsSidebar();

		render(
			<MemoryRouter initialEntries={["/"]}>
				<Routes>
					<Route
						path="*"
						element={
							<>
								<LocationProbe />
								<NotificationsSidebar
									open={true}
									onClose={closeMock}
									onDismissNotification={dismissMock}
									isLoading={false}
									error={null}
									notifications={[
										{
											id: 1,
											message: "Approval needed",
											sourceType: "agent",
											sourceId: "run-1",
											route: "/runs/run-1",
											projectId: "proj-1",
											createdAt: "2026-04-11T00:00:00.000Z",
											harness: "codex",
											runCommand: "/build",
											runName: "Sidebar Build",
											projectName: "Alpha Project",
											attentionLevel: "action_required",
										},
										{
											id: 2,
											message: "Verify completed",
											sourceType: "run",
											sourceId: "run-2",
											route: "/runs/run-2",
											projectId: "proj-1",
											createdAt: "2026-04-11T00:02:00.000Z",
											harness: "claude-code",
											runCommand: "/verify",
											runName: "Sidebar Verify",
											projectName: "Alpha Project",
											attentionLevel: "info",
										},
									]}
								/>
							</>
						}
					/>
				</Routes>
			</MemoryRouter>,
		);

		expect(screen.getByRole("dialog", { name: "Notifications" })).toBeTruthy();
		expect(screen.getByText("Action required")).toBeTruthy();
		expect(screen.getByText("Informational")).toBeTruthy();

		fireEvent.click(
			screen.getByRole("button", {
				name: "Open notification: Approval needed",
			}),
		);

		await waitFor(() => {
			expect(screen.getByTestId("location-probe").textContent).toBe(
				"/runs/run-1",
			);
		});
		expect(closeMock).toHaveBeenCalledTimes(1);

		await act(async () => {
			fireEvent.click(
				screen.getByRole("button", {
					name: "Dismiss notification: Approval needed",
				}),
			);
		});

		expect(dismissMock).toHaveBeenCalledWith(1);
	});

	test("shows loading and empty states inside the drawer", async () => {
		const NotificationsSidebar = await loadNotificationsSidebar();

		const { rerender } = render(
			<MemoryRouter>
				<NotificationsSidebar
					open={true}
					onClose={() => {}}
					onDismissNotification={() => Promise.resolve()}
					isLoading={true}
					error={null}
					notifications={[]}
				/>
			</MemoryRouter>,
		);

		expect(screen.getByRole("dialog", { name: "Notifications" })).toBeTruthy();
		expect(screen.queryByText("No notifications right now.")).toBeNull();

		rerender(
			<MemoryRouter>
				<NotificationsSidebar
					open={true}
					onClose={() => {}}
					onDismissNotification={() => Promise.resolve()}
					isLoading={false}
					error={null}
					notifications={[]}
				/>
			</MemoryRouter>,
		);

		expect(screen.getByText("No notifications right now.")).toBeTruthy();
	});
});
