import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
	normalizeWorkspaceRoute,
	type WorkspaceKind,
	type WorkspaceRouteDescriptor,
} from "@/lib/workspace-routes";

export interface WorkspaceTab {
	readonly key: string;
	readonly kind: WorkspaceKind;
	readonly currentPath: string;
	readonly rootPath: string;
	readonly title: string;
	readonly subtitle: string | null;
	readonly projectId: string | null;
	readonly lastVisitedAt: number;
}

export interface WorkspaceTabsState {
	readonly tabs: readonly WorkspaceTab[];
	readonly activeKey: string | null;
	readonly lastDurableRoute: string;
}

export interface WorkspaceTabMetadata {
	readonly title: string;
	readonly subtitle: string | null;
	readonly projectId: string | null;
}

interface WorkspaceTabsContextValue extends WorkspaceTabsState {
	readonly openWorkspace: (targetRoute: string) => void;
	readonly activateWorkspace: (key: string) => void;
	readonly closeWorkspace: (key: string) => void;
	readonly updateWorkspaceMetadata: (
		key: string,
		metadata: WorkspaceTabMetadata,
	) => void;
}

interface StoredWorkspaceTabsState {
	readonly tabs?: unknown;
	readonly activeKey?: unknown;
	readonly lastDurableRoute?: unknown;
}

export const WORKSPACE_TABS_STORAGE_KEY = "rp1-workspace-tabs:v1";
const BROADCAST_CHANNEL_NAME = "rp1-workspace-tabs";

const DEFAULT_STATE: WorkspaceTabsState = {
	tabs: [],
	activeKey: null,
	lastDurableRoute: "/",
};

const WorkspaceTabsContext = createContext<WorkspaceTabsContextValue | null>(
	null,
);

function createCurrentPath(
	pathname: string,
	search: string,
	hash: string,
): string {
	return `${pathname}${search}${hash}`;
}

function isWorkspaceTabRecord(value: unknown): value is Partial<WorkspaceTab> {
	return typeof value === "object" && value !== null;
}

function isWorkspaceTab(value: WorkspaceTab | null): value is WorkspaceTab {
	return value !== null;
}

function sanitizeStoredTab(record: unknown): WorkspaceTab | null {
	if (!isWorkspaceTabRecord(record) || typeof record.currentPath !== "string") {
		return null;
	}

	const normalized = normalizeWorkspaceRoute(record.currentPath);
	if (normalized.type !== "workspace") return null;

	return {
		key: normalized.key,
		kind: normalized.kind,
		currentPath: record.currentPath,
		rootPath:
			typeof record.rootPath === "string" && record.rootPath.length > 0
				? record.rootPath
				: normalized.rootPath,
		title:
			typeof record.title === "string" && record.title.length > 0
				? record.title
				: normalized.title,
		subtitle: typeof record.subtitle === "string" ? record.subtitle : null,
		projectId:
			typeof record.projectId === "string"
				? record.projectId
				: normalized.projectId,
		lastVisitedAt:
			typeof record.lastVisitedAt === "number" &&
			Number.isFinite(record.lastVisitedAt)
				? record.lastVisitedAt
				: 0,
	};
}

function dedupeTabs(tabs: readonly WorkspaceTab[]): readonly WorkspaceTab[] {
	const order: string[] = [];
	const byKey = new Map<string, WorkspaceTab>();

	for (const tab of tabs) {
		const existing = byKey.get(tab.key);
		if (!existing) {
			order.push(tab.key);
			byKey.set(tab.key, tab);
			continue;
		}

		if (tab.lastVisitedAt >= existing.lastVisitedAt) {
			byKey.set(tab.key, tab);
		}
	}

	return order.map((key) => byKey.get(key)!);
}

function loadWorkspaceTabsState(): WorkspaceTabsState {
	if (typeof window === "undefined") return DEFAULT_STATE;

	try {
		const raw = localStorage.getItem(WORKSPACE_TABS_STORAGE_KEY);
		if (!raw) return DEFAULT_STATE;

		const parsed = JSON.parse(raw) as StoredWorkspaceTabsState;
		const parsedTabs = Array.isArray(parsed.tabs)
			? dedupeTabs(parsed.tabs.map(sanitizeStoredTab).filter(isWorkspaceTab))
			: [];
		const normalizedDurableRoute =
			typeof parsed.lastDurableRoute === "string" &&
			normalizeWorkspaceRoute(parsed.lastDurableRoute).type === "durable"
				? parsed.lastDurableRoute
				: "/";
		const activeKey =
			typeof parsed.activeKey === "string" &&
			parsedTabs.some((tab) => tab.key === parsed.activeKey)
				? parsed.activeKey
				: null;

		return {
			tabs: parsedTabs,
			activeKey,
			lastDurableRoute: normalizedDurableRoute,
		};
	} catch {
		return DEFAULT_STATE;
	}
}

function upsertWorkspaceTab(
	tabs: readonly WorkspaceTab[],
	descriptor: WorkspaceRouteDescriptor,
	currentPath: string,
	timestamp: number,
): readonly WorkspaceTab[] {
	const existingIndex = tabs.findIndex((tab) => tab.key === descriptor.key);
	const existingTab = existingIndex >= 0 ? tabs[existingIndex] : null;
	const nextTab: WorkspaceTab = {
		key: descriptor.key,
		kind: descriptor.kind,
		currentPath,
		rootPath: descriptor.rootPath,
		title: existingTab?.title || descriptor.title,
		subtitle: existingTab?.subtitle ?? descriptor.subtitle,
		projectId: descriptor.projectId ?? existingTab?.projectId ?? null,
		lastVisitedAt: timestamp,
	};

	if (existingIndex < 0) {
		return [...tabs, nextTab];
	}

	const nextTabs = [...tabs];
	nextTabs[existingIndex] = nextTab;
	return nextTabs;
}

function getCloseNavigationTarget(
	tabs: readonly WorkspaceTab[],
	closingKey: string,
	lastDurableRoute: string,
): string | null {
	const closingIndex = tabs.findIndex((tab) => tab.key === closingKey);
	if (closingIndex < 0) return null;

	const remainingTabs = tabs.filter((tab) => tab.key !== closingKey);
	if (remainingTabs.length === 0) {
		return lastDurableRoute;
	}

	const fallbackIndex = Math.max(0, closingIndex - 1);
	return remainingTabs[fallbackIndex]?.currentPath ?? lastDurableRoute;
}

function updateWorkspaceTabMetadata(
	tabs: readonly WorkspaceTab[],
	key: string,
	metadata: WorkspaceTabMetadata,
): readonly WorkspaceTab[] {
	const existingIndex = tabs.findIndex((tab) => tab.key === key);
	if (existingIndex < 0) {
		return tabs;
	}

	const existingTab = tabs[existingIndex]!;
	const nextTab: WorkspaceTab = {
		...existingTab,
		title: metadata.title,
		subtitle: metadata.subtitle,
		projectId: metadata.projectId,
	};

	if (
		existingTab.title === nextTab.title &&
		existingTab.subtitle === nextTab.subtitle &&
		existingTab.projectId === nextTab.projectId
	) {
		return tabs;
	}

	const nextTabs = [...tabs];
	nextTabs[existingIndex] = nextTab;
	return nextTabs;
}

export function WorkspaceTabsProvider({
	children,
}: {
	readonly children: ReactNode;
}) {
	const [state, setState] = useState<WorkspaceTabsState>(() =>
		loadWorkspaceTabsState(),
	);
	const stateRef = useRef(state);
	const channelRef = useRef<BroadcastChannel | null>(null);
	const location = useLocation();
	const navigate = useNavigate();

	useEffect(() => {
		stateRef.current = state;
	}, [state]);

	useEffect(() => {
		if (typeof window === "undefined") return;
		localStorage.setItem(WORKSPACE_TABS_STORAGE_KEY, JSON.stringify(state));
		channelRef.current?.postMessage(state.tabs);
	}, [state]);

	useEffect(() => {
		if (typeof BroadcastChannel === "undefined") return;

		const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
		channelRef.current = channel;

		channel.onmessage = (event: MessageEvent) => {
			if (!Array.isArray(event.data)) return;
			const remoteTabs = dedupeTabs(
				(event.data as unknown[]).map(sanitizeStoredTab).filter(isWorkspaceTab),
			);

			setState((current) => {
				const mergedTabs = dedupeTabs([...remoteTabs, ...current.tabs]);
				if (
					mergedTabs.length === current.tabs.length &&
					mergedTabs.every((tab, i) => tab === current.tabs[i])
				) {
					return current;
				}
				return { ...current, tabs: mergedTabs };
			});
		};

		return () => {
			channel.close();
			channelRef.current = null;
		};
	}, []);

	useEffect(() => {
		if (typeof window === "undefined") return;

		const handleStorage = (event: StorageEvent) => {
			if (event.key !== WORKSPACE_TABS_STORAGE_KEY || !event.newValue) return;

			try {
				const parsed = JSON.parse(event.newValue) as StoredWorkspaceTabsState;
				const remoteTabs = Array.isArray(parsed.tabs)
					? dedupeTabs(
							parsed.tabs.map(sanitizeStoredTab).filter(isWorkspaceTab),
						)
					: [];

				setState((current) => {
					const mergedTabs = dedupeTabs([...remoteTabs, ...current.tabs]);
					if (
						mergedTabs.length === current.tabs.length &&
						mergedTabs.every((tab, i) => tab === current.tabs[i])
					) {
						return current;
					}
					return { ...current, tabs: mergedTabs };
				});
			} catch {
				// Ignore malformed storage events
			}
		};

		window.addEventListener("storage", handleStorage);
		return () => window.removeEventListener("storage", handleStorage);
	}, []);

	useLayoutEffect(() => {
		const currentPath = createCurrentPath(
			location.pathname,
			location.search,
			location.hash,
		);
		const normalized = normalizeWorkspaceRoute(currentPath);

		setState((current) => {
			if (normalized.type === "durable") {
				if (
					current.activeKey === null &&
					current.lastDurableRoute === normalized.rootPath
				) {
					return current;
				}

				return {
					...current,
					activeKey: null,
					lastDurableRoute: normalized.rootPath,
				};
			}

			if (normalized.type !== "workspace") {
				return current.activeKey === null
					? current
					: {
							...current,
							activeKey: null,
						};
			}

			const nextTabs = upsertWorkspaceTab(
				current.tabs,
				normalized,
				currentPath,
				Date.now(),
			);

			if (current.activeKey === normalized.key && nextTabs === current.tabs) {
				return current;
			}

			return {
				...current,
				tabs: nextTabs,
				activeKey: normalized.key,
			};
		});
	}, [location.hash, location.pathname, location.search]);

	const openWorkspace = useCallback(
		(targetRoute: string) => {
			const normalized = normalizeWorkspaceRoute(targetRoute);
			if (normalized.type !== "workspace") {
				navigate(targetRoute);
				return;
			}

			const existingTab = stateRef.current.tabs.find(
				(tab) => tab.key === normalized.key,
			);
			navigate(existingTab?.currentPath ?? targetRoute);
		},
		[navigate],
	);

	const activateWorkspace = useCallback(
		(key: string) => {
			const targetTab = stateRef.current.tabs.find((tab) => tab.key === key);
			if (!targetTab) return;
			navigate(targetTab.currentPath);
		},
		[navigate],
	);

	const closeWorkspace = useCallback(
		(key: string) => {
			const current = stateRef.current;
			const isActive = current.activeKey === key;
			const nextTabs = current.tabs.filter((tab) => tab.key !== key);
			const nextActiveKey = isActive
				? null
				: nextTabs.some((tab) => tab.key === current.activeKey)
					? current.activeKey
					: null;
			const navigationTarget = isActive
				? getCloseNavigationTarget(current.tabs, key, current.lastDurableRoute)
				: null;

			setState({
				tabs: nextTabs,
				activeKey: nextActiveKey,
				lastDurableRoute: current.lastDurableRoute,
			});

			if (navigationTarget) {
				navigate(navigationTarget);
			}
		},
		[navigate],
	);

	const updateWorkspaceMetadata = useCallback(
		(key: string, metadata: WorkspaceTabMetadata) => {
			setState((current) => {
				const nextTabs = updateWorkspaceTabMetadata(
					current.tabs,
					key,
					metadata,
				);
				if (nextTabs === current.tabs) {
					return current;
				}

				return {
					...current,
					tabs: nextTabs,
				};
			});
		},
		[],
	);

	const value = useMemo<WorkspaceTabsContextValue>(
		() => ({
			tabs: state.tabs,
			activeKey: state.activeKey,
			lastDurableRoute: state.lastDurableRoute,
			openWorkspace,
			activateWorkspace,
			closeWorkspace,
			updateWorkspaceMetadata,
		}),
		[
			state,
			openWorkspace,
			activateWorkspace,
			closeWorkspace,
			updateWorkspaceMetadata,
		],
	);

	return (
		<WorkspaceTabsContext.Provider value={value}>
			{children}
		</WorkspaceTabsContext.Provider>
	);
}

export function useWorkspaceTabs(): WorkspaceTabsContextValue {
	const context = useContext(WorkspaceTabsContext);
	if (!context) {
		throw new Error(
			"useWorkspaceTabs must be used within a WorkspaceTabsProvider",
		);
	}
	return context;
}
