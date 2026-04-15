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
			if (!projectId) {
				return;
			}
			liveRunIndex.applySnapshot(projectId, message);
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
