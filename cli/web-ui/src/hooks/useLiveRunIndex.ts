import { useEffect, useSyncExternalStore } from "react";
import { type LiveRunIndexState, liveRunIndex } from "@/lib/live-run-index";
import { useWebSocket } from "@/providers/WebSocketProvider";

const getSnapshot = (): LiveRunIndexState => liveRunIndex.getSnapshot();

export function useLiveRunIndexBridge(): void {
	const { onEventNotification, onStateSnapshot, projectId } = useWebSocket();

	useEffect(() => {
		const unsubscribeEvent = onEventNotification((message) => {
			void liveRunIndex.applyEvent(message);
		});
		const unsubscribeSnapshot = onStateSnapshot((message) => {
			if (message.scope === "global") {
				liveRunIndex.applyGlobalSnapshot(message);
				return;
			}

			const snapshotProjectId = message.projectId ?? projectId;
			if (snapshotProjectId) {
				liveRunIndex.applySnapshot(snapshotProjectId, message);
			}
		});

		return () => {
			unsubscribeEvent();
			unsubscribeSnapshot();
		};
	}, [onEventNotification, onStateSnapshot, projectId]);
}

export function useLiveRunIndexSnapshot(): LiveRunIndexState {
	return useSyncExternalStore(liveRunIndex.subscribe, getSnapshot, getSnapshot);
}
