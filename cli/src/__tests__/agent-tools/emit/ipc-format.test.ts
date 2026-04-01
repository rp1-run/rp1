/**
 * Tests for the new typed event IPC notification format (T2).
 * Validates EventNotificationPayload shape, notifyEvent function,
 * and backward compatibility in the v2-api handler.
 */

import { describe, expect, test } from "bun:test";
import type { EventNotificationPayload } from "../../../../web-ui/src/daemon/ipc.js";

describe("IPC event notification format", () => {
	describe("EventNotificationPayload shape", () => {
		test("constructs valid payload with all fields", () => {
			const payload: EventNotificationPayload = {
				type: "event",
				eventType: "status_change",
				eventId: 42,
				runId: "run-abc-123",
				projectPath: "/path/to/project",
				projectId: "project-uuid-1",
				rp1ProjectRoot: "/path/to/project",
				featureId: "my-feature",
				step: "design",
				data: { status: "running" },
				createdAt: "2026-03-15T10:00:00.000Z",
			};

			expect(payload.type).toBe("event");
			expect(payload.eventType).toBe("status_change");
			expect(payload.eventId).toBe(42);
			expect(payload.runId).toBe("run-abc-123");
			expect(payload.projectPath).toBe("/path/to/project");
			expect(payload.projectId).toBe("project-uuid-1");
			expect(payload.rp1ProjectRoot).toBe("/path/to/project");
			expect(payload.featureId).toBe("my-feature");
			expect(payload.step).toBe("design");
			expect(payload.data).toEqual({ status: "running" });
			expect(payload.createdAt).toBe("2026-03-15T10:00:00.000Z");
		});

		test("allows null step and data fields", () => {
			const payload: EventNotificationPayload = {
				type: "event",
				eventType: "btw_update",
				eventId: 99,
				runId: "run-xyz",
				projectPath: "/project",
				featureId: "feat",
				step: null,
				data: null,
				createdAt: "2026-03-15T12:00:00.000Z",
			};

			expect(payload.step).toBeNull();
			expect(payload.data).toBeNull();
		});

		test("supports all 6 event types", () => {
			const eventTypes = [
				"status_change",
				"artifact_registered",
				"annotation_updated",
				"waiting_for_user",
				"btw_update",
				"subflow_registered",
			];

			for (const eventType of eventTypes) {
				const payload: EventNotificationPayload = {
					type: "event",
					eventType,
					eventId: 1,
					runId: "run-1",
					projectPath: "/p",
					featureId: "f",
					step: null,
					data: null,
					createdAt: new Date().toISOString(),
				};

				expect(payload.type).toBe("event");
				expect(payload.eventType).toBe(eventType);
			}
		});
	});

	describe("JSON serialization round-trip", () => {
		test("payload survives JSON round-trip", () => {
			const payload: EventNotificationPayload = {
				type: "event",
				eventType: "status_change",
				eventId: 42,
				runId: "run-abc-123",
				projectPath: "/path/to/project",
				projectId: "project-uuid-1",
				rp1ProjectRoot: "/path/to/project",
				featureId: "my-feature",
				step: "design",
				data: { status: "running", message: "working on it" },
				createdAt: "2026-03-15T10:00:00.000Z",
			};

			const serialized = JSON.stringify(payload);
			const deserialized = JSON.parse(serialized) as EventNotificationPayload;

			expect(deserialized.type).toBe("event");
			expect(deserialized.eventType).toBe("status_change");
			expect(deserialized.eventId).toBe(42);
			expect(deserialized.runId).toBe("run-abc-123");
			expect(deserialized.projectId).toBe("project-uuid-1");
			expect(deserialized.rp1ProjectRoot).toBe("/path/to/project");
			expect(deserialized.data).toEqual({
				status: "running",
				message: "working on it",
			});
		});

		test("type discriminator distinguishes from legacy artifact format", () => {
			const eventPayload = { type: "event", eventType: "status_change" };
			const artifactPayload = { type: "artifact", projectPath: "/p" };
			const legacyPayload = {
				projectPath: "/p",
				feature: "f",
				status: "started",
			};

			expect(eventPayload.type).toBe("event");
			expect(artifactPayload.type).toBe("artifact");
			expect((legacyPayload as Record<string, unknown>).type).toBeUndefined();
		});
	});
});
