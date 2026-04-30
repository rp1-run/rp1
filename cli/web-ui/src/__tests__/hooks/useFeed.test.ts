import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import type { FeedItem } from "@/hooks/useFeed";
import { liveRunIndex } from "@/lib/live-run-index";
import type { Run } from "@/types/runs";

let fetchMock: ReturnType<typeof mock>;
let useFeedImportVersion = 0;

function buildRun(overrides: Partial<Run> = {}): Run {
	return {
		id: "run-1",
		projectId: "proj-1",
		projectName: "Test Project",
		featureId: "feat-1",
		featureName: "Test Feature",
		name: null,
		command: "/build",
		status: "running",
		harness: "codex",
		currentStep: null,
		steps: [],
		artifacts: [],
		events: [],
		startedAt: "2026-04-10T00:00:00.000Z",
		lastEventAt: "2026-04-10T00:05:00.000Z",
		completedAt: null,
		error: null,
		agentSteps: null,
		...overrides,
	};
}

interface MockFeedResponse {
	readonly ok: boolean;
	readonly statusText: string;
	readonly json: () => Promise<{
		readonly items: FeedItem[];
		readonly total: number;
	}>;
}

interface Deferred<T> {
	readonly promise: Promise<T>;
	readonly resolve: (value: T) => void;
	readonly reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
	let resolve: (value: T) => void = () => {};
	let reject: (reason?: unknown) => void = () => {};
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});

	return { promise, resolve, reject };
}

function buildFeedItem(run: Run): FeedItem {
	return {
		type: "run",
		id: run.id,
		timestamp: run.lastEventAt ?? run.startedAt,
		run,
	};
}

function buildFeedResponse(
	runs: readonly Run[],
	total = runs.length,
): MockFeedResponse {
	return {
		ok: true,
		statusText: "OK",
		json: () =>
			Promise.resolve({
				items: runs.map(buildFeedItem),
				total,
			}),
	};
}

function createAbortError(): Error {
	const error = new Error("Aborted");
	error.name = "AbortError";
	return error;
}

async function loadUseFeed() {
	mock.module("../../hooks/useReconnectRecovery.ts", () => ({
		useReconnectRecovery: () => {},
	}));
	mock.module("../../hooks/useLiveRunIndex.ts", () => ({
		useLiveRunIndexBridge: () => {},
		useLiveRunIndexSnapshot: () =>
			useSyncExternalStore(
				liveRunIndex.subscribe,
				liveRunIndex.getSnapshot,
				liveRunIndex.getSnapshot,
			),
	}));

	return import(
		`../../hooks/useFeed.ts?use-feed-test=${++useFeedImportVersion}`
	);
}

beforeEach(() => {
	mock.restore();
	liveRunIndex.clear();

	fetchMock = mock(() => Promise.resolve(buildFeedResponse([buildRun()])));

	globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
	liveRunIndex.clear();
	mock.restore();
});

describe("useFeed", () => {
	test("passes trimmed non-empty search queries to the feed API", async () => {
		const { useFeed } = await loadUseFeed();
		const { result } = renderHook(() =>
			useFeed({
				status: "running",
				projectId: "proj-1",
				dateRange: "week",
				limit: 10,
				offset: 5,
				search: "  FE  codex  ",
			}),
		);

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		const url = new URL(
			fetchMock.mock.calls[0]?.[0] as string,
			"http://localhost",
		);
		expect(url.pathname).toBe("/api/v2/feed");
		expect(url.searchParams.get("status")).toBe("running");
		expect(url.searchParams.get("projectId")).toBe("proj-1");
		expect(url.searchParams.get("dateRange")).toBe("week");
		expect(url.searchParams.get("limit")).toBe("10");
		expect(url.searchParams.get("offset")).toBe("5");
		expect(url.searchParams.get("q")).toBe("FE  codex");
	});

	test("omits blank search query params", async () => {
		const { useFeed } = await loadUseFeed();
		const { result } = renderHook(() =>
			useFeed({ limit: 25, search: " \t\n " }),
		);

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		const url = new URL(
			fetchMock.mock.calls[0]?.[0] as string,
			"http://localhost",
		);
		expect(url.searchParams.has("q")).toBe(false);
	});

	test("patches known runs in place and appends newly matching runs without refetching", async () => {
		const { useFeed } = await loadUseFeed();
		const { result } = renderHook(() => useFeed({ limit: 25, offset: 0 }));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.items).toHaveLength(1);
		expect(result.current.items[0]?.run.status).toBe("running");
		expect(result.current.total).toBe(1);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		act(() => {
			liveRunIndex.upsertRuns([
				buildRun({
					id: "run-1",
					status: "waiting",
					currentStep: "review",
					lastEventAt: "2026-04-10T00:06:00.000Z",
				}),
				buildRun({
					id: "run-2",
					name: "Fresh Run",
					lastEventAt: "2026-04-10T00:07:00.000Z",
				}),
			]);
		});

		await waitFor(() => {
			expect(result.current.items).toHaveLength(2);
		});

		expect(result.current.items.map((item: { id: string }) => item.id)).toEqual(
			["run-1", "run-2"],
		);
		expect(result.current.items[0]?.run.status).toBe("waiting");
		expect(result.current.total).toBe(2);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	test("keeps existing feed order when live timestamps change", async () => {
		fetchMock = mock(() =>
			Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						items: [
							{
								type: "run",
								id: "run-1",
								timestamp: "2026-04-10T00:10:00.000Z",
								run: buildRun({
									id: "run-1",
									lastEventAt: "2026-04-10T00:10:00.000Z",
								}),
							},
							{
								type: "run",
								id: "run-2",
								timestamp: "2026-04-10T00:09:00.000Z",
								run: buildRun({
									id: "run-2",
									lastEventAt: "2026-04-10T00:09:00.000Z",
								}),
							},
						],
						total: 2,
					}),
			}),
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const { useFeed } = await loadUseFeed();
		const { result } = renderHook(() => useFeed({ limit: 25, offset: 0 }));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.items.map((item: { id: string }) => item.id)).toEqual(
			["run-1", "run-2"],
		);

		act(() => {
			liveRunIndex.upsertRun(
				buildRun({
					id: "run-2",
					status: "waiting",
					lastEventAt: "2026-04-10T00:11:00.000Z",
				}),
			);
		});

		await waitFor(() => {
			expect(result.current.items[1]?.timestamp).toBe(
				"2026-04-10T00:11:00.000Z",
			);
		});

		expect(result.current.items.map((item: { id: string }) => item.id)).toEqual(
			["run-1", "run-2"],
		);
		expect(result.current.items[1]?.run.status).toBe("waiting");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	test("applies shared multi-token search semantics to live feed updates", async () => {
		fetchMock = mock(() => Promise.resolve(buildFeedResponse([], 0)));
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const { useFeed } = await loadUseFeed();
		const { result } = renderHook(() =>
			useFeed({ limit: 25, offset: 0, search: "qa approval" }),
		);

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		act(() => {
			liveRunIndex.upsertRuns([
				buildRun({
					id: "run-live-match",
					name: "Live Match",
					currentStep: "qa_gate",
					statusMessage: "Approval Needed",
					lastEventAt: "2026-04-10T00:08:00.000Z",
				}),
				buildRun({
					id: "run-live-partial",
					name: "Live Partial",
					currentStep: "qa_gate",
					statusMessage: null,
					lastEventAt: "2026-04-10T00:09:00.000Z",
				}),
				buildRun({
					id: "run-live-payload-only",
					name: "Payload Only",
					events: [
						{
							id: "event-payload",
							type: "status_change",
							message: "approval payload",
							timestamp: "2026-04-10T00:10:00.000Z",
							stepId: null,
							metadata: { message: "qa approval" },
						},
					],
					lastEventAt: "2026-04-10T00:10:00.000Z",
				}),
			]);
		});

		await waitFor(() => {
			expect(result.current.items).toHaveLength(1);
		});

		expect(result.current.items.map((item: { id: string }) => item.id)).toEqual(
			["run-live-match"],
		);
		expect(result.current.total).toBe(1);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	test("ignores stale unfiltered responses after current empty search results", async () => {
		const staleUnfilteredResponse = createDeferred<MockFeedResponse>();
		const currentSearchResponse = createDeferred<MockFeedResponse>();
		let requestCount = 0;
		let firstSignal: AbortSignal | undefined;

		fetchMock = mock((_url: string | URL | Request, init?: RequestInit) => {
			requestCount += 1;
			if (requestCount === 1) {
				firstSignal = init?.signal ?? undefined;
				return staleUnfilteredResponse.promise;
			}

			return currentSearchResponse.promise;
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const { useFeed } = await loadUseFeed();
		const { result, rerender } = renderHook(
			({ search }: { readonly search?: string }) =>
				useFeed({ limit: 25, offset: 0, search }),
			{ initialProps: { search: undefined as string | undefined } },
		);

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		rerender({ search: "rep1" });

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledTimes(2);
		});
		expect(firstSignal?.aborted).toBe(true);

		await act(async () => {
			currentSearchResponse.resolve(buildFeedResponse([], 0));
			await currentSearchResponse.promise;
			await Promise.resolve();
		});

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});
		expect(result.current.items).toHaveLength(0);
		expect(result.current.total).toBe(0);
		expect(result.current.error).toBeNull();

		await act(async () => {
			staleUnfilteredResponse.resolve(
				buildFeedResponse([buildRun({ id: "stale-run", name: "Stale Row" })]),
			);
			await staleUnfilteredResponse.promise;
			await Promise.resolve();
		});

		expect(result.current.items).toHaveLength(0);
		expect(result.current.total).toBe(0);
		expect(result.current.error).toBeNull();
		expect(liveRunIndex.getRun("stale-run")).toBeUndefined();
	});

	test("does not clear current loading state when an aborted request rejects", async () => {
		const abortedResponse = createDeferred<MockFeedResponse>();
		const currentSearchResponse = createDeferred<MockFeedResponse>();
		let requestCount = 0;

		fetchMock = mock((_url: string | URL | Request, init?: RequestInit) => {
			requestCount += 1;
			if (requestCount === 1) {
				init?.signal?.addEventListener("abort", () => {
					abortedResponse.reject(createAbortError());
				});
				return abortedResponse.promise;
			}

			return currentSearchResponse.promise;
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const { useFeed } = await loadUseFeed();
		const { result, rerender } = renderHook(
			({ search }: { readonly search?: string }) =>
				useFeed({ limit: 25, offset: 0, search }),
			{ initialProps: { search: undefined as string | undefined } },
		);

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		rerender({ search: "rep1" });

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledTimes(2);
		});
		await act(async () => {
			await Promise.resolve();
		});

		expect(result.current.isLoading).toBe(true);
		expect(result.current.error).toBeNull();

		await act(async () => {
			currentSearchResponse.resolve(buildFeedResponse([], 0));
			await currentSearchResponse.promise;
			await Promise.resolve();
		});

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});
		expect(result.current.items).toHaveLength(0);
		expect(result.current.total).toBe(0);
		expect(result.current.error).toBeNull();
	});
});
