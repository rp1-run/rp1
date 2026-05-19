import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

let dismissNotificationMock = mock(async (_id: number) => {});
let dismissAllNotificationsMock = mock(async () => {});
let notificationsState = {
	notifications: [
		{
			id: 1,
			message: "Approval needed",
			sourceType: "agent" as const,
			sourceId: "run-1",
			route: "/runs/run-1",
			projectId: "proj-1",
			createdAt: "2026-04-11T00:00:00.000Z",
			harness: "codex" as const,
			runCommand: "/build",
			runName: "Sidebar Build",
			projectName: "Alpha Project",
			attentionLevel: "action_required" as const,
		},
	],
	summary: {
		totalCount: 1,
		actionRequiredCount: 1,
		attentionCount: 0,
		informationalCount: 0,
	},
	isLoading: false,
	error: null as Error | null,
	refetch: () => {},
	dismissNotification: async (id: number) => dismissNotificationMock(id),
	dismissAllNotifications: async () => dismissAllNotificationsMock(),
};
let v2LayoutImportVersion = 0;

function installLayoutMocks() {
	mock.module("@/hooks/useNotifications", () => ({
		useNotifications: () => notificationsState,
	}));

	mock.module("@/hooks/usePrefersReducedMotion", () => ({
		usePrefersReducedMotion: () => true,
	}));

	mock.module("@/components/v2/CommandPalette", () => ({
		CommandPalette: ({ open }: { open: boolean }) =>
			open ? (
				<div role="dialog" aria-label="Command Palette">
					Command palette
				</div>
			) : null,
	}));

	mock.module("@/components/v2/NotificationToast", () => ({
		NotificationContainer: () => null,
	}));

	mock.module("@/components/v2/ShortcutHelpOverlay", () => ({
		ShortcutHelpOverlay: () => null,
	}));

	mock.module("@lobehub/icons", () => ({
		Claude: () => <span data-testid="claude-icon" />,
		Gemini: () => <span data-testid="gemini-icon" />,
		GithubCopilot: () => <span data-testid="github-copilot-icon" />,
		OpenAI: () => <span data-testid="openai-icon" />,
		OpenCode: () => <span data-testid="opencode-icon" />,
	}));

	mock.module("@/components/v2/IconRail", () => ({
		IconRail: ({ className }: { className?: string }) => (
			<div data-testid="icon-rail" className={className} />
		),
	}));

	mock.module("@/components/ui/scroll-area", () => ({
		ScrollArea: ({
			children,
			className,
		}: {
			children?: ReactNode;
			className?: string;
		}) => <div className={className}>{children}</div>,
	}));

	mock.module("@/components/v2/HarnessIcon", () => ({
		HarnessIcon: () => <span data-testid="harness-icon" />,
	}));

	mock.module("framer-motion", () => ({
		motion: new Proxy(
			{},
			{
				get(_target: object, prop: string) {
					return ({
						children,
						...props
					}: Record<string, unknown> & { children?: ReactNode }) => {
						const domProps: Record<string, unknown> = {};
						const validProps = [
							"aria-label",
							"className",
							"id",
							"role",
							"style",
						];

						for (const key of validProps) {
							if (key in props) {
								domProps[key] = props[key];
							}
						}

						return createElement(prop, domProps, children);
					};
				},
			},
		),
		AnimatePresence: ({ children }: { children?: ReactNode }) => children,
	}));
}

async function renderLayout() {
	installLayoutMocks();
	const { AppLayout } = await import(
		`../../app/V2Layout.tsx?v2-layout-test=${++v2LayoutImportVersion}`
	);
	const router = createMemoryRouter([
		{
			path: "/",
			element: <AppLayout />,
			children: [
				{ index: true, element: <div>Activity page</div> },
				{ path: "projects", element: <div>Projects page</div> },
				{ path: "runs/:runId", element: <div>Run detail page</div> },
			],
		},
	]);

	return render(<RouterProvider router={router} />);
}

async function renderLayoutAt(initialEntry: string) {
	installLayoutMocks();
	const { AppLayout } = await import(
		`../../app/V2Layout.tsx?v2-layout-test=${++v2LayoutImportVersion}`
	);
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <AppLayout />,
				children: [
					{ index: true, element: <div>Activity page</div> },
					{ path: "projects", element: <div>Projects page</div> },
					{ path: "runs/:runId", element: <div>Run detail page</div> },
				],
			},
		],
		{ initialEntries: [initialEntry] },
	);

	return render(<RouterProvider router={router} />);
}

function getNotificationTriggers(): HTMLButtonElement[] {
	return screen.getAllByRole("button", {
		name: /^Open notifications\./i,
	}) as HTMLButtonElement[];
}

describe("AppLayout notifications shell wiring", () => {
	beforeEach(() => {
		mock.restore();
		document.body.innerHTML = "";
		dismissNotificationMock = mock(async (_id: number) => {});
		dismissAllNotificationsMock = mock(async () => {});
		notificationsState = {
			notifications: [
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
			],
			summary: {
				totalCount: 1,
				actionRequiredCount: 1,
				attentionCount: 0,
				informationalCount: 0,
			},
			isLoading: false,
			error: null,
			refetch: () => {},
			dismissNotification: async (id: number) => dismissNotificationMock(id),
			dismissAllNotifications: async () => dismissAllNotificationsMock(),
		};
	});

	afterEach(() => {
		cleanup();
		mock.restore();
	});

	test("shares one notifications drawer state across desktop and mobile triggers", async () => {
		await renderLayout();

		const [desktopTrigger, mobileTrigger] = getNotificationTriggers();
		expect(desktopTrigger).toBeTruthy();
		expect(mobileTrigger).toBeTruthy();

		fireEvent.click(desktopTrigger);

		await waitFor(() => {
			for (const trigger of getNotificationTriggers()) {
				expect(trigger.getAttribute("aria-pressed")).toBe("true");
			}
		});

		fireEvent.click(getNotificationTriggers()[1]!);

		await waitFor(() => {
			for (const trigger of getNotificationTriggers()) {
				expect(trigger.getAttribute("aria-pressed")).toBe("false");
			}
		});

		fireEvent.click(getNotificationTriggers()[1]!);

		await waitFor(() => {
			for (const trigger of getNotificationTriggers()) {
				expect(trigger.getAttribute("aria-pressed")).toBe("true");
			}
		});
	});

	test("keeps notifications available without rendering a workspace tab bar on tabless routes", async () => {
		await renderLayout();

		expect(getNotificationTriggers()).toHaveLength(2);
		expect(
			screen.queryByRole("navigation", { name: "Open workspaces" }),
		).toBeNull();
	});

	test("supports keyboard toggle, restores focus on close, and keeps overlays exclusive", async () => {
		await renderLayout();

		const desktopTrigger = getNotificationTriggers()[0]!;
		desktopTrigger.focus();
		expect(document.activeElement).toBe(desktopTrigger);

		fireEvent.keyDown(window, { key: "b", ctrlKey: true });

		await waitFor(() => {
			for (const trigger of getNotificationTriggers()) {
				expect(trigger.getAttribute("aria-pressed")).toBe("true");
			}
		});
		await waitFor(() => {
			const closeButton = screen.getByRole("button", { name: "Close drawer" });
			expect(document.activeElement).toBe(closeButton);
		});

		fireEvent.keyDown(window, { key: "k", ctrlKey: true });

		await waitFor(() => {
			expect(
				screen.getByRole("dialog", { name: "Command Palette" }),
			).toBeTruthy();
			for (const trigger of getNotificationTriggers()) {
				expect(trigger.getAttribute("aria-pressed")).toBe("false");
			}
		});

		fireEvent.keyDown(window, { key: "k", ctrlKey: true });

		await waitFor(() => {
			expect(
				screen.queryByRole("dialog", { name: "Command Palette" }),
			).toBeNull();
		});

		fireEvent.keyDown(window, { key: "\\", ctrlKey: true });

		await waitFor(() => {
			for (const trigger of getNotificationTriggers()) {
				expect(trigger.getAttribute("aria-pressed")).toBe("true");
			}
		});
		await waitFor(() => {
			const closeButton = screen.getByRole("button", { name: "Close drawer" });
			expect(document.activeElement).toBe(closeButton);
		});

		fireEvent.keyDown(window, { key: "Escape" });

		await waitFor(() => {
			for (const trigger of getNotificationTriggers()) {
				expect(trigger.getAttribute("aria-pressed")).toBe("false");
			}
			expect(document.activeElement).toBe(desktopTrigger);
		});
	});

	test("renders workspace navigation without a global breadcrumb row", async () => {
		await renderLayoutAt("/runs/run-1");

		expect(getNotificationTriggers()).toHaveLength(2);
		expect(
			screen.getByRole("navigation", { name: "Open workspaces" }),
		).toBeTruthy();
		expect(
			screen.getByRole("button", { name: /^(Build One|Run run-1)/ }),
		).toBeTruthy();
		expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
		expect(screen.queryByRole("navigation", { name: "Run info" })).toBeNull();
		expect(
			screen.getByRole("navigation", { name: "Mobile navigation" }),
		).toBeTruthy();
		expect(screen.getByTestId("icon-rail")).toBeTruthy();
	});
});
