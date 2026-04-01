import { useEffect } from "react";
import { useWebSocket } from "@/providers/WebSocketProvider";

export function useReconnectRecovery(
	recover: () => void | Promise<void>,
): void {
	const { subscribeToReconnect } = useWebSocket();

	useEffect(() => {
		return subscribeToReconnect(() => {
			void recover();
		});
	}, [recover, subscribeToReconnect]);
}
