export type DurableWorkspaceRouteId = "activity" | "projects";
export type WorkspaceKind = "run" | "project" | "files";

export interface DurableWorkspaceRoute {
	readonly type: "durable";
	readonly durableRoute: DurableWorkspaceRouteId;
	readonly rootPath: "/" | "/projects";
}

export interface WorkspaceRouteDescriptor {
	readonly type: "workspace";
	readonly key: string;
	readonly kind: WorkspaceKind;
	readonly rootPath: string;
	readonly title: string;
	readonly subtitle: string | null;
	readonly projectId: string | null;
}

export interface UnknownWorkspaceRoute {
	readonly type: "unknown";
}

export type NormalizedWorkspaceRoute =
	| DurableWorkspaceRoute
	| WorkspaceRouteDescriptor
	| UnknownWorkspaceRoute;

function stripQueryAndHash(route: string): string {
	const [pathname] = route.split(/[?#]/, 1);
	return pathname || "/";
}

function normalizePathname(route: string): string {
	const pathname = stripQueryAndHash(route);
	if (pathname === "") return "/";
	if (pathname === "/") return pathname;
	return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function safeDecodeSegment(segment: string): string {
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}

export function normalizeWorkspaceRoute(
	route: string,
): NormalizedWorkspaceRoute {
	const pathname = normalizePathname(route);

	if (pathname === "/" || pathname === "/runs") {
		return {
			type: "durable",
			durableRoute: "activity",
			rootPath: "/",
		};
	}

	if (pathname === "/projects") {
		return {
			type: "durable",
			durableRoute: "projects",
			rootPath: "/projects",
		};
	}

	const filesMatch = pathname.match(/^\/projects\/([^/]+)\/files(?:\/.*)?$/);
	if (filesMatch) {
		const projectId = safeDecodeSegment(filesMatch[1]!);
		return {
			type: "workspace",
			key: `files:${projectId}`,
			kind: "files",
			rootPath: `/projects/${projectId}/files`,
			title: `${projectId} files`,
			subtitle: null,
			projectId,
		};
	}

	const projectMatch = pathname.match(/^\/projects\/([^/]+)$/);
	if (projectMatch) {
		const projectId = safeDecodeSegment(projectMatch[1]!);
		return {
			type: "workspace",
			key: `project:${projectId}`,
			kind: "project",
			rootPath: `/projects/${projectId}`,
			title: projectId,
			subtitle: null,
			projectId,
		};
	}

	const runMatch = pathname.match(/^\/runs\/([^/]+)(?:\/.*)?$/);
	if (runMatch) {
		const runId = safeDecodeSegment(runMatch[1]!);
		return {
			type: "workspace",
			key: `run:${runId}`,
			kind: "run",
			rootPath: `/runs/${runId}`,
			title: `Run ${runId}`,
			subtitle: null,
			projectId: null,
		};
	}

	return { type: "unknown" };
}

export function isDurableWorkspaceRoute(route: string): boolean {
	return normalizeWorkspaceRoute(route).type === "durable";
}
