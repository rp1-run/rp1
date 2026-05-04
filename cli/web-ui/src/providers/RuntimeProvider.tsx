import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import { RuntimeLoadFailure } from "@/components/ErrorBoundary";
import {
	ARCADE_RUNTIME_SCHEMA_VERSION,
	type ArcadeReconnectPolicy,
	type ArcadeRuntimeContract,
	isArcadeHostMode,
} from "@/types/runtime";

declare const __RP1_WEB_UI_BUILD_ID__: string | undefined;
declare const __RP1_WEB_UI_VERSION__: string | undefined;

interface ClientRuntimeBuildMetadata {
	readonly buildId: string | null;
	readonly version: string | null;
}

interface RuntimeProviderProps {
	children: ReactNode;
	runtime?: ArcadeRuntimeContract;
	loadRuntime?: () => Promise<ArcadeRuntimeContract>;
	clientBuildMetadata?: ClientRuntimeBuildMetadata;
	reloadRuntime?: (contract: ArcadeRuntimeContract) => void;
}

interface RuntimeLoadState {
	contract: ArcadeRuntimeContract | null;
	error: string | null;
}

const RuntimeContext = createContext<ArcadeRuntimeContract | null>(null);
const RUNTIME_RELOAD_STORAGE_PREFIX = "rp1:runtime-reload:";

const RUNTIME_QUERY_KEYS = {
	hostMode: ["hostMode", "host-mode"],
	cacheBust: ["cacheBust", "cache-bust"],
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function isRuntimePolicy(value: unknown): value is ArcadeReconnectPolicy {
	if (!isRecord(value)) {
		return false;
	}

	const {
		initialDelayMs,
		maxDelayMs,
		backoffFactor,
		heartbeatIntervalMs,
		heartbeatMissThreshold,
		disconnectedRecoveryIntervalMs,
		activityRecoveryLimit,
	} = value;

	return (
		isFiniteNumber(initialDelayMs) &&
		isFiniteNumber(maxDelayMs) &&
		isFiniteNumber(backoffFactor) &&
		isFiniteNumber(heartbeatIntervalMs) &&
		isFiniteNumber(heartbeatMissThreshold) &&
		isFiniteNumber(disconnectedRecoveryIntervalMs) &&
		isFiniteNumber(activityRecoveryLimit) &&
		initialDelayMs > 0 &&
		maxDelayMs >= initialDelayMs &&
		backoffFactor >= 1 &&
		heartbeatIntervalMs > 0 &&
		heartbeatMissThreshold > 0 &&
		disconnectedRecoveryIntervalMs > 0 &&
		activityRecoveryLimit > 0
	);
}

function readRuntimeQueryValue(
	source: URLSearchParams,
	keys: readonly string[],
): string | null {
	for (const key of keys) {
		const value = source.get(key);
		if (value != null && value.trim().length > 0) {
			return value;
		}
	}
	return null;
}

export function buildRuntimeEndpoint(locationSearch = window.location.search) {
	const source = new URLSearchParams(locationSearch);
	const target = new URLSearchParams();
	const hostMode = readRuntimeQueryValue(source, RUNTIME_QUERY_KEYS.hostMode);
	const cacheBust = readRuntimeQueryValue(source, RUNTIME_QUERY_KEYS.cacheBust);

	if (hostMode != null) {
		target.set("hostMode", hostMode);
	}
	if (cacheBust != null) {
		target.set("cacheBust", cacheBust);
	}

	const queryString = target.toString();
	return `/api/v2/runtime${queryString ? `?${queryString}` : ""}`;
}

function readBuildMetadataValue(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function readClientRuntimeBuildMetadata(): ClientRuntimeBuildMetadata {
	return {
		buildId: readBuildMetadataValue(
			typeof __RP1_WEB_UI_BUILD_ID__ === "string"
				? __RP1_WEB_UI_BUILD_ID__
				: null,
		),
		version: readBuildMetadataValue(
			typeof __RP1_WEB_UI_VERSION__ === "string"
				? __RP1_WEB_UI_VERSION__
				: null,
		),
	};
}

function getRuntimeMismatchMessage(
	contract: ArcadeRuntimeContract,
	clientBuildMetadata: ClientRuntimeBuildMetadata,
): string | null {
	if (contract.buildId === `dev-${contract.version}`) {
		return null;
	}

	if (
		clientBuildMetadata.buildId !== null &&
		clientBuildMetadata.buildId !== contract.buildId
	) {
		return `Arcade runtime build changed from ${clientBuildMetadata.buildId} to ${contract.buildId}.`;
	}

	if (
		clientBuildMetadata.buildId === null &&
		clientBuildMetadata.version !== null &&
		clientBuildMetadata.version !== contract.version
	) {
		return `Arcade runtime version changed from ${clientBuildMetadata.version} to ${contract.version}.`;
	}

	return null;
}

function runtimeReloadAttemptStorageKey(buildId: string): string {
	return `${RUNTIME_RELOAD_STORAGE_PREFIX}${buildId}`;
}

function hasRuntimeReloadAttempt(buildId: string): boolean {
	try {
		return (
			sessionStorage.getItem(runtimeReloadAttemptStorageKey(buildId)) === "1"
		);
	} catch {
		return false;
	}
}

function markRuntimeReloadAttempt(buildId: string): void {
	try {
		sessionStorage.setItem(runtimeReloadAttemptStorageKey(buildId), "1");
	} catch {}
}

function reloadWithRuntimeCacheBust(contract: ArcadeRuntimeContract): void {
	const url = new URL(window.location.href);
	url.searchParams.set("cacheBust", contract.buildId);
	window.location.assign(url.toString());
}

function prepareRuntimeContract(
	contract: ArcadeRuntimeContract,
	clientBuildMetadata: ClientRuntimeBuildMetadata,
	reloadRuntime: (contract: ArcadeRuntimeContract) => void,
): ArcadeRuntimeContract | null {
	const mismatchMessage = getRuntimeMismatchMessage(
		contract,
		clientBuildMetadata,
	);

	if (mismatchMessage === null) {
		return contract;
	}

	if (!hasRuntimeReloadAttempt(contract.buildId)) {
		markRuntimeReloadAttempt(contract.buildId);
		reloadRuntime(contract);
		return null;
	}

	throw new Error(
		`${mismatchMessage} A cache-busted reload did not resolve the mismatch.`,
	);
}

function validateRuntimeContract(value: unknown): ArcadeRuntimeContract {
	if (!isRecord(value)) {
		throw new Error("Arcade runtime contract response is invalid.");
	}

	if (value.schemaVersion !== ARCADE_RUNTIME_SCHEMA_VERSION) {
		throw new Error("Arcade runtime schema version is unsupported.");
	}

	if (typeof value.hostMode !== "string" || !isArcadeHostMode(value.hostMode)) {
		throw new Error(`Unsupported Arcade host mode: ${String(value.hostMode)}`);
	}

	if (
		typeof value.baseUrl !== "string" ||
		typeof value.version !== "string" ||
		typeof value.buildId !== "string" ||
		typeof value.cacheBust !== "string" ||
		!isRuntimePolicy(value.reconnectPolicy)
	) {
		throw new Error("Arcade runtime contract response is incomplete.");
	}

	try {
		new URL(value.baseUrl);
	} catch {
		throw new Error("Arcade runtime base URL is invalid.");
	}

	return value as unknown as ArcadeRuntimeContract;
}

async function readErrorMessage(response: Response): Promise<string> {
	try {
		const payload = (await response.json()) as unknown;
		if (isRecord(payload) && typeof payload.error === "string") {
			return payload.error;
		}
	} catch {}

	return `Arcade runtime request failed with status ${response.status}.`;
}

export async function fetchRuntimeContract(): Promise<ArcadeRuntimeContract> {
	const response = await fetch(buildRuntimeEndpoint(), { cache: "no-store" });

	if (!response.ok) {
		throw new Error(await readErrorMessage(response));
	}

	return validateRuntimeContract((await response.json()) as unknown);
}

export function RuntimeProvider({
	children,
	runtime,
	loadRuntime = fetchRuntimeContract,
	clientBuildMetadata,
	reloadRuntime = reloadWithRuntimeCacheBust,
}: RuntimeProviderProps) {
	const [state, setState] = useState<RuntimeLoadState>(() => ({
		contract: runtime ?? null,
		error: null,
	}));

	useEffect(() => {
		if (runtime) {
			setState({ contract: runtime, error: null });
			return;
		}

		let cancelled = false;
		const buildMetadata =
			clientBuildMetadata ?? readClientRuntimeBuildMetadata();

		loadRuntime()
			.then((contract) => {
				if (!cancelled) {
					const preparedContract = prepareRuntimeContract(
						contract,
						buildMetadata,
						reloadRuntime,
					);
					if (preparedContract !== null) {
						setState({ contract: preparedContract, error: null });
					}
				}
			})
			.catch((error: unknown) => {
				if (!cancelled) {
					setState({
						contract: null,
						error:
							error instanceof Error
								? error.message
								: "Arcade runtime request failed.",
					});
				}
			});

		return () => {
			cancelled = true;
		};
	}, [runtime, loadRuntime, clientBuildMetadata, reloadRuntime]);

	if (state.error) {
		return <RuntimeLoadFailure message={state.error} />;
	}

	if (!state.contract) {
		return null;
	}

	return (
		<RuntimeContext.Provider value={state.contract}>
			{children}
		</RuntimeContext.Provider>
	);
}

export function useRuntimeContract(): ArcadeRuntimeContract {
	const context = useContext(RuntimeContext);
	if (!context) {
		throw new Error("useRuntimeContract must be used within a RuntimeProvider");
	}
	return context;
}
