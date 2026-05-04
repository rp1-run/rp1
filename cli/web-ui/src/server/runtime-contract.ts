import { join } from "node:path";
import {
	ARCADE_RUNTIME_MANIFEST_FILENAME,
	ARCADE_RUNTIME_SCHEMA_VERSION,
	type ArcadeHostMode,
	type ArcadeRuntimeContract,
	type ArcadeRuntimeManifest,
	DEFAULT_ARCADE_RECONNECT_POLICY,
	isArcadeHostMode,
} from "../types/runtime";
import { RP1_VERSION } from "../version";
import type { ApiContext } from "./routes/content-utils";

export const RUNTIME_CACHE_CONTROL = "no-store, no-cache, must-revalidate";

export class UnsupportedArcadeHostModeError extends Error {
	readonly hostMode: string;

	constructor(hostMode: string) {
		super(`Unsupported Arcade host mode: ${hostMode}`);
		this.name = "UnsupportedArcadeHostModeError";
		this.hostMode = hostMode;
	}
}

export class RuntimeManifestError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "RuntimeManifestError";
	}
}

function isRuntimeManifest(value: unknown): value is ArcadeRuntimeManifest {
	if (value === null || typeof value !== "object") {
		return false;
	}

	const candidate = value as Partial<ArcadeRuntimeManifest>;
	return (
		typeof candidate.version === "string" &&
		typeof candidate.gitCommit === "string" &&
		typeof candidate.buildTime === "string" &&
		typeof candidate.buildId === "string"
	);
}

function fallbackRuntimeManifest(ctx: ApiContext): ArcadeRuntimeManifest {
	const version = ctx.version ?? RP1_VERSION;
	const buildId = ctx.isDev ? `dev-${version}` : version;

	return {
		version,
		gitCommit: "unknown",
		buildTime: "development",
		buildId,
	};
}

function runtimeManifestPath(ctx: ApiContext): string {
	const clientDir = ctx.webUIDir
		? join(ctx.webUIDir, "client")
		: join(import.meta.dir, "../../dist/client");
	return join(clientDir, ARCADE_RUNTIME_MANIFEST_FILENAME);
}

export async function readArcadeRuntimeManifest(
	ctx: ApiContext,
): Promise<ArcadeRuntimeManifest> {
	const manifestPath = runtimeManifestPath(ctx);
	const manifestFile = Bun.file(manifestPath);

	if (!(await manifestFile.exists())) {
		if (ctx.isDev || !ctx.webUIDir) {
			return fallbackRuntimeManifest(ctx);
		}
		throw new RuntimeManifestError(
			`Arcade runtime manifest not found at ${manifestPath}`,
		);
	}

	try {
		const parsed = JSON.parse(await manifestFile.text()) as unknown;
		if (!isRuntimeManifest(parsed)) {
			throw new RuntimeManifestError(
				`Arcade runtime manifest is invalid at ${manifestPath}`,
			);
		}
		return parsed;
	} catch (error) {
		if (error instanceof RuntimeManifestError) {
			throw error;
		}
		throw new RuntimeManifestError(
			`Failed to read Arcade runtime manifest at ${manifestPath}`,
		);
	}
}

export function resolveArcadeHostMode(url: URL): ArcadeHostMode {
	const rawHostMode =
		url.searchParams.get("hostMode") ?? url.searchParams.get("host-mode");

	if (rawHostMode === null) {
		return "browser";
	}

	if (isArcadeHostMode(rawHostMode)) {
		return rawHostMode;
	}

	throw new UnsupportedArcadeHostModeError(rawHostMode);
}

function resolveCacheBust(url: URL, manifest: ArcadeRuntimeManifest): string {
	const rawCacheBust =
		url.searchParams.get("cacheBust") ?? url.searchParams.get("cache-bust");
	const cacheBust = rawCacheBust?.trim();
	return cacheBust && cacheBust.length > 0 ? cacheBust : manifest.buildId;
}

export async function buildArcadeRuntimeContract(
	ctx: ApiContext,
	requestUrl: string | URL,
): Promise<ArcadeRuntimeContract> {
	const url = requestUrl instanceof URL ? requestUrl : new URL(requestUrl);
	const manifest = await readArcadeRuntimeManifest(ctx);

	return {
		schemaVersion: ARCADE_RUNTIME_SCHEMA_VERSION,
		baseUrl: url.origin,
		hostMode: resolveArcadeHostMode(url),
		version: manifest.version,
		buildId: manifest.buildId,
		cacheBust: resolveCacheBust(url, manifest),
		reconnectPolicy: DEFAULT_ARCADE_RECONNECT_POLICY,
	};
}

export function runtimeJsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"Cache-Control": RUNTIME_CACHE_CONTROL,
			"Content-Type": "application/json",
		},
	});
}
