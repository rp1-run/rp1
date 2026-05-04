import { AlertTriangle, RefreshCw } from "lucide-react";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
	ARCADE_RUNTIME_SCHEMA_VERSION,
	type ArcadeReconnectPolicy,
	type ArcadeRuntimeContract,
	isArcadeHostMode,
} from "@/types/runtime";

interface RuntimeProviderProps {
	children: ReactNode;
	runtime?: ArcadeRuntimeContract;
	loadRuntime?: () => Promise<ArcadeRuntimeContract>;
}

interface RuntimeLoadState {
	contract: ArcadeRuntimeContract | null;
	error: string | null;
}

const RuntimeContext = createContext<ArcadeRuntimeContract | null>(null);

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

function RuntimeLoadFailure({ message }: { message: string }) {
	return (
		<div
			role="alert"
			className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-foreground"
		>
			<div className="flex w-full max-w-lg flex-col items-center rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
				<AlertTriangle className="mb-4 h-10 w-10 text-destructive" />
				<h1 className="mb-2 text-lg font-semibold">
					Arcade runtime failed to load
				</h1>
				<p className="mb-4 max-w-md text-sm text-muted-foreground">{message}</p>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => window.location.reload()}
				>
					<RefreshCw className="mr-1.5 h-3.5 w-3.5" />
					Reload page
				</Button>
			</div>
		</div>
	);
}

export function RuntimeProvider({
	children,
	runtime,
	loadRuntime = fetchRuntimeContract,
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

		loadRuntime()
			.then((contract) => {
				if (!cancelled) {
					setState({ contract, error: null });
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
	}, [runtime, loadRuntime]);

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
