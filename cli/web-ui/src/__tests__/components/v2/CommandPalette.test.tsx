import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { useContextualShortcuts } from "@/hooks/useContextualShortcuts";
import { ShortcutRegistryProvider } from "@/providers/ShortcutRegistryProvider";

let importVersion = 0;
const toggleThemeMock = mock(() => {});
const originalFetch = globalThis.fetch;

mock.module("@/hooks/usePrefersReducedMotion", () => ({
	usePrefersReducedMotion: () => true,
}));

mock.module("@/providers/ThemeProvider", () => ({
	useTheme: () => ({ toggleTheme: toggleThemeMock }),
}));

mock.module("@/components/ui/command", () => ({
	Command: ({
		children,
		className,
	}: {
		children?: ReactNode;
		className?: string;
	}) => <div className={className}>{children}</div>,
	CommandEmpty: ({ children }: { children?: ReactNode }) => (
		<div>{children}</div>
	),
	CommandGroup: ({
		children,
		heading,
	}: {
		children?: ReactNode;
		heading?: string;
	}) => (
		<section>
			{heading ? <h2>{heading}</h2> : null}
			{children}
		</section>
	),
	CommandInput: ({ placeholder }: { placeholder?: string }) => (
		<input placeholder={placeholder} />
	),
	CommandItem: ({
		children,
		onSelect,
		value,
	}: {
		children?: ReactNode;
		onSelect?: (value: string) => void;
		value?: string;
	}) => (
		<button type="button" onClick={() => onSelect?.(value ?? "")}>
			{children}
		</button>
	),
	CommandList: ({ children }: { children?: ReactNode }) => (
		<div>{children}</div>
	),
	CommandShortcut: ({ children }: { children?: ReactNode }) => (
		<span>{children}</span>
	),
}));

mock.module("@radix-ui/react-dialog", () => {
	type StubComponent = {
		(props: { children?: ReactNode }): ReactNode;
		displayName?: string;
	};
	const makeStub = (
		name: string,
		wrap: "passthrough" | "div",
	): StubComponent => {
		const stub: StubComponent =
			wrap === "div"
				? ({ children }) => <div>{children}</div>
				: ({ children }) => children;
		stub.displayName = name;
		return stub;
	};
	return {
		Root: makeStub("Root", "passthrough"),
		Trigger: makeStub("Trigger", "passthrough"),
		Portal: makeStub("Portal", "passthrough"),
		Overlay: makeStub("Overlay", "passthrough"),
		Content: makeStub("Content", "passthrough"),
		Close: makeStub("Close", "passthrough"),
		Title: makeStub("Title", "div"),
		Description: makeStub("Description", "div"),
	};
});

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
					if ("className" in props) domProps.className = props.className;
					return createElement(prop, domProps, children);
				};
			},
		},
	),
	AnimatePresence: ({ children }: { children?: ReactNode }) => children,
}));

function ContextualHarness({ action }: { action: () => void }) {
	useContextualShortcuts({
		viewId: "file-browser",
		viewLabel: "File Browser",
		shortcuts: [],
		commands: [
			{
				id: "toggle-frontmatter",
				label: "Show Frontmatter",
				description: "Show frontmatter in the current file viewer",
				keywords: ["frontmatter", "yaml"],
				action,
			},
		],
	});

	return null;
}

describe("CommandPalette", () => {
	beforeEach(() => {
		mock.restore();
		document.body.innerHTML = "";
		toggleThemeMock.mockClear();
	});

	afterEach(() => {
		cleanup();
		globalThis.fetch = originalFetch;
		mock.restore();
	});

	test("renders contextual commands and executes them", async () => {
		const action = mock(() => {});
		const { CommandPalette } = await import(
			`../../../components/v2/CommandPalette.tsx?command-palette-test=${++importVersion}`
		);

		render(
			<MemoryRouter>
				<ShortcutRegistryProvider>
					<ContextualHarness action={action} />
					<CommandPalette open onOpenChange={() => {}} />
				</ShortcutRegistryProvider>
			</MemoryRouter>,
		);

		expect(screen.getByText("File Browser")).toBeTruthy();
		const item = screen.getByRole("button", { name: /show frontmatter/i });
		fireEvent.click(item);

		expect(action).toHaveBeenCalledTimes(1);
	});

	test("opens About panel with build metadata", async () => {
		const onOpenChange = mock(() => {});
		const fetchMock = mock(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({
						status: "ok",
						uptime: 3661,
						port: 7710,
						projectCount: 3,
						isDev: false,
						version: "0.7.6-dev",
					}),
					{ headers: { "Content-Type": "application/json" } },
				),
			),
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const { CommandPalette } = await import(
			`../../../components/v2/CommandPalette.tsx?command-palette-test=${++importVersion}`
		);

		render(
			<MemoryRouter>
				<ShortcutRegistryProvider>
					<CommandPalette open onOpenChange={onOpenChange} />
				</ShortcutRegistryProvider>
			</MemoryRouter>,
		);

		fireEvent.click(screen.getByRole("button", { name: /^about$/i }));

		expect(onOpenChange).not.toHaveBeenCalled();
		expect(
			await screen.findByRole("heading", { name: "About rp1" }),
		).toBeTruthy();
		expect(await screen.findByText("0.7.6-dev")).toBeTruthy();
		expect(screen.getByText("7710")).toBeTruthy();
		expect(screen.getByText("3")).toBeTruthy();
		expect(screen.getByText("1h 1m")).toBeTruthy();
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/v2/health",
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
	});
});
