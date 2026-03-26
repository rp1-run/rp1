import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "rp1-recent-runs";
const MAX_ITEMS = 5;

export interface RecentRun {
	id: string;
	projectName: string;
	featureName: string;
	featureId?: string;
	name?: string | null;
	timestamp: number;
}

type Listener = () => void;

const listeners = new Set<Listener>();
let cachedRaw: string | null = null;
let cachedParsed: readonly RecentRun[] = [];
const EMPTY: readonly RecentRun[] = [];

function normalizeRecentRun(value: unknown): RecentRun | null {
	if (typeof value !== "object" || value === null) {
		return null;
	}

	const candidate = value as Record<string, unknown>;
	if (
		typeof candidate.id !== "string" ||
		typeof candidate.projectName !== "string" ||
		typeof candidate.featureName !== "string" ||
		typeof candidate.timestamp !== "number"
	) {
		return null;
	}

	return {
		id: candidate.id,
		projectName: candidate.projectName,
		featureName: candidate.featureName,
		featureId:
			typeof candidate.featureId === "string" ? candidate.featureId : undefined,
		name: typeof candidate.name === "string" ? candidate.name : null,
		timestamp: candidate.timestamp,
	};
}

function parseRuns(raw: string): readonly RecentRun[] {
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) {
			return EMPTY;
		}
		return parsed
			.map((item) => normalizeRecentRun(item))
			.filter((item): item is RecentRun => item !== null);
	} catch {
		return EMPTY;
	}
}

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
	cachedRaw = raw;
	cachedParsed = parseRuns(raw);
	return cachedParsed;
}

function readRuns(): RecentRun[] {
	const raw = localStorage.getItem(STORAGE_KEY);
	if (!raw) return [];
	return [...parseRuns(raw)];
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
