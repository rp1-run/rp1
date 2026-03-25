/**
 * Codex notification handler.
 * Codex invokes this command through config.toml `notify` integration so rp1 can
 * surface startup notices like Arcade availability and rp1 updates.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getWritableRoots } from "../../install/codex/config.js";

const DEFAULT_TIMEOUT_MS = 8000;
const ARCADE_URL = "http://localhost:7710";
const STATE_FILE = join(getWritableRoots()[0], "codex-notify-state.json");
const MAX_RECORDS = 200;

type NoticeKind = "arcade" | "update";

interface CodexNotifyPayload {
	readonly cwd: string | null;
	readonly threadId: string | null;
	readonly turnId: string | null;
	readonly type: string | null;
}

interface Notice {
	readonly kind: NoticeKind;
	readonly message: string;
	readonly fingerprint: string;
}

interface NoticeRecord {
	readonly fingerprint: string;
	readonly updatedAt: string;
	readonly cwd: string | null;
	readonly threadId: string | null;
	readonly turnId: string | null;
}

interface NotifyState {
	readonly records: Record<string, NoticeRecord>;
}

const EMPTY_STATE: NotifyState = { records: {} };

const getString = (
	value: Record<string, unknown>,
	...keys: readonly string[]
): string | null => {
	for (const key of keys) {
		const candidate = value[key];
		if (typeof candidate === "string" && candidate.trim().length > 0) {
			return candidate;
		}
	}
	return null;
};

const parsePayload = (input: string): CodexNotifyPayload => {
	if (input.trim().length === 0) {
		return { cwd: null, threadId: null, turnId: null, type: null };
	}

	try {
		const parsed = JSON.parse(input) as unknown;
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			Array.isArray(parsed)
		) {
			return { cwd: null, threadId: null, turnId: null, type: null };
		}

		const payload = parsed as Record<string, unknown>;
		return {
			cwd: getString(payload, "cwd", "workspace", "working-directory"),
			threadId: getString(
				payload,
				"thread-id",
				"thread_id",
				"threadId",
				"conversation_id",
			),
			turnId: getString(payload, "turn-id", "turn_id", "turnId"),
			type: getString(payload, "type", "event", "notification"),
		};
	} catch {
		return { cwd: null, threadId: null, turnId: null, type: null };
	}
};

const deriveScopeKey = (payload: CodexNotifyPayload): string => {
	if (payload.threadId && payload.cwd) {
		return `thread:${payload.threadId}|cwd:${payload.cwd}`;
	}
	if (payload.cwd) {
		return `cwd:${payload.cwd}`;
	}
	if (payload.threadId) {
		return `thread:${payload.threadId}`;
	}
	if (payload.type) {
		return `type:${payload.type}`;
	}
	return "global";
};

const fingerprint = (...parts: readonly string[]): string =>
	createHash("sha256").update(parts.join("\u0000")).digest("hex");

const loadState = async (): Promise<NotifyState> => {
	try {
		const content = await readFile(STATE_FILE, "utf-8");
		const parsed = JSON.parse(content) as NotifyState;
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			typeof parsed.records === "object" &&
			parsed.records !== null
		) {
			return parsed;
		}
		return EMPTY_STATE;
	} catch {
		return EMPTY_STATE;
	}
};

const saveState = async (state: NotifyState): Promise<void> => {
	const entries = Object.entries(state.records)
		.sort((a, b) => b[1].updatedAt.localeCompare(a[1].updatedAt))
		.slice(0, MAX_RECORDS);
	const nextState: NotifyState = { records: Object.fromEntries(entries) };

	await mkdir(dirname(STATE_FILE), { recursive: true });
	await writeFile(`${STATE_FILE}.tmp`, JSON.stringify(nextState, null, 2));
	await writeFile(STATE_FILE, JSON.stringify(nextState, null, 2));
};

const runRp1 = async (
	args: readonly string[],
	timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ exitCode: number; stdout: string; stderr: string }> => {
	const rp1Binary = process.env.RP1_BINARY || "rp1";
	const proc = Bun.spawn([rp1Binary, ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});

	const timeout = setTimeout(() => {
		try {
			proc.kill();
		} catch {
			// best effort
		}
	}, timeoutMs);

	try {
		const [exitCode, stdout, stderr] = await Promise.all([
			proc.exited,
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);
		return { exitCode, stdout, stderr };
	} finally {
		clearTimeout(timeout);
	}
};

const buildArcadeNotice = async (): Promise<Notice | null> => {
	const result = await runRp1(["arcade", "--no-open"], 5000);
	if (result.exitCode !== 0) {
		return null;
	}

	return {
		kind: "arcade",
		message: `rp1 Arcade is live at ${ARCADE_URL}`,
		fingerprint: fingerprint("arcade", ARCADE_URL),
	};
};

const buildUpdateNotice = async (): Promise<Notice | null> => {
	const result = await runRp1(["update", "--check", "--json"]);
	if (result.exitCode !== 0) {
		return null;
	}

	try {
		const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
		if (parsed.update_available !== true) {
			return null;
		}

		const currentVersion =
			typeof parsed.current_version === "string"
				? parsed.current_version
				: null;
		const latestVersion =
			typeof parsed.latest_version === "string" ? parsed.latest_version : null;
		if (!currentVersion || !latestVersion) {
			return null;
		}

		return {
			kind: "update",
			message: `rp1 update available: v${currentVersion} -> v${latestVersion}  |  Run /self-update`,
			fingerprint: fingerprint("update", currentVersion, latestVersion),
		};
	} catch {
		return null;
	}
};

const filterNewNotices = (
	scopeKey: string,
	payload: CodexNotifyPayload,
	notices: readonly Notice[],
	state: NotifyState,
): readonly Notice[] =>
	notices.filter((notice) => {
		const record = state.records[`${scopeKey}:${notice.kind}`];
		if (!record) {
			return true;
		}
		if (record.fingerprint !== notice.fingerprint) {
			return true;
		}
		if (payload.turnId && record.turnId !== payload.turnId) {
			return false;
		}
		return false;
	});

const updateState = (
	scopeKey: string,
	payload: CodexNotifyPayload,
	notices: readonly Notice[],
	state: NotifyState,
): NotifyState => {
	const nextRecords = { ...state.records };
	const timestamp = new Date().toISOString();

	for (const notice of notices) {
		nextRecords[`${scopeKey}:${notice.kind}`] = {
			fingerprint: notice.fingerprint,
			updatedAt: timestamp,
			cwd: payload.cwd,
			threadId: payload.threadId,
			turnId: payload.turnId,
		};
	}

	return { records: nextRecords };
};

export const executeCodexNotify = async (input: string): Promise<string> => {
	const payload = parsePayload(input);
	const scopeKey = deriveScopeKey(payload);
	const state = await loadState();
	const candidateNotices = (
		await Promise.all([buildArcadeNotice(), buildUpdateNotice()])
	).filter((notice): notice is Notice => notice !== null);

	const notices = filterNewNotices(scopeKey, payload, candidateNotices, state);
	if (notices.length === 0) {
		return "";
	}

	await saveState(updateState(scopeKey, payload, notices, state));
	return notices.map((notice) => notice.message).join("\n");
};
