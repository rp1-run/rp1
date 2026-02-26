import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import type { ShortcutDefinition } from "@/hooks/useContextualShortcuts";

export interface ContextualShortcutGroup {
	viewId: string;
	viewLabel: string;
	shortcuts: ShortcutDefinition[];
}

export interface ShortcutRegistryApi {
	registerContextual: (
		viewId: string,
		viewLabel: string,
		shortcuts: ShortcutDefinition[],
	) => void;
	unregisterContextual: (viewId: string) => void;
}

export interface ShortcutRegistryData {
	globalShortcuts: ShortcutDefinition[];
	navigationShortcuts: ShortcutDefinition[];
	contextualShortcuts: ContextualShortcutGroup | null;
}

export const ShortcutRegistryApiContext =
	createContext<ShortcutRegistryApi | null>(null);

export const ShortcutRegistryDataContext =
	createContext<ShortcutRegistryData | null>(null);

const GLOBAL_SHORTCUTS: ShortcutDefinition[] = [
	{
		key: "Cmd+K",
		label: "Search",
		description: "Open command palette",
		action: () => {},
	},
	{
		key: "Cmd+B",
		label: "Toggle Sidebar",
		description: "Show or hide the sidebar",
		action: () => {},
	},
	{
		key: "?",
		label: "Shortcuts",
		description: "Show keyboard shortcuts",
		action: () => {},
	},
];

const NAVIGATION_SHORTCUTS: ShortcutDefinition[] = [
	{
		key: "g h",
		label: "Home",
		description: "Go to Home",
		action: () => {},
	},
	{
		key: "g r",
		label: "Runs",
		description: "Go to Runs",
		action: () => {},
	},
	{
		key: "g p",
		label: "Projects",
		description: "Go to Projects",
		action: () => {},
	},
	{
		key: "j",
		label: "Down",
		description: "Move selection down",
		action: () => {},
	},
	{
		key: "k",
		label: "Up",
		description: "Move selection up",
		action: () => {},
	},
	{
		key: "l",
		label: "Open",
		description: "Open selected item",
		action: () => {},
	},
	{
		key: "h",
		label: "Back",
		description: "Go back",
		action: () => {},
	},
];

interface ShortcutRegistryProviderProps {
	children: ReactNode;
}

export function ShortcutRegistryProvider({
	children,
}: ShortcutRegistryProviderProps) {
	const [contextualShortcuts, setContextualShortcuts] =
		useState<ContextualShortcutGroup | null>(null);

	const registerContextual = useCallback(
		(viewId: string, viewLabel: string, shortcuts: ShortcutDefinition[]) => {
			setContextualShortcuts({ viewId, viewLabel, shortcuts });
		},
		[],
	);

	const unregisterContextual = useCallback((viewId: string) => {
		setContextualShortcuts((current) =>
			current?.viewId === viewId ? null : current,
		);
	}, []);

	const apiRef = useRef<ShortcutRegistryApi>({
		registerContextual,
		unregisterContextual,
	});

	const dataValue = useMemo<ShortcutRegistryData>(
		() => ({
			globalShortcuts: GLOBAL_SHORTCUTS,
			navigationShortcuts: NAVIGATION_SHORTCUTS,
			contextualShortcuts,
		}),
		[contextualShortcuts],
	);

	return (
		<ShortcutRegistryApiContext.Provider value={apiRef.current}>
			<ShortcutRegistryDataContext.Provider value={dataValue}>
				{children}
			</ShortcutRegistryDataContext.Provider>
		</ShortcutRegistryApiContext.Provider>
	);
}

export function useShortcutRegistry(): ShortcutRegistryData {
	const context = useContext(ShortcutRegistryDataContext);
	if (!context) {
		throw new Error(
			"useShortcutRegistry must be used within a ShortcutRegistryProvider",
		);
	}
	return context;
}
