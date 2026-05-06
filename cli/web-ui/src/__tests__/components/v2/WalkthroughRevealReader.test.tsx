import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { WalkthroughDeck } from "@/lib/walkthrough-slide-source";

let importVersion = 0;
let rejectInitialize = false;
let fullscreenElement: Element | null = null;
const revealInstances: MockReveal[] = [];
const RevealNotesMock = mock(() => ({ id: "notes" }));
const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const requestFullscreenMock = mock(function requestFullscreen(this: Element) {
	fullscreenElement = this;
	document.dispatchEvent(new Event("fullscreenchange"));
	return Promise.resolve();
});
const exitFullscreenMock = mock(() => {
	fullscreenElement = null;
	document.dispatchEvent(new Event("fullscreenchange"));
	return Promise.resolve();
});

class MockReveal {
	readonly root: HTMLElement;
	readonly options: unknown;
	readonly handlers = new Map<string, EventListener>();
	current = { groupIndex: 0, verticalIndex: 0 };
	initialized = false;
	destroyed = false;
	offCount = 0;
	layoutCount = 0;

	constructor(root: HTMLElement, options: unknown) {
		this.root = root;
		this.options = options;
		revealInstances.push(this);
	}

	on(eventName: string, handler: EventListener) {
		this.handlers.set(eventName, handler);
	}

	off(eventName: string, handler: EventListener) {
		if (this.handlers.get(eventName) === handler) {
			this.handlers.delete(eventName);
		}
		this.offCount += 1;
	}

	async initialize() {
		if (rejectInitialize) {
			throw new Error("Reveal initialization failed");
		}
		this.initialized = true;
	}

	sync() {}

	layout() {
		this.layoutCount += 1;
	}

	destroy() {
		this.destroyed = true;
	}

	getCurrentSlide(): HTMLElement {
		return this.findSlide(this.current) ?? this.slides()[0] ?? this.root;
	}

	availableRoutes() {
		const maxGroupIndex = this.maxGroupIndex();
		const maxVerticalIndex = this.maxVerticalIndex(this.current.groupIndex);

		return {
			left: this.current.groupIndex > 0,
			right: this.current.groupIndex < maxGroupIndex,
			up: this.current.verticalIndex > 0,
			down: this.current.verticalIndex < maxVerticalIndex,
		};
	}

	getTotalSlides() {
		return this.slides().length;
	}

	getSlidePastCount(slide: HTMLElement) {
		return Math.max(this.slides().indexOf(slide), 0);
	}

	left() {
		if (this.availableRoutes().left) {
			this.current = {
				groupIndex: this.current.groupIndex - 1,
				verticalIndex: 0,
			};
		}
		this.emitSlideChanged();
	}

	right() {
		if (this.availableRoutes().right) {
			this.current = {
				groupIndex: this.current.groupIndex + 1,
				verticalIndex: 0,
			};
		}
		this.emitSlideChanged();
	}

	up() {
		if (this.availableRoutes().up) {
			this.current = {
				...this.current,
				verticalIndex: this.current.verticalIndex - 1,
			};
		}
		this.emitSlideChanged();
	}

	down() {
		if (this.availableRoutes().down) {
			this.current = {
				...this.current,
				verticalIndex: this.current.verticalIndex + 1,
			};
		}
		this.emitSlideChanged();
	}

	private emitSlideChanged() {
		this.handlers.get("slidechanged")?.(new Event("slidechanged"));
	}

	private slides() {
		return Array.from(
			this.root.querySelectorAll<HTMLElement>("[data-slide-id]"),
		);
	}

	private findSlide({
		groupIndex,
		verticalIndex,
	}: {
		readonly groupIndex: number;
		readonly verticalIndex: number;
	}) {
		return (
			this.slides().find(
				(slide) =>
					Number(slide.dataset.rp1HorizontalIndex) === groupIndex &&
					Number(slide.dataset.rp1VerticalIndex) === verticalIndex,
			) ?? null
		);
	}

	private maxGroupIndex() {
		return Math.max(
			0,
			...this.slides().map((slide) =>
				Number(slide.dataset.rp1HorizontalIndex ?? 0),
			),
		);
	}

	private maxVerticalIndex(groupIndex: number) {
		return Math.max(
			0,
			...this.slides()
				.filter(
					(slide) =>
						Number(slide.dataset.rp1HorizontalIndex ?? 0) === groupIndex,
				)
				.map((slide) => Number(slide.dataset.rp1VerticalIndex ?? 0)),
		);
	}
}

mock.module("reveal.js", () => ({
	default: MockReveal,
}));

mock.module("reveal.js/plugin/notes", () => ({
	default: RevealNotesMock,
}));

mock.module("@/components/MarkdownViewer", () => ({
	MarkdownViewer: ({
		content,
		path,
	}: {
		readonly content: string;
		readonly path: string;
	}) => (
		<div data-testid="markdown-viewer" data-path={path}>
			{content}
		</div>
	),
}));

const deck: WalkthroughDeck = {
	title: "Checkout Reader Walkthrough",
	reviewId: "pr-42",
	evidenceIds: ["E-PR-001", "E-DIFF-001", "E-FILE-001"],
	slides: [
		{
			horizontal: {
				id: "slide-001",
				role: "at-a-glance",
				depth: 0,
				evidenceIds: ["E-PR-001"],
				markdown: "## At A Glance\n\nIntro cites E-PR-001.",
				notesMarkdown: "Intro notes preserve E-PR-001.",
			},
			vertical: [
				{
					id: "slide-001-detail-001",
					role: "implementation-depth",
					depth: 1,
					evidenceIds: ["E-DIFF-001"],
					markdown: "### Implementation Depth\n\nDetail cites E-DIFF-001.",
					notesMarkdown: "Detail notes preserve E-DIFF-001.",
				},
			],
		},
		{
			horizontal: {
				id: "slide-002",
				role: "reviewer-focus",
				depth: 0,
				evidenceIds: ["E-FILE-001"],
				markdown: "## Reviewer Focus\n\nCheck E-FILE-001.",
				notesMarkdown: null,
			},
			vertical: [],
		},
	],
};

async function importReader() {
	return import(
		`../../../components/v2/WalkthroughRevealReader.tsx?reader-test=${++importVersion}`
	);
}

async function renderReader({
	onMarkdownModeRequested,
	onRenderFailure,
}: {
	readonly onMarkdownModeRequested?: () => void;
	readonly onRenderFailure?: (message: string) => void;
} = {}) {
	const { WalkthroughRevealReader } = await importReader();

	return render(
		<WalkthroughRevealReader
			deck={deck}
			path=".rp1/work/pr-walkthroughs/pr-42-walkthrough-001.md"
			onMarkdownModeRequested={onMarkdownModeRequested}
			onRenderFailure={onRenderFailure}
		/>,
	);
}

describe("WalkthroughRevealReader", () => {
	beforeEach(() => {
		rejectInitialize = false;
		fullscreenElement = null;
		requestFullscreenMock.mockClear();
		exitFullscreenMock.mockClear();
		RevealNotesMock.mockClear();
		revealInstances.length = 0;
		globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
			callback(0);
			return 0;
		}) as typeof requestAnimationFrame;
		Object.defineProperty(document, "fullscreenElement", {
			configurable: true,
			get: () => fullscreenElement,
		});
		Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
			configurable: true,
			value: requestFullscreenMock,
		});
		Object.defineProperty(document, "exitFullscreen", {
			configurable: true,
			value: exitFullscreenMock,
		});
	});

	afterEach(() => {
		cleanup();
		mock.restore();
		if (originalRequestAnimationFrame) {
			globalThis.requestAnimationFrame = originalRequestAnimationFrame;
		} else {
			Reflect.deleteProperty(globalThis, "requestAnimationFrame");
		}
		Reflect.deleteProperty(document, "fullscreenElement");
		Reflect.deleteProperty(document, "exitFullscreen");
		Reflect.deleteProperty(HTMLElement.prototype, "requestFullscreen");
	});

	test("initializes Reveal after rendering the deck and destroys it on unmount", async () => {
		const view = await renderReader();

		await waitFor(() => {
			expect(revealInstances).toHaveLength(1);
			expect(revealInstances[0].initialized).toBe(true);
		});

		expect(screen.getByLabelText("Walkthrough slide deck")).toBeTruthy();
		const currentSlideNotes = view.container.querySelector(
			'[data-slide-id="slide-001"] aside.notes',
		);
		expect(currentSlideNotes?.textContent).toContain(
			"Intro notes preserve E-PR-001.",
		);
		expect(currentSlideNotes?.getAttribute("data-markdown")).toBe("true");
		expect(screen.queryByLabelText("Active slide notes")).toBeNull();
		expect(revealInstances[0].options).toMatchObject({
			embedded: true,
			height: 560,
			keyboardCondition: "focused",
			maxScale: 2.4,
			minScale: 0.35,
			plugins: [RevealNotesMock],
			scrollActivationWidth: 0,
			showNotes: false,
			width: 1440,
		});

		view.unmount();

		expect(revealInstances[0].offCount).toBe(1);
		expect(revealInstances[0].destroyed).toBe(true);
	});

	test("updates active notes, announcement, and focus after depth navigation", async () => {
		await renderReader();

		await waitFor(() => {
			expect(screen.queryByText("Loading slides")).toBeNull();
		});

		const previousSlide = screen.getByRole("button", {
			name: "Previous slide",
		}) as HTMLButtonElement;
		const previousDepth = screen.getByRole("button", {
			name: "Previous depth slide",
		}) as HTMLButtonElement;
		const nextDepth = screen.getByRole("button", {
			name: "Next depth slide",
		}) as HTMLButtonElement;
		const nextSlide = screen.getByRole("button", {
			name: "Next slide",
		}) as HTMLButtonElement;

		expect(previousSlide.disabled).toBe(true);
		expect(previousDepth.disabled).toBe(true);
		expect(nextDepth.disabled).toBe(false);
		expect(nextSlide.disabled).toBe(false);

		fireEvent.click(nextDepth);

		await waitFor(() => {
			expect(
				screen.getByText("Implementation Depth. Slide 2 / 3."),
			).toBeTruthy();
		});

		expect(
			revealInstances[0].getCurrentSlide().querySelector("aside.notes")
				?.textContent,
		).toContain("Detail notes preserve E-DIFF-001.");
		expect(screen.queryByLabelText("Active slide notes")).toBeNull();
		expect(screen.queryByText("Evidence")).toBeNull();
		expect(
			(
				screen.getByRole("button", {
					name: "Previous depth slide",
				}) as HTMLButtonElement
			).disabled,
		).toBe(false);
		expect(
			["Previous depth slide", "Next slide"].includes(
				document.activeElement?.getAttribute("aria-label") ?? "",
			),
		).toBe(true);
		expect((document.activeElement as HTMLButtonElement).disabled).toBe(false);
	});

	test("swallows unavailable keyboard navigation at depth boundaries", async () => {
		await renderReader();

		await waitFor(() => {
			expect(screen.queryByText("Loading slides")).toBeNull();
		});

		fireEvent.click(screen.getByRole("button", { name: "Next depth slide" }));

		await waitFor(() => {
			expect(
				screen.getByText("Implementation Depth. Slide 2 / 3."),
			).toBeTruthy();
		});

		const reader = screen.getByLabelText(
			"Checkout Reader Walkthrough walkthrough slide reader",
		);
		const event = new KeyboardEvent("keydown", {
			bubbles: true,
			cancelable: true,
			key: "ArrowDown",
		});

		reader.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
		expect(screen.getByText("Implementation Depth. Slide 2 / 3.")).toBeTruthy();
	});

	test("offers full screen mode without duplicating the markdown mode control", async () => {
		await renderReader({ onMarkdownModeRequested: mock(() => {}) });

		await waitFor(() => {
			expect(screen.queryByText("Loading slides")).toBeNull();
		});

		expect(screen.queryByRole("button", { name: "Markdown" })).toBeNull();

		const fullscreenButton = screen.getByRole("button", {
			name: "Enter full screen",
		});
		fireEvent.click(fullscreenButton);

		await waitFor(() => {
			expect(requestFullscreenMock).toHaveBeenCalledTimes(1);
			expect(
				screen.getByRole("button", { name: "Exit full screen" }),
			).toBeTruthy();
			expect(revealInstances[0].layoutCount).toBeGreaterThan(0);
		});

		fireEvent.click(screen.getByRole("button", { name: "Exit full screen" }));

		await waitFor(() => {
			expect(exitFullscreenMock).toHaveBeenCalledTimes(1);
			expect(
				screen.getByRole("button", { name: "Enter full screen" }),
			).toBeTruthy();
		});
	});

	test("reports initialization failures and keeps markdown recovery available", async () => {
		rejectInitialize = true;
		const onMarkdownModeRequested = mock(() => {});
		const onRenderFailure = mock(() => {});

		await renderReader({ onMarkdownModeRequested, onRenderFailure });

		await waitFor(() => {
			expect(onRenderFailure).toHaveBeenCalledWith(
				"Slide reader unavailable. Showing the markdown artifact instead.",
			);
		});

		expect(screen.getByText("Slide reader unavailable.")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Open markdown" }));

		expect(onMarkdownModeRequested).toHaveBeenCalledTimes(1);
	});
});
