import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "rp1-pinned-projects";

type Listener = () => void;

const listeners = new Set<Listener>();
let cachedRaw: string | null = null;
let cachedParsed: readonly string[] = [];
const EMPTY: readonly string[] = [];

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

function getSnapshot(): readonly string[] {
	const raw = localStorage.getItem(STORAGE_KEY);
	if (raw === null) return EMPTY;
	if (raw === cachedRaw) return cachedParsed;
	try {
		cachedRaw = raw;
		cachedParsed = JSON.parse(raw) as string[];
		return cachedParsed;
	} catch {
		cachedRaw = raw;
		cachedParsed = EMPTY;
		return EMPTY;
	}
}

function readPins(): string[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		return JSON.parse(raw) as string[];
	} catch {
		return [];
	}
}

function writePins(pins: string[]): void {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
	emitChange();
}

export interface UsePinnedProjectsReturn {
	pinnedProjects: readonly string[];
	togglePin: (projectId: string) => void;
	isPinned: (projectId: string) => boolean;
	clearPins: () => void;
}

export function usePinnedProjects(): UsePinnedProjectsReturn {
	const pinnedProjects = useSyncExternalStore(subscribe, getSnapshot);

	const togglePin = useCallback((projectId: string) => {
		const current = readPins();
		const index = current.indexOf(projectId);
		if (index >= 0) {
			current.splice(index, 1);
		} else {
			current.push(projectId);
		}
		writePins(current);
	}, []);

	const isPinned = useCallback(
		(projectId: string) => {
			return pinnedProjects.includes(projectId);
		},
		[pinnedProjects],
	);

	const clearPins = useCallback(() => {
		localStorage.removeItem(STORAGE_KEY);
		emitChange();
	}, []);

	return { pinnedProjects, togglePin, isPinned, clearPins };
}
