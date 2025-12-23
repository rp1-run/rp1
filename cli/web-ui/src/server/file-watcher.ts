import { watch } from "node:fs";
import { join } from "node:path";
import type { WebSocketHub } from "./websocket";

type ChangeType = "modify" | "add" | "delete";

interface PendingChange {
	path: string;
	type: ChangeType;
	timestamp: number;
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

export class FileWatcher {
	private watchers: ReturnType<typeof watch>[] = [];
	private hub: WebSocketHub;
	private rp1Path: string;
	private pendingChanges: Map<string, PendingChange> = new Map();
	private debounceTimeout: ReturnType<typeof setTimeout> | null = null;
	private debounceMs: number;

	constructor(
		projectPath: string,
		hub: WebSocketHub,
		options: { debounceMs?: number } = {},
	) {
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
			const watcher = watch(
				dirPath,
				{ recursive: true },
				(eventType, filename) => {
					if (!filename || shouldIgnore(filename)) return;

					const fullPath = join(dirPath, filename);
					const relativePath = `${section}/${filename}`;
					const changeType = this.determineChangeType(eventType, fullPath);

					this.queueChange(relativePath, changeType);
				},
			);

			this.watchers.push(watcher);
		} catch (error) {
			console.warn(`Could not watch directory ${dirPath}:`, error);
		}
	}

	private determineChangeType(
		eventType: "rename" | "change",
		_fullPath: string,
	): ChangeType {
		if (eventType === "rename") {
			return "add";
		}
		return "modify";
	}

	private queueChange(path: string, type: ChangeType): void {
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

		const hasStructuralChange = changes.some(
			(c) => c.type === "add" || c.type === "delete",
		);

		for (const change of changes) {
			this.hub.broadcastFileChange(change.path, change.type);
		}

		if (hasStructuralChange) {
			this.hub.broadcastTreeChange();
		}

		console.log(
			`Notified ${changes.length} file change(s):`,
			changes.map((c) => `${c.type}:${c.path}`).join(", "),
		);
	}

	stop(): void {
		if (this.debounceTimeout) {
			clearTimeout(this.debounceTimeout);
			this.debounceTimeout = null;
		}

		for (const watcher of this.watchers) {
			try {
				watcher.close();
			} catch {
				// ignore
			}
		}

		this.watchers = [];
		this.pendingChanges.clear();
		console.log("File watcher stopped");
	}
}
