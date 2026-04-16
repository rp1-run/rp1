/**
 * Prepare daemon state before a local install replaces the rp1 binary.
 *
 * This script runs via `bun run` from the Justfile's clean-web-ui-cache recipe,
 * using the shared daemon manager contract instead of raw PID-file parsing,
 * curl, and kill commands.
 *
 * Behavior:
 *   - Calls stopDaemon() (which acquires the lifecycle lock internally) to
 *     cleanly shut down any running daemon.
 *   - If the daemon was stopped, writes the prior port to the restart marker
 *     so the post-install step can restore Arcade on the same port.
 *   - If no daemon was running, removes any stale restart marker so the
 *     post-install step does not start a surprise background daemon.
 *
 * Exit codes:
 *   0 - success (daemon stopped or no daemon was running)
 *   1 - unexpected error during preparation
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import {
	ensureConfigDir,
	getPidFilePath,
	getRestartMarkerPath,
} from "../web-ui/src/daemon/config-dir";
import { stopDaemon } from "../web-ui/src/daemon/manager";

const DEFAULT_PORT = 7710;

async function main(): Promise<void> {
	await ensureConfigDir();

	const markerPath = getRestartMarkerPath();

	// Read the port from the PID file before stopping so we know which port
	// to restore after install.  This read is unlocked — the subsequent
	// stopDaemon() call re-checks under the lifecycle lock.
	let port = DEFAULT_PORT;
	try {
		const pidContent = readFileSync(getPidFilePath(), "utf-8");
		const parsed = Number.parseInt(pidContent.trim().split("\n")[0], 10);
		if (!Number.isNaN(parsed)) port = parsed;
	} catch {
		// No PID file or unreadable — use default port.
	}

	// stopDaemon() acquires the lifecycle lock internally, so the entire
	// probe-and-stop sequence is atomic with respect to other callers.
	const result = await stopDaemon(port);

	if (result.action === "stopped") {
		writeFileSync(markerPath, String(port), { mode: 0o600 });
		console.error(`Daemon stopped. Restart marker written (port ${port}).`);
	} else {
		removeMarker(markerPath);
		console.error("No daemon running. Stale marker cleared.");
	}
}

function removeMarker(path: string): void {
	try {
		if (existsSync(path)) {
			unlinkSync(path);
		}
	} catch {
		// Best-effort cleanup.
	}
}

main().catch((err) => {
	console.error("prepare-local-install-daemon failed:", err);
	process.exit(1);
});
