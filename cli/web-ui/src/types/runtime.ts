export const ARCADE_RUNTIME_SCHEMA_VERSION = 1;
export const ARCADE_RUNTIME_MANIFEST_FILENAME = "rp1-runtime-manifest.json";

export const VALID_ARCADE_HOST_MODES = ["browser", "native"] as const;

export type ArcadeHostMode = (typeof VALID_ARCADE_HOST_MODES)[number];

export interface ArcadeReconnectPolicy {
	readonly initialDelayMs: number;
	readonly maxDelayMs: number;
	readonly backoffFactor: number;
	readonly heartbeatIntervalMs: number;
	readonly heartbeatMissThreshold: number;
	readonly disconnectedRecoveryIntervalMs: number;
	readonly activityRecoveryLimit: number;
}

export interface ArcadeRuntimeManifest {
	readonly version: string;
	readonly gitCommit: string;
	readonly buildTime: string;
	readonly buildId: string;
}

export interface ArcadeRuntimeContract {
	readonly schemaVersion: typeof ARCADE_RUNTIME_SCHEMA_VERSION;
	readonly baseUrl: string;
	readonly hostMode: ArcadeHostMode;
	readonly version: string;
	readonly buildId: string;
	readonly cacheBust: string;
	readonly reconnectPolicy: ArcadeReconnectPolicy;
}

export const DEFAULT_ARCADE_RECONNECT_POLICY: ArcadeReconnectPolicy = {
	initialDelayMs: 2000,
	maxDelayMs: 30_000,
	backoffFactor: 2,
	heartbeatIntervalMs: 30_000,
	heartbeatMissThreshold: 3,
	disconnectedRecoveryIntervalMs: 5000,
	activityRecoveryLimit: 25,
};

export function isArcadeHostMode(value: string): value is ArcadeHostMode {
	return (VALID_ARCADE_HOST_MODES as readonly string[]).includes(value);
}
