/**
 * Annotation context provider for managing annotation state and operations.
 * Provides CRUD operations, filtering, and WebSocket real-time updates.
 */

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useReconnectRecovery } from "@/hooks/useReconnectRecovery";
import type {
	Annotation,
	AnnotationFilter,
	AnnotationReply,
	CreateAnnotationRequest,
} from "../types/annotations";
import type {
	AnnotationCreatedMessage,
	AnnotationDeletedMessage,
	AnnotationMessage,
	AnnotationReplyAddedMessage,
	AnnotationResolvedMessage,
	AnnotationUpdatedMessage,
} from "../types/websocket";
import { useWebSocket } from "./WebSocketProvider";

/**
 * Context value interface for annotation state and operations.
 */
export interface AnnotationContextValue {
	readonly annotations: readonly Annotation[];
	readonly isLoading: boolean;
	readonly error: string | null;
	readonly filter: AnnotationFilter;
	readonly selectedAnnotationId: string | null;
	readonly docId: string | null;
	readonly runId: string | null;
	setFilter: (filter: AnnotationFilter) => void;
	selectAnnotation: (id: string | null) => void;
	createAnnotation: (request: CreateAnnotationRequest) => Promise<Annotation>;
	resolveAnnotation: (id: string) => Promise<void>;
	reopenAnnotation: (id: string) => Promise<void>;
	deleteAnnotation: (id: string) => Promise<void>;
	addReply: (annotationId: string, content: string) => Promise<void>;
	getAnnotationsForArtifact: (path: string) => readonly Annotation[];
	refetch: () => Promise<void>;
}

const DEFAULT_FILTER: AnnotationFilter = {
	status: "all",
	author: null,
	dateRange: "all",
};

const AnnotationContext = createContext<AnnotationContextValue | null>(null);

interface AnnotationProviderProps {
	readonly children: ReactNode;
	readonly artifactPath?: string;
	readonly docId?: string;
	readonly runId?: string;
}

export function buildAnnotationsUrl(params: {
	readonly docId?: string;
	readonly runId?: string;
}): string {
	const searchParams = new URLSearchParams();

	if (params.docId) {
		searchParams.set("docId", params.docId);
	}
	if (params.runId) {
		searchParams.set("runId", params.runId);
	}

	const query = searchParams.toString();
	return query.length > 0
		? `/api/v2/annotations?${query}`
		: "/api/v2/annotations";
}

/**
 * Provider component that manages annotation state and provides CRUD operations.
 * Automatically subscribes to WebSocket for real-time updates.
 */
export function AnnotationProvider({
	children,
	docId: docIdProp,
	runId: runIdProp,
}: AnnotationProviderProps) {
	const [annotations, setAnnotations] = useState<readonly Annotation[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [filter, setFilter] = useState<AnnotationFilter>(DEFAULT_FILTER);
	const [selectedAnnotationId, setSelectedAnnotationId] = useState<
		string | null
	>(null);

	const { onAnnotationMessage } = useWebSocket();
	const mountedRef = useRef(true);

	const optimisticRollbackRef = useRef<Map<string, readonly Annotation[]>>(
		new Map(),
	);

	/**
	 * Fetch annotations from the API.
	 */
	const fetchAnnotations = useCallback(async () => {
		try {
			setIsLoading(true);
			setError(null);

			const url = buildAnnotationsUrl({
				docId: docIdProp,
				runId: runIdProp,
			});

			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`Failed to fetch annotations: ${response.statusText}`);
			}

			const data = (await response.json()) as { annotations: Annotation[] };
			if (mountedRef.current) {
				setAnnotations(data.annotations);
			}
		} catch (err) {
			if (mountedRef.current) {
				setError(err instanceof Error ? err.message : String(err));
			}
		} finally {
			if (mountedRef.current) {
				setIsLoading(false);
			}
		}
	}, [docIdProp, runIdProp]);

	useReconnectRecovery(fetchAnnotations);

	/**
	 * Create a new annotation with optimistic update.
	 */
	const createAnnotation = useCallback(
		async (request: CreateAnnotationRequest): Promise<Annotation> => {
			const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
			const optimisticAnnotation: Annotation = {
				id: tempId,
				docId: request.docId,
				artifactPath: request.artifactPath,
				anchor: request.anchor,
				content: request.content,
				status: "open",
				author: "user",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				replies: [],
				orphaned: false,
			};

			const rollbackId = tempId;
			optimisticRollbackRef.current.set(rollbackId, annotations);
			setAnnotations((prev) => [...prev, optimisticAnnotation]);

			try {
				const response = await fetch("/api/v2/annotations", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(request),
				});

				if (!response.ok) {
					const errorData = (await response.json()) as { error?: string };
					throw new Error(
						errorData.error ??
							`Failed to create annotation: ${response.statusText}`,
					);
				}

				const created = (await response.json()) as Annotation;

				setAnnotations((prev) =>
					prev.map((a) => (a.id === tempId ? created : a)),
				);

				optimisticRollbackRef.current.delete(rollbackId);
				return created;
			} catch (err) {
				const rollbackState = optimisticRollbackRef.current.get(rollbackId);
				if (rollbackState) {
					setAnnotations(rollbackState);
					optimisticRollbackRef.current.delete(rollbackId);
				}
				throw err;
			}
		},
		[annotations],
	);

	/**
	 * Resolve an annotation with optimistic update.
	 */
	const resolveAnnotation = useCallback(
		async (id: string): Promise<void> => {
			optimisticRollbackRef.current.set(id, annotations);
			setAnnotations((prev) =>
				prev.map((a) =>
					a.id === id
						? {
								...a,
								status: "resolved" as const,
								updatedAt: new Date().toISOString(),
							}
						: a,
				),
			);

			try {
				const response = await fetch(`/api/v2/annotations/${id}/resolve`, {
					method: "POST",
				});

				if (!response.ok) {
					const errorData = (await response.json()) as { error?: string };
					throw new Error(
						errorData.error ??
							`Failed to resolve annotation: ${response.statusText}`,
					);
				}

				optimisticRollbackRef.current.delete(id);
			} catch (err) {
				const rollbackState = optimisticRollbackRef.current.get(id);
				if (rollbackState) {
					setAnnotations(rollbackState);
					optimisticRollbackRef.current.delete(id);
				}
				throw err;
			}
		},
		[annotations],
	);

	/**
	 * Reopen a resolved annotation with optimistic update.
	 */
	const reopenAnnotation = useCallback(
		async (id: string): Promise<void> => {
			optimisticRollbackRef.current.set(id, annotations);
			setAnnotations((prev) =>
				prev.map((a) =>
					a.id === id
						? {
								...a,
								status: "open" as const,
								updatedAt: new Date().toISOString(),
							}
						: a,
				),
			);

			try {
				const response = await fetch(`/api/v2/annotations/${id}/reopen`, {
					method: "POST",
				});

				if (!response.ok) {
					const errorData = (await response.json()) as { error?: string };
					throw new Error(
						errorData.error ??
							`Failed to reopen annotation: ${response.statusText}`,
					);
				}

				optimisticRollbackRef.current.delete(id);
			} catch (err) {
				const rollbackState = optimisticRollbackRef.current.get(id);
				if (rollbackState) {
					setAnnotations(rollbackState);
					optimisticRollbackRef.current.delete(id);
				}
				throw err;
			}
		},
		[annotations],
	);

	/**
	 * Delete an annotation with optimistic update.
	 */
	const deleteAnnotation = useCallback(
		async (id: string): Promise<void> => {
			optimisticRollbackRef.current.set(id, annotations);
			setAnnotations((prev) => prev.filter((a) => a.id !== id));

			try {
				const response = await fetch(`/api/v2/annotations/${id}`, {
					method: "DELETE",
				});

				if (!response.ok) {
					const errorData = (await response.json()) as { error?: string };
					throw new Error(
						errorData.error ??
							`Failed to delete annotation: ${response.statusText}`,
					);
				}

				optimisticRollbackRef.current.delete(id);
			} catch (err) {
				const rollbackState = optimisticRollbackRef.current.get(id);
				if (rollbackState) {
					setAnnotations(rollbackState);
					optimisticRollbackRef.current.delete(id);
				}
				throw err;
			}
		},
		[annotations],
	);

	/**
	 * Add a reply to an annotation with optimistic update.
	 */
	const addReply = useCallback(
		async (annotationId: string, content: string): Promise<void> => {
			const tempReply: AnnotationReply = {
				id: `temp-reply-${Date.now()}-${Math.random().toString(36).slice(2)}`,
				content,
				author: "user",
				createdAt: new Date().toISOString(),
			};

			const rollbackId = `reply-${annotationId}`;
			optimisticRollbackRef.current.set(rollbackId, annotations);
			setAnnotations((prev) =>
				prev.map((a) =>
					a.id === annotationId
						? {
								...a,
								replies: [...a.replies, tempReply],
								updatedAt: new Date().toISOString(),
							}
						: a,
				),
			);

			try {
				const response = await fetch(
					`/api/v2/annotations/${annotationId}/replies`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ content }),
					},
				);

				if (!response.ok) {
					const errorData = (await response.json()) as { error?: string };
					throw new Error(
						errorData.error ?? `Failed to add reply: ${response.statusText}`,
					);
				}

				const realReply = (await response.json()) as AnnotationReply;

				setAnnotations((prev) =>
					prev.map((a) =>
						a.id === annotationId
							? {
									...a,
									replies: a.replies.map((r) =>
										r.id === tempReply.id ? realReply : r,
									),
								}
							: a,
					),
				);

				optimisticRollbackRef.current.delete(rollbackId);
			} catch (err) {
				const rollbackState = optimisticRollbackRef.current.get(rollbackId);
				if (rollbackState) {
					setAnnotations(rollbackState);
					optimisticRollbackRef.current.delete(rollbackId);
				}
				throw err;
			}
		},
		[annotations],
	);

	/**
	 * Get annotations filtered by artifact path.
	 */
	const getAnnotationsForArtifact = useCallback(
		(path: string): readonly Annotation[] => {
			return annotations.filter((a) => a.artifactPath === path);
		},
		[annotations],
	);

	/**
	 * Handle incoming WebSocket annotation messages.
	 */
	const handleAnnotationMessage = useCallback((message: AnnotationMessage) => {
		switch (message.type) {
			case "annotation:created": {
				const msg = message as AnnotationCreatedMessage;
				setAnnotations((prev) => {
					// Avoid duplicates from our own optimistic updates
					if (prev.some((a) => a.id === msg.annotation.id)) {
						return prev;
					}
					// Check if there's a pending optimistic annotation with temp ID
					// that matches the same artifact path and anchor
					const tempIndex = prev.findIndex(
						(a) =>
							a.id.startsWith("temp-") &&
							a.artifactPath === msg.annotation.artifactPath &&
							JSON.stringify(a.anchor) ===
								JSON.stringify(msg.annotation.anchor),
					);
					if (tempIndex >= 0) {
						const updated = [...prev];
						updated[tempIndex] = msg.annotation;
						return updated;
					}
					return [...prev, msg.annotation];
				});
				break;
			}
			case "annotation:updated": {
				const msg = message as AnnotationUpdatedMessage;
				setAnnotations((prev) =>
					prev.map((a) => (a.id === msg.annotation.id ? msg.annotation : a)),
				);
				break;
			}
			case "annotation:resolved": {
				const msg = message as AnnotationResolvedMessage;
				setAnnotations((prev) =>
					prev.map((a) =>
						a.id === msg.annotationId
							? { ...a, status: "resolved" as const, updatedAt: msg.timestamp }
							: a,
					),
				);
				break;
			}
			case "annotation:deleted": {
				const msg = message as AnnotationDeletedMessage;
				setAnnotations((prev) => prev.filter((a) => a.id !== msg.annotationId));
				break;
			}
			case "annotation:reply-added": {
				const msg = message as AnnotationReplyAddedMessage;
				setAnnotations((prev) =>
					prev.map((a) => {
						if (a.id !== msg.annotationId) return a;

						// Check if reply already exists by ID
						if (a.replies.some((r) => r.id === msg.reply.id)) {
							return a;
						}

						// Check if there's a matching temp reply to replace (race condition fix)
						const tempIndex = a.replies.findIndex(
							(r) =>
								r.id.startsWith("temp-reply-") &&
								r.content === msg.reply.content,
						);

						if (tempIndex >= 0) {
							const updatedReplies = [...a.replies];
							updatedReplies[tempIndex] = msg.reply;
							return {
								...a,
								replies: updatedReplies,
								updatedAt: msg.timestamp,
							};
						}

						return {
							...a,
							replies: [...a.replies, msg.reply],
							updatedAt: msg.timestamp,
						};
					}),
				);
				break;
			}
		}
	}, []);

	useEffect(() => {
		mountedRef.current = true;
		fetchAnnotations();

		return () => {
			mountedRef.current = false;
		};
	}, [fetchAnnotations]);

	useEffect(() => {
		return onAnnotationMessage(handleAnnotationMessage);
	}, [onAnnotationMessage, handleAnnotationMessage]);

	const selectAnnotation = useCallback((id: string | null) => {
		setSelectedAnnotationId(id);
	}, []);

	const contextValue = useMemo<AnnotationContextValue>(
		() => ({
			annotations,
			isLoading,
			error,
			filter,
			selectedAnnotationId,
			docId: docIdProp ?? null,
			runId: runIdProp ?? null,
			setFilter,
			selectAnnotation,
			createAnnotation,
			resolveAnnotation,
			reopenAnnotation,
			deleteAnnotation,
			addReply,
			getAnnotationsForArtifact,
			refetch: fetchAnnotations,
		}),
		[
			annotations,
			isLoading,
			error,
			filter,
			selectedAnnotationId,
			docIdProp,
			runIdProp,
			selectAnnotation,
			createAnnotation,
			resolveAnnotation,
			reopenAnnotation,
			deleteAnnotation,
			addReply,
			getAnnotationsForArtifact,
			fetchAnnotations,
		],
	);

	return (
		<AnnotationContext.Provider value={contextValue}>
			{children}
		</AnnotationContext.Provider>
	);
}

/**
 * Hook to access annotation context.
 * Must be used within an AnnotationProvider.
 */
export function useAnnotationContext(): AnnotationContextValue {
	const context = useContext(AnnotationContext);
	if (!context) {
		throw new Error(
			"useAnnotationContext must be used within an AnnotationProvider",
		);
	}
	return context;
}

/**
 * Default no-op context value for use outside AnnotationProvider.
 */
const DEFAULT_ANNOTATION_CONTEXT: AnnotationContextValue = {
	annotations: [],
	isLoading: false,
	error: null,
	filter: DEFAULT_FILTER,
	selectedAnnotationId: null,
	docId: null,
	runId: null,
	setFilter: () => {},
	selectAnnotation: () => {},
	createAnnotation: () => Promise.reject(new Error("No AnnotationProvider")),
	resolveAnnotation: () => Promise.reject(new Error("No AnnotationProvider")),
	reopenAnnotation: () => Promise.reject(new Error("No AnnotationProvider")),
	deleteAnnotation: () => Promise.reject(new Error("No AnnotationProvider")),
	addReply: () => Promise.reject(new Error("No AnnotationProvider")),
	getAnnotationsForArtifact: () => [],
	refetch: () => Promise.resolve(),
};

/**
 * Hook to access annotation context safely.
 * Returns default no-op values when used outside an AnnotationProvider.
 */
export function useAnnotationContextSafe(): AnnotationContextValue {
	const context = useContext(AnnotationContext);
	return context ?? DEFAULT_ANNOTATION_CONTEXT;
}
