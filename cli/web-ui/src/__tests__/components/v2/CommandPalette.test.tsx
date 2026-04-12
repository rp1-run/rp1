import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { useContextualShortcuts } from "@/hooks/useContextualShortcuts";
import { ShortcutRegistryProvider } from "@/providers/ShortcutRegistryProvider";

let importVersion = 0;
const toggleThemeMock = mock(() => {});

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

mock.module("@radix-ui/react-dialog", () => ({
	Root: ({ children }: { children?: ReactNode }) => children,
	Portal: ({ children }: { children?: ReactNode }) => children,
	Overlay: ({ children }: { children?: ReactNode }) => children,
	Content: ({ children }: { children?: ReactNode }) => children,
	Title: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
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
});
