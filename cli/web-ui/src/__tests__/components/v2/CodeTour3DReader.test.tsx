import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { CodeTour3DReader } from "@/components/v2/CodeTour3DReader";
import { buildCodeTourViewModel } from "@/lib/code-tour-view-model";
import type { CodeTourDocument } from "../../../../../shared/code-tour";

const originalGetContext = HTMLCanvasElement.prototype.getContext;
const originalMatchMedia = window.matchMedia;

const tourDocument: CodeTourDocument = {
	version: "1.0",
	kind: "pr-walkthrough-code-tour",
	title: "Auth Flow Code Tour",
	source: {
		kind: "github-pr",
		repo: "rp1-run/rp1",
		id: "77",
	},
	domains: {
		workflow: {
			label: "Workflow",
			color: "#7ad0ff",
		},
		ui: {
			label: "Arcade UI",
			color: "#ff8bd4",
		},
	},
	concepts: [
		{
			id: "auth-gate",
			label: "Auth Gate",
			domain: "workflow",
			epicenter: true,
			summary: "Validates the caller before the UI renders private state.",
			fragments: ["f-auth-route", "f-auth-policy"],
		},
		{
			id: "token-ui",
			label: "Token UI",
			domain: "ui",
			summary: "Shows reviewers the token state and fallback copy.",
			fragments: ["f-status"],
		},
	],
	fragments: [
		{
			id: "f-auth-route",
			label: "AuthRoute",
			path: "server/auth.ts",
			line: 10,
			lineEnd: 12,
			language: "ts",
			code: [
				{
					type: "add",
					tokens: [
						["kw", "export"],
						["", " const requireAuth = () => token"],
					],
				},
			],
		},
		{
			id: "f-auth-policy",
			label: "AuthPolicy",
			path: "server/policy.ts",
			line: 30,
			lineEnd: 31,
			language: "ts",
			code: [
				{
					tokens: [
						["kw", "return"],
						["", " hasAccess"],
					],
				},
			],
		},
		{
			id: "f-status",
			label: "StatusBadge",
			path: "ui/StatusBadge.tsx",
			line: 18,
			language: "tsx",
			code: [
				{
					type: "add",
					tokens: [
						["", "<span>"],
						["str", "Ready"],
						["", "</span>"],
					],
				},
			],
		},
	],
	edges: {
		concept: [
			{
				from: "auth-gate",
				to: "token-ui",
				label: "feeds",
			},
		],
		fragment: [
			{
				from: "f-auth-policy",
				to: "f-status",
				label: "calls",
			},
		],
	},
	tour: [
		{
			conceptId: "auth-gate",
			title: "Open with auth gate",
			sub: "Server boundary",
			reason:
				"- Start where `requireAuth` protects private state.\n- Verify the fallback path stays explicit.",
		},
		{
			conceptId: "token-ui",
			title: "Review token UI",
			sub: "Arcade surface",
			reason: "Then inspect what reviewers see.",
		},
	],
};

function renderReader(
	overrides: Partial<Parameters<typeof CodeTour3DReader>[0]> = {},
) {
	return render(
		<CodeTour3DReader
			tour={buildCodeTourViewModel(tourDocument)}
			path="pr-walkthroughs/pr-77-walkthrough-001.json"
			{...overrides}
		/>,
	);
}

describe("CodeTour3DReader", () => {
	beforeEach(() => {
		document.documentElement.classList.remove("light", "dark");
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: (query: string) => ({
				matches: false,
				media: query,
				onchange: null,
				addEventListener: () => {},
				removeEventListener: () => {},
				addListener: () => {},
				removeListener: () => {},
				dispatchEvent: () => false,
			}),
		});
		Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
			configurable: true,
			value: mock(() => null) as unknown as HTMLCanvasElement["getContext"],
		});
	});

	afterEach(() => {
		cleanup();
		document.documentElement.classList.remove("light", "dark");
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: originalMatchMedia,
		});
		Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
			configurable: true,
			value: originalGetContext,
		});
		mock.restore();
	});

	test("renders concepts-only with fragment source and no view switcher without WebGL", async () => {
		renderReader();

		await waitFor(() => {
			expect(screen.getByText("3D render unavailable")).toBeTruthy();
		});
		expect(
			screen.getByRole("heading", { name: "Open with auth gate" }),
		).toBeTruthy();
		expect(screen.getByText("requireAuth").tagName).toBe("CODE");
		expect(screen.getAllByText("server/auth.ts:10-12").length).toBeGreaterThan(
			0,
		);

		fireEvent.click(screen.getByRole("button", { name: "Next tour step" }));

		expect(
			screen.getByRole("heading", { name: "Review token UI" }),
		).toBeTruthy();
		expect(screen.getAllByText("ui/StatusBadge.tsx:18").length).toBeGreaterThan(
			0,
		);

		fireEvent.click(
			screen.getByRole("button", { name: /feeds\s+Auth Gate -> Token UI/ }),
		);

		expect(
			screen.getByRole("heading", { name: "Open with auth gate" }),
		).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: /AuthPolicy/ }));

		expect(
			screen.getAllByText("server/policy.ts:30-31").length,
		).toBeGreaterThan(0);

		expect(screen.queryByRole("tab", { name: /Concepts/ })).toBeNull();
		expect(screen.queryByRole("tab", { name: /Fragments/ })).toBeNull();
	});

	test("reports render failure and exposes source mode from the diagnostic state", async () => {
		const onSourceModeRequested = mock(() => {});
		const onRenderFailure = mock(() => {});

		renderReader({ onSourceModeRequested, onRenderFailure });

		await waitFor(() => {
			expect(onRenderFailure).toHaveBeenCalledWith(
				"3D Code Tour unavailable because WebGL is not available in this browser.",
			);
		});
		expect(screen.getByText("3D render unavailable")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Show source JSON" }));

		expect(onSourceModeRequested).toHaveBeenCalled();
	});

	test("tracks document light and dark theme for tour chrome", () => {
		document.documentElement.classList.add("light");

		const { unmount } = renderReader();

		let reader = screen.getByLabelText("Code Tour for Auth Flow Code Tour");
		expect(reader.getAttribute("data-code-tour-theme")).toBe("light");

		unmount();
		document.documentElement.classList.remove("light");
		document.documentElement.classList.add("dark");

		renderReader();
		reader = screen.getByLabelText("Code Tour for Auth Flow Code Tour");
		expect(reader.getAttribute("data-code-tour-theme")).toBe("dark");
	});
});
