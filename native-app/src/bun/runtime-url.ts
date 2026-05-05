import type { ArcadeHostMode } from "../../../cli/web-ui/src/types/runtime";

export interface ArcadeRuntimeQueryMetadata {
	readonly hostMode: ArcadeHostMode;
	readonly cacheBust: string;
}

export const createNativeArcadeCacheBust = (
	now: Date = new Date(),
): string => `native-${now.getTime().toString(36)}`;

export const appendArcadeRuntimeQuery = (
	url: string,
	metadata: ArcadeRuntimeQueryMetadata,
): string => {
	const parsed = new URL(url);
	parsed.searchParams.set("hostMode", metadata.hostMode);
	parsed.searchParams.set("cacheBust", metadata.cacheBust);
	return parsed.toString();
};
