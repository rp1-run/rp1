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
import type {
	Annotation,
	AnnotationFilter,
	AnnotationReply,
	CreateAnnotationRequest,
} from "../types/annotations";
import type {
	AnnotationCreatedMessage,
	AnnotationDeletedMessage,
	AnnotationReplyAddedMessage,
	AnnotationResolvedMessage,
	AnnotationUpdatedMessage,
	ServerMessage,
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
	setFilter: (filter: AnnotationFilter) => void;
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
}

/**
 * Provider component that manages annotation state and provides CRUD operations.
 * Automatically subscribes to WebSocket for real-time updates.
 */
export function AnnotationProvider({
	children,
	artifactPath,
}: AnnotationProviderProps) {
	const [annotations, setAnnotations] = useState<readonly Annotation[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [filter, setFilter] = useState<AnnotationFilter>(DEFAULT_FILTER);

	const { status: wsStatus } = useWebSocket();
	const wsRef = useRef<WebSocket | null>(null);
	const mountedRef = useRef(true);

	// Store pending optimistic updates for rollback
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

			const url = artifactPath
				? `/api/v2/annotations?artifactPath=${encodeURIComponent(artifactPath)}`
				: "/api/v2/annotations";

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
	}, [artifactPath]);

	/**
	 * Create a new annotation with optimistic update.
	 */
	const createAnnotation = useCallback(
		async (request: CreateAnnotationRequest): Promise<Annotation> => {
			// Generate a temporary ID for optimistic update
			const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
			const optimisticAnnotation: Annotation = {
				id: tempId,
				artifactPath: request.artifactPath,
				anchor: request.anchor,
				annotationType: request.annotationType,
				content: request.content,
				suggestion: request.suggestion ?? null,
				status: "open",
				author: "user",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				replies: [],
				orphaned: false,
			};

			// Store current state for rollback
			const rollbackId = tempId;
			optimisticRollbackRef.current.set(rollbackId, annotations);

			// Optimistic update
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

				// Replace temporary annotation with real one
				setAnnotations((prev) =>
					prev.map((a) => (a.id === tempId ? created : a)),
				);

				optimisticRollbackRef.current.delete(rollbackId);
				return created;
			} catch (err) {
				// Rollback on error
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
			// Store current state for rollback
			optimisticRollbackRef.current.set(id, annotations);

			// Optimistic update
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
				// Rollback on error
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
			// Store current state for rollback
			optimisticRollbackRef.current.set(id, annotations);

			// Optimistic update
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
				// Rollback on error
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
			// Store current state for rollback
			optimisticRollbackRef.current.set(id, annotations);

			// Optimistic update
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
				// Rollback on error
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
			// Generate temporary reply for optimistic update
			const tempReply: AnnotationReply = {
				id: `temp-reply-${Date.now()}-${Math.random().toString(36).slice(2)}`,
				content,
				author: "user",
				createdAt: new Date().toISOString(),
			};

			// Store current state for rollback
			const rollbackId = `reply-${annotationId}`;
			optimisticRollbackRef.current.set(rollbackId, annotations);

			// Optimistic update
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

				// Replace temporary reply with real one
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
				// Rollback on error
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
	const handleAnnotationMessage = useCallback((message: ServerMessage) => {
		switch (message.type) {
			case "annotation:created": {
				const msg = message as AnnotationCreatedMessage;
				setAnnotations((prev) => {
					// Avoid duplicates from our own optimistic updates
					if (prev.some((a) => a.id === msg.annotation.id)) {
						return prev;
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
					prev.map((a) =>
						a.id === msg.annotationId
							? {
									...a,
									replies: a.replies.some((r) => r.id === msg.reply.id)
										? a.replies
										: [...a.replies, msg.reply],
									updatedAt: msg.timestamp,
								}
							: a,
					),
				);
				break;
			}
		}
	}, []);

	// Fetch annotations on mount and when artifact path changes
	useEffect(() => {
		mountedRef.current = true;
		fetchAnnotations();

		return () => {
			mountedRef.current = false;
		};
	}, [fetchAnnotations]);

	// Subscribe to WebSocket for real-time annotation updates
	useEffect(() => {
		if (wsStatus !== "connected") return;

		const port = 7710;
		const wsUrl = `ws://127.0.0.1:${port}/ws`;
		const ws = new WebSocket(wsUrl);

		ws.onmessage = (event) => {
			try {
				const message = JSON.parse(event.data) as ServerMessage;
				if (message.type.startsWith("annotation:")) {
					handleAnnotationMessage(message);
				}
			} catch {
				// Ignore parse errors
			}
		};

		wsRef.current = ws;

		return () => {
			ws.close();
			wsRef.current = null;
		};
	}, [wsStatus, handleAnnotationMessage]);

	const contextValue = useMemo<AnnotationContextValue>(
		() => ({
			annotations,
			isLoading,
			error,
			filter,
			setFilter,
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
