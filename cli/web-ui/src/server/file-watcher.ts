import { join, relative } from "node:path";
import chokidar from "chokidar";
import type { WebSocketHub } from "./websocket";

type ChangeType = "modify" | "add" | "delete";

interface PendingChange {
	path: string;
	type: ChangeType;
	timestamp: number;
}

interface BurstState {
	mode: "normal" | "burst";
	changeTimestamps: number[];
	stabilizeTimer: ReturnType<typeof setTimeout> | null;
}

const IGNORED_PATTERNS = [
	/\.swp$/,
	/\.swo$/,
	/~$/,
	/^\.DS_Store$/,
	/^\.git/,
	/^node_modules/,
	/\.tmp$/,
	/^#.*#$/,
];

function shouldIgnore(filename: string): boolean {
	return IGNORED_PATTERNS.some((pattern) => pattern.test(filename));
}

const MAX_WATCHERS = 10;
const GRACE_PERIOD_MS = 30_000;

const BURST_THRESHOLD = 10;
const BURST_WINDOW_MS = 500;
const BURST_STABILIZE_MS = 300;

export class FileWatcher {
	private watchers: chokidar.FSWatcher[] = [];
	private hub: WebSocketHub;
	private rp1Path: string;
	private pendingChanges: Map<string, PendingChange> = new Map();
	private debounceTimeout: ReturnType<typeof setTimeout> | null = null;
	private debounceMs: number;
	private burstState: BurstState = {
		mode: "normal",
		changeTimestamps: [],
		stabilizeTimer: null,
	};
	readonly projectId: string;
	readonly projectPath: string;

	constructor(
		projectId: string,
		projectPath: string,
		hub: WebSocketHub,
		options: { debounceMs?: number } = {},
	) {
		this.projectId = projectId;
		this.projectPath = projectPath;
		this.rp1Path = join(projectPath, ".rp1");
		this.hub = hub;
		this.debounceMs = options.debounceMs ?? 100;
	}

	start(): void {
		const workPath = join(this.rp1Path, "work");
		const contextPath = join(this.rp1Path, "context");

		this.watchDirectory(workPath, "work");
		this.watchDirectory(contextPath, "context");

		console.log(`File watcher started for ${this.rp1Path}`);
	}

	private watchDirectory(dirPath: string, section: string): void {
		try {
			const watcher = chokidar.watch(dirPath, {
				persistent: true,
				ignoreInitial: true,
				awaitWriteFinish: {
					stabilityThreshold: 50,
					pollInterval: 10,
				},
				ignored: IGNORED_PATTERNS,
				depth: 10,
			});

			watcher
				.on("add", (fullPath) => this.handleEvent(fullPath, section, "add"))
				.on("change", (fullPath) =>
					this.handleEvent(fullPath, section, "modify"),
				)
				.on("unlink", (fullPath) =>
					this.handleEvent(fullPath, section, "delete"),
				)
				.on("error", (error) => this.handleWatcherError(error));

			this.watchers.push(watcher);
		} catch (error) {
			console.warn(`Could not watch directory ${dirPath}:`, error);
		}
	}

	private handleEvent(
		fullPath: string,
		section: string,
		type: ChangeType,
	): void {
		try {
			const filename = relative(join(this.rp1Path, section), fullPath);
			if (!filename || shouldIgnore(filename)) return;

			const relativePath = `${section}/${filename}`;
			this.queueChange(relativePath, type);
		} catch (error) {
			console.warn(
				`[${this.projectId}] Error handling ${type} event for ${fullPath}:`,
				error,
			);
		}
	}

	private handleWatcherError(error: Error): void {
		console.error(`[${this.projectId}] Watcher error:`, error);
	}

	private queueChange(path: string, type: ChangeType): void {
		if (this.checkBurstMode()) {
			return;
		}

		const existing = this.pendingChanges.get(path);
		const now = Date.now();

		if (existing) {
			if (type === "delete" || existing.type === "add") {
				this.pendingChanges.set(path, { path, type, timestamp: now });
			}
		} else {
			this.pendingChanges.set(path, { path, type, timestamp: now });
		}

		this.scheduleFlush();
	}

	private checkBurstMode(): boolean {
		const now = Date.now();
		this.burstState.changeTimestamps = this.burstState.changeTimestamps.filter(
			(t) => now - t < BURST_WINDOW_MS,
		);

		this.burstState.changeTimestamps.push(now);

		if (
			this.burstState.changeTimestamps.length > BURST_THRESHOLD &&
			this.burstState.mode === "normal"
		) {
			this.enterBurstMode();
			return true;
		}

		if (this.burstState.mode === "burst") {
			this.resetBurstStabilizeTimer();
			return true;
		}

		return false;
	}

	private enterBurstMode(): void {
		this.burstState.mode = "burst";
		// Clear pending individual changes - they'll be replaced by tree refresh
		this.pendingChanges.clear();
		if (this.debounceTimeout) {
			clearTimeout(this.debounceTimeout);
			this.debounceTimeout = null;
		}
		console.log(`[${this.projectId}] Burst mode activated`);

		this.resetBurstStabilizeTimer();
	}

	private resetBurstStabilizeTimer(): void {
		if (this.burstState.stabilizeTimer) {
			clearTimeout(this.burstState.stabilizeTimer);
		}

		this.burstState.stabilizeTimer = setTimeout(() => {
			this.exitBurstMode();
		}, BURST_STABILIZE_MS);
	}

	private exitBurstMode(): void {
		this.burstState.mode = "normal";
		this.burstState.changeTimestamps = [];
		this.burstState.stabilizeTimer = null;

		// Emit single tree refresh instead of individual file changes
		this.pendingChanges.clear();
		this.hub.broadcastTreeChange(this.projectId);
		console.log(`[${this.projectId}] Burst mode exited, tree refresh emitted`);
	}

	private scheduleFlush(): void {
		if (this.debounceTimeout) {
			clearTimeout(this.debounceTimeout);
		}

		this.debounceTimeout = setTimeout(() => {
			this.flushChanges();
		}, this.debounceMs);
	}

	private flushChanges(): void {
		if (this.pendingChanges.size === 0) return;

		const changes = Array.from(this.pendingChanges.values());
		this.pendingChanges.clear();

		try {
			const hasStructuralChange = changes.some(
				(c) => c.type === "add" || c.type === "delete",
			);

			for (const change of changes) {
				this.hub.broadcastFileChange(this.projectId, change.path, change.type);
			}

			if (hasStructuralChange) {
				this.hub.broadcastTreeChange(this.projectId);
			}

			console.log(
				`[${this.projectId}] Notified ${changes.length} file change(s):`,
				changes.map((c) => `${c.type}:${c.path}`).join(", "),
			);
		} catch (error) {
			console.error(`[${this.projectId}] Error broadcasting changes:`, error);
		}
	}

	stop(): void {
		if (this.debounceTimeout) {
			clearTimeout(this.debounceTimeout);
			this.debounceTimeout = null;
		}

		if (this.burstState.stabilizeTimer) {
			clearTimeout(this.burstState.stabilizeTimer);
			this.burstState.stabilizeTimer = null;
		}
		this.burstState.mode = "normal";
		this.burstState.changeTimestamps = [];

		for (const watcher of this.watchers) {
			watcher.close().catch(() => {});
		}

		this.watchers = [];
		this.pendingChanges.clear();
		console.log(`[${this.projectId}] File watcher stopped`);
	}
}

interface PooledWatcher {
	watcher: FileWatcher;
	clientCount: number;
	lastAccessedAt: number;
	gracePeriodTimer: ReturnType<typeof setTimeout> | null;
}

export class FileWatcherPool {
	private watchers: Map<string, PooledWatcher> = new Map();
	private hub: WebSocketHub;

	constructor(hub: WebSocketHub) {
		this.hub = hub;
	}

	acquireWatcher(projectId: string, projectPath: string): FileWatcher {
		const existing = this.watchers.get(projectId);

		if (existing) {
			if (existing.gracePeriodTimer) {
				clearTimeout(existing.gracePeriodTimer);
				existing.gracePeriodTimer = null;
			}
			existing.clientCount++;
			existing.lastAccessedAt = Date.now();
			console.log(
				`[${projectId}] Watcher acquired, client count: ${existing.clientCount}`,
			);
			return existing.watcher;
		}

		this.evictIfNeeded();

		const watcher = new FileWatcher(projectId, projectPath, this.hub);
		watcher.start();

		this.watchers.set(projectId, {
			watcher,
			clientCount: 1,
			lastAccessedAt: Date.now(),
			gracePeriodTimer: null,
		});

		console.log(
			`[${projectId}] Watcher created, total watchers: ${this.watchers.size}`,
		);
		return watcher;
	}

	releaseWatcher(projectId: string): void {
		const pooled = this.watchers.get(projectId);
		if (!pooled) return;

		pooled.clientCount--;
		console.log(
			`[${projectId}] Watcher released, client count: ${pooled.clientCount}`,
		);

		if (pooled.clientCount <= 0) {
			pooled.gracePeriodTimer = setTimeout(() => {
				const current = this.watchers.get(projectId);
				if (current && current.clientCount <= 0) {
					current.watcher.stop();
					this.watchers.delete(projectId);
					console.log(
						`[${projectId}] Watcher stopped after grace period, total watchers: ${this.watchers.size}`,
					);
				}
			}, GRACE_PERIOD_MS);
		}
	}

	private evictIfNeeded(): void {
		if (this.watchers.size < MAX_WATCHERS) return;

		let oldestKey: string | null = null;
		let oldestTime = Infinity;

		for (const [key, pooled] of this.watchers.entries()) {
			if (pooled.clientCount === 0 && pooled.lastAccessedAt < oldestTime) {
				oldestTime = pooled.lastAccessedAt;
				oldestKey = key;
			}
		}

		if (!oldestKey) {
			for (const [key, pooled] of this.watchers.entries()) {
				if (pooled.lastAccessedAt < oldestTime) {
					oldestTime = pooled.lastAccessedAt;
					oldestKey = key;
				}
			}
		}

		if (oldestKey) {
			const pooled = this.watchers.get(oldestKey);
			if (pooled) {
				if (pooled.gracePeriodTimer) {
					clearTimeout(pooled.gracePeriodTimer);
				}
				pooled.watcher.stop();
				this.watchers.delete(oldestKey);
				console.log(
					`[${oldestKey}] Watcher evicted (LRU), total watchers: ${this.watchers.size}`,
				);
			}
		}
	}

	getWatcher(projectId: string): FileWatcher | undefined {
		return this.watchers.get(projectId)?.watcher;
	}

	hasWatcher(projectId: string): boolean {
		return this.watchers.has(projectId);
	}

	get watcherCount(): number {
		return this.watchers.size;
	}

	stop(): void {
		for (const [_projectId, pooled] of this.watchers.entries()) {
			if (pooled.gracePeriodTimer) {
				clearTimeout(pooled.gracePeriodTimer);
			}
			pooled.watcher.stop();
		}
		this.watchers.clear();
		console.log("FileWatcherPool stopped, all watchers cleared");
	}
}
