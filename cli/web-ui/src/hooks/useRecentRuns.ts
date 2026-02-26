import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "rp1-recent-runs";
const MAX_ITEMS = 5;

export interface RecentRun {
	id: string;
	projectName: string;
	featureName: string;
	timestamp: number;
}

type Listener = () => void;

const listeners = new Set<Listener>();
let cachedRaw: string | null = null;
let cachedParsed: readonly RecentRun[] = [];
const EMPTY: readonly RecentRun[] = [];

function emitChange() {
	cachedRaw = null;
	for (const listener of listeners) {
		listener();
	}
}

function subscribe(listener: Listener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function getSnapshot(): readonly RecentRun[] {
	const raw = localStorage.getItem(STORAGE_KEY);
	if (raw === null) return EMPTY;
	if (raw === cachedRaw) return cachedParsed;
	try {
		cachedRaw = raw;
		cachedParsed = JSON.parse(raw) as RecentRun[];
		return cachedParsed;
	} catch {
		cachedRaw = raw;
		cachedParsed = EMPTY;
		return EMPTY;
	}
}

function readRuns(): RecentRun[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		return JSON.parse(raw) as RecentRun[];
	} catch {
		return [];
	}
}

function writeRuns(runs: RecentRun[]): void {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
	emitChange();
}

export interface UseRecentRunsReturn {
	recentRuns: readonly RecentRun[];
	trackVisit: (run: Omit<RecentRun, "timestamp">) => void;
	clearRecents: () => void;
}

export function useRecentRuns(): UseRecentRunsReturn {
	const recentRuns = useSyncExternalStore(subscribe, getSnapshot);

	const trackVisit = useCallback((run: Omit<RecentRun, "timestamp">) => {
		const current = readRuns();
		const filtered = current.filter((r) => r.id !== run.id);
		const entry: RecentRun = { ...run, timestamp: Date.now() };
		const updated = [entry, ...filtered].slice(0, MAX_ITEMS);
		writeRuns(updated);
	}, []);

	const clearRecents = useCallback(() => {
		localStorage.removeItem(STORAGE_KEY);
		emitChange();
	}, []);

	return { recentRuns, trackVisit, clearRecents };
}
