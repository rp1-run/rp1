import { useMemo } from "react";

export interface PlatformInfo {
	readonly isMac: boolean;
	readonly modLabel: string;
	readonly modKey: "metaKey" | "ctrlKey";
}

function detectMac(): boolean {
	if (typeof navigator === "undefined") return false;

	if (navigator.platform) {
		return navigator.platform.toLowerCase().includes("mac");
	}

	return navigator.userAgent.toLowerCase().includes("mac");
}

export function usePlatform(): PlatformInfo {
	return useMemo<PlatformInfo>(() => {
		const isMac = detectMac();
		return {
			isMac,
			modLabel: isMac ? "Cmd" : "Ctrl",
			modKey: isMac ? "metaKey" : "ctrlKey",
		};
	}, []);
}
