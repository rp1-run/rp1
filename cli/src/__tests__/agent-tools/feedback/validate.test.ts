import { describe, expect, test } from "bun:test";
import type { AnnotationStatusFilter } from "../../../agent-tools/feedback/models.js";
import {
	validateAcceptEditOptions,
	validateReadOptions,
	validateReplyOptions,
	validateResolveOptions,
} from "../../../agent-tools/feedback/validate.js";
import {
	expectLeft,
	expectRight,
	getErrorMessage,
} from "../../helpers/index.js";

describe("feedback validation", () => {
	describe("validateReadOptions", () => {
		test("accepts valid options with default status", () => {
			const result = expectRight(validateReadOptions({ runId: "run-123" }));
			expect(result.runId).toBe("run-123");
			expect(result.status).toBe("open");
			expect(result.projectPath).toBeDefined();
		});

		test("accepts explicit status values", () => {
			for (const status of [
				"open",
				"resolved",
				"all",
			] as AnnotationStatusFilter[]) {
				const result = expectRight(
					validateReadOptions({ runId: "run-1", status }),
				);
				expect(result.status).toBe(status);
			}
		});

		test("rejects empty run-id", () => {
			const error = expectLeft(validateReadOptions({ runId: "" }));
			expect(error._tag).toBe("UsageError");
			expect(getErrorMessage(error)).toContain("--run-id");
		});

		test("rejects whitespace-only run-id", () => {
			const error = expectLeft(validateReadOptions({ runId: "   " }));
			expect(error._tag).toBe("UsageError");
		});

		test("rejects invalid status value", () => {
			const error = expectLeft(
				validateReadOptions({ runId: "run-1", status: "invalid" }),
			);
			expect(error._tag).toBe("UsageError");
			expect(getErrorMessage(error)).toContain("invalid");
		});

		test("trims run-id whitespace", () => {
			const result = expectRight(validateReadOptions({ runId: "  run-123  " }));
			expect(result.runId).toBe("run-123");
		});

		test("uses provided project path", () => {
			const result = expectRight(
				validateReadOptions({ runId: "run-1", project: "/custom/path" }),
			);
			expect(result.projectPath).toBe("/custom/path");
		});
	});

	describe("validateResolveOptions", () => {
		test("accepts valid annotation ID", () => {
			const result = expectRight(
				validateResolveOptions({ annotationId: "42" }),
			);
			expect(result.annotationId).toBe(42);
			expect(result.reply).toBeUndefined();
		});

		test("accepts annotation ID with reply", () => {
			const result = expectRight(
				validateResolveOptions({
					annotationId: "42",
					reply: "Applied fix",
				}),
			);
			expect(result.annotationId).toBe(42);
			expect(result.reply).toBe("Applied fix");
		});

		test("rejects non-numeric annotation ID", () => {
			const error = expectLeft(validateResolveOptions({ annotationId: "abc" }));
			expect(error._tag).toBe("UsageError");
			expect(getErrorMessage(error)).toContain("annotation ID");
		});

		test("rejects zero annotation ID", () => {
			const error = expectLeft(validateResolveOptions({ annotationId: "0" }));
			expect(error._tag).toBe("UsageError");
		});

		test("rejects negative annotation ID", () => {
			const error = expectLeft(validateResolveOptions({ annotationId: "-5" }));
			expect(error._tag).toBe("UsageError");
		});

		test("rejects empty reply string", () => {
			const error = expectLeft(
				validateResolveOptions({ annotationId: "42", reply: "" }),
			);
			expect(error._tag).toBe("UsageError");
			expect(getErrorMessage(error)).toContain("--reply");
		});

		test("rejects whitespace-only reply", () => {
			const error = expectLeft(
				validateResolveOptions({ annotationId: "42", reply: "   " }),
			);
			expect(error._tag).toBe("UsageError");
		});
	});

	describe("validateReplyOptions", () => {
		test("accepts valid options", () => {
			const result = expectRight(
				validateReplyOptions({ annotationId: "10", content: "Hello" }),
			);
			expect(result.annotationId).toBe(10);
			expect(result.content).toBe("Hello");
		});

		test("rejects non-numeric annotation ID", () => {
			const error = expectLeft(
				validateReplyOptions({ annotationId: "xyz", content: "Hi" }),
			);
			expect(error._tag).toBe("UsageError");
		});

		test("rejects empty content", () => {
			const error = expectLeft(
				validateReplyOptions({ annotationId: "10", content: "" }),
			);
			expect(error._tag).toBe("UsageError");
			expect(getErrorMessage(error)).toContain("--content");
		});

		test("rejects whitespace-only content", () => {
			const error = expectLeft(
				validateReplyOptions({ annotationId: "10", content: "   " }),
			);
			expect(error._tag).toBe("UsageError");
		});

		test("trims content whitespace", () => {
			const result = expectRight(
				validateReplyOptions({ annotationId: "10", content: "  Hi  " }),
			);
			expect(result.content).toBe("Hi");
		});
	});

	describe("validateAcceptEditOptions", () => {
		test("accepts valid doc-id", () => {
			const result = expectRight(
				validateAcceptEditOptions({ docId: "doc-abc-123" }),
			);
			expect(result.docId).toBe("doc-abc-123");
		});

		test("rejects empty doc-id", () => {
			const error = expectLeft(validateAcceptEditOptions({ docId: "" }));
			expect(error._tag).toBe("UsageError");
			expect(getErrorMessage(error)).toContain("doc-id");
		});

		test("rejects whitespace-only doc-id", () => {
			const error = expectLeft(validateAcceptEditOptions({ docId: "   " }));
			expect(error._tag).toBe("UsageError");
		});

		test("trims doc-id whitespace", () => {
			const result = expectRight(
				validateAcceptEditOptions({ docId: "  doc-1  " }),
			);
			expect(result.docId).toBe("doc-1");
		});
	});
});
