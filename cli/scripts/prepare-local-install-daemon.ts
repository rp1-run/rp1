/**
 * Prepare daemon state before a local install replaces the rp1 binary.
 *
 * This script runs via `bun run` from the Justfile's clean-web-ui-cache recipe,
 * using the shared daemon manager contract instead of raw PID-file parsing,
 * curl, and kill commands.
 *
 * Behavior:
 *   - If a daemon is running, stops it through the lifecycle manager and writes
 *     the prior port to the restart marker so the post-install step can restore
 *     Arcade on the same port with the newly built binary.
 *   - If no daemon is running, removes any stale restart marker so the
 *     post-install step does not start a surprise background daemon.
 *
 * Exit codes:
 *   0 - success (daemon stopped or no daemon was running)
 *   1 - unexpected error during preparation
 */

import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import {
	ensureConfigDir,
	getRestartMarkerPath,
} from "../web-ui/src/daemon/config-dir";
import { getStatus, stopDaemon } from "../web-ui/src/daemon/manager";

const DEFAULT_PORT = 7710;

async function main(): Promise<void> {
	await ensureConfigDir();

	const markerPath = getRestartMarkerPath();

	// Detect whether a daemon is currently serving.
	const status = await getStatus(DEFAULT_PORT);

	if (status.running) {
		const port = status.port ?? DEFAULT_PORT;
		console.error(
			`Stopping production daemon on port ${port} before install...`,
		);

		const result = await stopDaemon(port);

		if (result.action === "stopped") {
			// Record the port so the post-install step can restore Arcade.
			writeFileSync(markerPath, String(port), { mode: 0o600 });
			console.error(`Daemon stopped. Restart marker written (port ${port}).`);
		} else {
			// stopDaemon returned not_running despite getStatus saying running.
			// Race condition — another process may have stopped it. Clear marker.
			removeMarker(markerPath);
			console.error("Daemon was no longer running when stop was attempted.");
		}
	} else {
		// No daemon running — remove any stale marker from a prior interrupted install.
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
