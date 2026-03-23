/**
 * Daemon notification helper for feedback operations.
 * Sends best-effort notifications to the Web UI daemon for real-time updates.
 */

/**
 * Notify the daemon of a feedback mutation for immediate WebSocket broadcast.
 * Best-effort: failures are silently swallowed.
 */
export const notifyDaemon = async (
	eventType: string,
	data: Record<string, unknown>,
): Promise<void> => {
	try {
		const { connectToDaemon, notifyEvent } = await import(
			"../../../web-ui/src/daemon/index.js"
		);

		const conn = await connectToDaemon();
		if (conn) {
			await notifyEvent(conn, {
				eventType,
				eventId: 0,
				runId: (data.runId as string) ?? "unknown",
				projectPath: (data.projectPath as string) ?? "unknown",
				featureId: (data.featureId as string) ?? "unknown",
				step: null,
				data,
				createdAt: new Date().toISOString(),
			});
		}
	} catch {
		// Daemon not available - polling will pick up the change
	}
};
