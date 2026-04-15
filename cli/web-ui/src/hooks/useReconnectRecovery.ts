import { useEffect, useRef } from "react";
import { useWebSocket } from "@/providers/WebSocketProvider";

const POLLING_INTERVAL = 5000;

export function useReconnectRecovery(
	recover: () => void | Promise<void>,
): void {
	const { status, subscribeToReconnect } = useWebSocket();
	const recoverRef = useRef(recover);

	useEffect(() => {
		recoverRef.current = recover;
	}, [recover]);

	useEffect(() => {
		return subscribeToReconnect(() => {
			void recoverRef.current();
		});
	}, [subscribeToReconnect]);

	useEffect(() => {
		if (status !== "disconnected") {
			return;
		}

		const intervalId = setInterval(() => {
			void recoverRef.current();
		}, POLLING_INTERVAL);

		return () => {
			clearInterval(intervalId);
		};
	}, [status]);
}
