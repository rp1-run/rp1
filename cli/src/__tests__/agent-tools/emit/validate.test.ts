/**
 * Unit tests for the emit validation module.
 * Tests event type validation, JSON payload parsing,
 * and per-type payload shape validation.
 */

import { describe, expect, test } from "bun:test";
import { VALID_EVENT_TYPES } from "../../../../shared/events.js";
import {
	validateEmitOptions,
	validatePayloadShape,
} from "../../../agent-tools/emit/validate.js";
import {
	expectLeft,
	expectRight,
	expectTaskRight,
	getErrorMessage,
	withEnvOverride,
} from "../../helpers/index.js";

describe("emit validation", () => {
	describe("validatePayloadShape", () => {
		describe("status_change", () => {
			test("accepts valid status_change payload", () => {
				const result = validatePayloadShape("status_change", {
					status: "running",
				});
				expectRight(result);
			});

			test("accepts status_change with optional message", () => {
				const result = validatePayloadShape("status_change", {
					status: "completed",
					message: "Step finished",
				});
				expectRight(result);
			});

			test("rejects status_change without status field", () => {
				const error = expectLeft(validatePayloadShape("status_change", {}));
				expect(error._tag).toBe("UsageError");
				expect(getErrorMessage(error)).toContain("status");
			});

			test("rejects status_change with invalid status value", () => {
				const error = expectLeft(
					validatePayloadShape("status_change", {
						status: "invalid_value",
					}),
				);
				expect(error._tag).toBe("UsageError");
				expect(getErrorMessage(error)).toContain("invalid_value");
			});

			test("accepts all 6 valid status values", () => {
				const validStatuses = [
					"not_started",
					"running",
					"waiting",
					"completed",
					"failed",
					"skipped",
				];

				for (const status of validStatuses) {
					const result = validatePayloadShape("status_change", {
						status,
					});
					expectRight(result);
				}
			});
		});

		describe("artifact_registered", () => {
			test("accepts valid artifact_registered payload", () => {
				const result = validatePayloadShape("artifact_registered", {
					path: "work/design.md",
					feature: "my-feature",
					storageRoot: "project",
				});
				expectRight(result);
			});

			test("rejects artifact_registered without path", () => {
				const error = expectLeft(
					validatePayloadShape("artifact_registered", {
						feature: "feat",
					}),
				);
				expect(error._tag).toBe("UsageError");
				expect(getErrorMessage(error)).toContain("path");
			});

			test("rejects artifact_registered without feature", () => {
				const error = expectLeft(
					validatePayloadShape("artifact_registered", {
						path: "file.md",
						storageRoot: "work_dir",
					}),
				);
				expect(error._tag).toBe("UsageError");
				expect(getErrorMessage(error)).toContain("feature");
			});

			test("rejects artifact_registered without storageRoot", () => {
				const error = expectLeft(
					validatePayloadShape("artifact_registered", {
						path: "file.md",
						feature: "feat",
					}),
				);
				expect(error._tag).toBe("UsageError");
				expect(getErrorMessage(error)).toContain("storageRoot");
			});

			test("rejects traversal in non-absolute artifact paths", () => {
				const error = expectLeft(
					validatePayloadShape("artifact_registered", {
						path: "../outside.md",
						feature: "feat",
						storageRoot: "project",
					}),
				);
				expect(error._tag).toBe("UsageError");
				expect(getErrorMessage(error)).toContain("must not contain '..'");
			});

			test("rejects absolute paths unless storageRoot is absolute", () => {
				const error = expectLeft(
					validatePayloadShape("artifact_registered", {
						path: "/tmp/outside.md",
						feature: "feat",
						storageRoot: "project",
					}),
				);
				expect(error._tag).toBe("UsageError");
				expect(getErrorMessage(error)).toContain("must be relative");
			});
		});

		describe("annotation_updated", () => {
			test("accepts valid annotation_updated payload", () => {
				const result = validatePayloadShape("annotation_updated", {
					docId: "doc-123",
					content: "Review comment",
				});
				expectRight(result);
			});

			test("rejects annotation_updated without docId", () => {
				const error = expectLeft(
					validatePayloadShape("annotation_updated", {
						content: "Comment",
					}),
				);
				expect(error._tag).toBe("UsageError");
				expect(getErrorMessage(error)).toContain("docId");
			});

			test("rejects annotation_updated without content", () => {
				const error = expectLeft(
					validatePayloadShape("annotation_updated", {
						docId: "doc-123",
					}),
				);
				expect(error._tag).toBe("UsageError");
				expect(getErrorMessage(error)).toContain("content");
			});
		});

		describe("waiting_for_user", () => {
			test("accepts valid waiting_for_user payload", () => {
				const result = validatePayloadShape("waiting_for_user", {
					prompt: "Please review the design",
				});
				expectRight(result);
			});

			test("rejects waiting_for_user without prompt", () => {
				const error = expectLeft(validatePayloadShape("waiting_for_user", {}));
				expect(error._tag).toBe("UsageError");
				expect(getErrorMessage(error)).toContain("prompt");
			});
		});

		describe("btw_update", () => {
			test("accepts valid btw_update payload", () => {
				const result = validatePayloadShape("btw_update", {
					message: "Found an interesting pattern",
				});
				expectRight(result);
			});

			test("rejects btw_update without message", () => {
				const error = expectLeft(validatePayloadShape("btw_update", {}));
				expect(error._tag).toBe("UsageError");
				expect(getErrorMessage(error)).toContain("message");
			});
		});

		describe("subflow_registered", () => {
			test("accepts valid subflow_registered payload", () => {
				const result = validatePayloadShape("subflow_registered", {
					parentStepId: "building",
					subflowName: "task-builder",
				});
				expectRight(result);
			});

			test("rejects subflow_registered without parentStepId", () => {
				const error = expectLeft(
					validatePayloadShape("subflow_registered", {
						subflowName: "task-builder",
					}),
				);
				expect(error._tag).toBe("UsageError");
				expect(getErrorMessage(error)).toContain("parentStepId");
			});

			test("rejects subflow_registered without subflowName", () => {
				const error = expectLeft(
					validatePayloadShape("subflow_registered", {
						parentStepId: "building",
					}),
				);
				expect(error._tag).toBe("UsageError");
				expect(getErrorMessage(error)).toContain("subflowName");
			});
		});

		describe("all event types", () => {
			test("all 6 valid event types have validation paths", () => {
				expect(VALID_EVENT_TYPES.length).toBe(6);

				const validPayloads: Record<string, Record<string, unknown>> = {
					status_change: { status: "running" },
					artifact_registered: {
						path: "file.md",
						feature: "feat",
						storageRoot: "work_dir",
					},
					annotation_updated: {
						docId: "doc-1",
						content: "note",
					},
					waiting_for_user: { prompt: "review?" },
					btw_update: { message: "info" },
					subflow_registered: {
						parentStepId: "step",
						subflowName: "flow",
					},
				};

				for (const type of VALID_EVENT_TYPES) {
					const result = validatePayloadShape(type, validPayloads[type]);
					expectRight(result);
				}
			});
		});
	});

	describe("validateEmitOptions project path resolution", () => {
		test("resolves project root when --project is omitted", async () => {
			const result = await expectTaskRight(
				validateEmitOptions({
					type: "status_change",
					runId: "test-run-1",
					workflow: "build",
					step: "plan",
					data: '{"status": "running"}',
					// project intentionally omitted
				}),
			);
			// Should resolve to the project root (which has .rp1/project_id),
			// not necessarily cwd if cwd is a subdirectory
			expect(result.projectPath).toBeTruthy();
			expect(typeof result.projectPath).toBe("string");
		});

		test("explicit --project takes precedence over RP1_ROOT env var", async () => {
			const restore = withEnvOverride("RP1_ROOT", "/tmp/env-override/.rp1");
			try {
				const result = await expectTaskRight(
					validateEmitOptions({
						type: "status_change",
						runId: "test-run-2",
						workflow: "build",
						step: "build",
						data: '{"status": "running"}',
						project: process.cwd(),
					}),
				);
				// Should use the explicit --project, not the env var
				expect(result.projectPath).not.toBe("/tmp/env-override");
			} finally {
				restore();
			}
		});
	});

	describe("validateEmitOptions workflow validation", () => {
		test("injects workflow into data payload", async () => {
			const result = await expectTaskRight(
				validateEmitOptions({
					type: "status_change",
					runId: "test-run-wf",
					workflow: "build",
					step: "plan",
					data: '{"status": "running"}',
					project: process.cwd(),
				}),
			);
			expect(result.workflow).toBe("build");
			expect(result.data.workflow).toBe("build");
		});

		test("rejects empty workflow string", async () => {
			const result = await validateEmitOptions({
				type: "status_change",
				runId: "test-run-wf",
				workflow: "",
				step: "plan",
				data: '{"status": "running"}',
				project: process.cwd(),
			})();
			expect(result._tag).toBe("Left");
			if (result._tag === "Left") {
				expect(getErrorMessage(result.left)).toContain("--workflow");
			}
		});
	});
});
