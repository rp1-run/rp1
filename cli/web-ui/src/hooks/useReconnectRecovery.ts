import { useEffect, useRef } from "react";
import { useRuntimeContract } from "@/providers/RuntimeProvider";
import { useWebSocket } from "@/providers/WebSocketProvider";

export function useReconnectRecovery(
	recover: () => void | Promise<void>,
): void {
	const { reconnectPolicy } = useRuntimeContract();
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
		}, reconnectPolicy.disconnectedRecoveryIntervalMs);

		return () => {
			clearInterval(intervalId);
		};
	}, [status, reconnectPolicy.disconnectedRecoveryIntervalMs]);
}
