import {
	ArrowDown,
	ArrowLeft,
	ArrowRight,
	ArrowUp,
	Loader2,
	Maximize2,
	Minimize2,
} from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RevealApi, RevealConfig } from "reveal.js";
import { MarkdownViewer } from "@/components/MarkdownViewer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
	WalkthroughDeck,
	WalkthroughSlide,
} from "@/lib/walkthrough-slide-source";

export interface WalkthroughRevealReaderProps {
	readonly deck: WalkthroughDeck;
	readonly path: string;
	readonly className?: string;
	readonly onMarkdownModeRequested?: () => void;
	readonly onRenderFailure?: (message: string) => void;
}

type NavigationDirection = "left" | "right" | "up" | "down";
type ReaderStatus = "loading" | "ready" | "failed";

interface RevealRoutes {
	readonly left: boolean;
	readonly right: boolean;
	readonly up: boolean;
	readonly down: boolean;
}

interface SlideLookupEntry {
	readonly slide: WalkthroughSlide;
	readonly flatIndex: number;
}

interface ActiveSlideState {
	readonly slide: WalkthroughSlide | null;
	readonly title: string;
	readonly position: string;
	readonly routes: RevealRoutes;
}

const EMPTY_ROUTES: RevealRoutes = {
	left: false,
	right: false,
	up: false,
	down: false,
};

const FALLBACK_FAILURE_MESSAGE =
	"Slide reader unavailable. Showing the markdown artifact instead.";

const NAVIGATION_KEY_DIRECTIONS: Partial<
	Readonly<Record<string, NavigationDirection>>
> = {
	ArrowLeft: "left",
	ArrowRight: "right",
	ArrowUp: "up",
	ArrowDown: "down",
};

const NAVIGATION_FOCUS_ORDER: Readonly<
	Record<NavigationDirection, readonly NavigationDirection[]>
> = {
	left: ["left", "right", "up", "down"],
	right: ["right", "left", "down", "up"],
	up: ["up", "down", "left", "right"],
	down: ["down", "up", "right", "left"],
};

const REVEAL_OPTIONS: RevealConfig = {
	width: 1440,
	height: 560,
	margin: 0.02,
	minScale: 0.35,
	maxScale: 2.4,
	embedded: true,
	controls: false,
	progress: false,
	hash: false,
	history: false,
	overview: false,
	center: false,
	keyboard: true,
	keyboardCondition: "focused",
	touch: true,
	transition: "slide",
	fragments: false,
	help: false,
	pause: false,
	scrollActivationWidth: 0,
	showNotes: false,
};

export function WalkthroughRevealReader({
	deck,
	path,
	className,
	onMarkdownModeRequested,
	onRenderFailure,
}: WalkthroughRevealReaderProps) {
	const readerRootRef = useRef<HTMLElement>(null);
	const deckRootRef = useRef<HTMLDivElement>(null);
	const revealRef = useRef<RevealApi | null>(null);
	const controlRefs = useRef<
		Record<NavigationDirection, HTMLButtonElement | null>
	>({
		left: null,
		right: null,
		up: null,
		down: null,
	});
	const [status, setStatus] = useState<ReaderStatus>("loading");
	const [isFullscreen, setIsFullscreen] = useState(false);
	const { entries, lookup } = useMemo(() => buildSlideLookup(deck), [deck]);
	const [activeSlide, setActiveSlide] = useState<ActiveSlideState>(() =>
		initialActiveSlide(entries, deck),
	);

	const reportRenderFailure = useCallback(() => {
		setStatus("failed");
		onRenderFailure?.(FALLBACK_FAILURE_MESSAGE);
	}, [onRenderFailure]);

	useEffect(() => {
		setActiveSlide(initialActiveSlide(entries, deck));
		setStatus("loading");
	}, [deck, entries]);

	const resolveActiveSlide = useCallback(
		(reveal: RevealApi) => {
			const currentSlide = reveal.getCurrentSlide();
			const slideElement = resolveSlideElement(currentSlide);
			const slideId = slideElement?.dataset.slideId ?? null;
			const entry = slideId ? lookup.get(slideId) : null;
			const fallbackEntry = entries[0] ?? null;
			const resolvedEntry = entry ?? fallbackEntry;
			const routes = reveal.availableRoutes({ includeFragments: false });
			const totalSlides = Math.max(reveal.getTotalSlides(), entries.length, 1);
			const flatIndex = slideElement
				? reveal.getSlidePastCount(slideElement)
				: (resolvedEntry?.flatIndex ?? 0);

			return {
				slide: resolvedEntry?.slide ?? null,
				title: resolvedEntry
					? extractSlideTitle(resolvedEntry.slide)
					: deck.title,
				position: `${Math.min(flatIndex + 1, totalSlides)} / ${totalSlides}`,
				routes,
			};
		},
		[deck.title, entries, lookup],
	);

	const syncActiveSlide = useCallback(
		(reveal: RevealApi): ActiveSlideState | null => {
			try {
				const nextActiveSlide = resolveActiveSlide(reveal);
				setActiveSlide(nextActiveSlide);
				return nextActiveSlide;
			} catch {
				reportRenderFailure();
				return null;
			}
		},
		[reportRenderFailure, resolveActiveSlide],
	);

	useEffect(() => {
		let disposed = false;
		let activeDeck: RevealApi | null = null;
		let slideChangedHandler: EventListener | null = null;
		const revealElement = deckRootRef.current;
		if (!revealElement) return;

		void Promise.all([import("reveal.js"), import("reveal.js/plugin/notes")])
			.then(async ([{ default: Reveal }, { default: RevealNotes }]) => {
				if (disposed) return;

				const reveal = new Reveal(revealElement, {
					...REVEAL_OPTIONS,
					plugins: [RevealNotes],
				});
				activeDeck = reveal;
				revealRef.current = reveal;
				slideChangedHandler = () => syncActiveSlide(reveal);
				reveal.on("slidechanged", slideChangedHandler);

				await reveal.initialize();
				if (disposed) return;

				reveal.sync();
				if (!syncActiveSlide(reveal)) return;
				setStatus("ready");
			})
			.catch((error: unknown) => {
				if (disposed) return;

				const message = renderFailureMessage(error);
				setStatus("failed");
				onRenderFailure?.(message);
			});

		return () => {
			disposed = true;
			if (activeDeck) {
				if (slideChangedHandler) {
					activeDeck.off("slidechanged", slideChangedHandler);
				}
				try {
					activeDeck.destroy();
				} catch {}
			}
			if (revealRef.current === activeDeck) {
				revealRef.current = null;
			}
		};
	}, [onRenderFailure, syncActiveSlide]);

	useEffect(() => {
		const syncFullscreenState = () => {
			setIsFullscreen(document.fullscreenElement === readerRootRef.current);

			requestAnimationFrame(() => {
				const reveal = revealRef.current;
				if (!reveal) return;

				reveal.layout();
				reveal.sync();
				syncActiveSlide(reveal);
			});
		};

		document.addEventListener("fullscreenchange", syncFullscreenState);
		return () => {
			document.removeEventListener("fullscreenchange", syncFullscreenState);
		};
	}, [syncActiveSlide]);

	const navigate = useCallback(
		(direction: NavigationDirection) => {
			const reveal = revealRef.current;
			if (!reveal) return;

			try {
				reveal[direction]();
			} catch {
				reportRenderFailure();
				return;
			}

			requestAnimationFrame(() => {
				const nextActiveSlide = syncActiveSlide(reveal);
				if (!nextActiveSlide) return;

				requestAnimationFrame(() => {
					focusNavigationControl(
						direction,
						nextActiveSlide.routes,
						controlRefs.current,
					);
				});
			});
		},
		[reportRenderFailure, syncActiveSlide],
	);

	const toggleFullscreen = useCallback(() => {
		const readerRoot = readerRootRef.current;
		if (!readerRoot) return;

		if (document.fullscreenElement === readerRoot) {
			void document.exitFullscreen();
			return;
		}

		void readerRoot.requestFullscreen();
	}, []);

	const handleReaderKeyDown = useCallback(
		(event: KeyboardEvent<HTMLElement>) => {
			if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
				return;
			}

			const target = event.target as HTMLElement;
			if (isTextInputTarget(target)) return;

			const direction = NAVIGATION_KEY_DIRECTIONS[event.key];
			if (!direction) return;

			event.preventDefault();
			event.stopPropagation();

			if (!activeSlide.routes[direction]) return;

			navigate(direction);
		},
		[activeSlide.routes, navigate],
	);

	const announcement =
		activeSlide.slide === null
			? deck.title
			: `${activeSlide.title}. Slide ${activeSlide.position}.`;

	return (
		<section
			ref={readerRootRef}
			className={cn(
				"rp1-walkthrough-reader flex h-full min-h-[640px] flex-col overflow-hidden rounded border border-border bg-background text-foreground",
				className,
			)}
			aria-label={`${deck.title} walkthrough slide reader`}
			onKeyDown={handleReaderKeyDown}
		>
			<header className="flex flex-col gap-3 border-b border-border px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
				<div className="min-w-0">
					<div className="type-caption text-fg-ghost">PR walkthrough</div>
					<h2 className="truncate text-sm font-medium leading-6 text-fg">
						{deck.title}
					</h2>
					<div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 type-secondary text-fg-muted">
						<span>{activeSlide.title}</span>
						<span aria-hidden="true">/</span>
						<span>{activeSlide.position}</span>
						{deck.reviewId ? (
							<>
								<span aria-hidden="true">/</span>
								<span className="truncate">{deck.reviewId}</span>
							</>
						) : null}
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<NavButton
						refCallback={(node) => {
							controlRefs.current.left = node;
						}}
						label="Previous slide"
						disabled={!activeSlide.routes.left}
						onClick={() => navigate("left")}
					>
						<ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
					</NavButton>
					<NavButton
						refCallback={(node) => {
							controlRefs.current.up = node;
						}}
						label="Previous depth slide"
						disabled={!activeSlide.routes.up}
						onClick={() => navigate("up")}
					>
						<ArrowUp className="h-4 w-4" strokeWidth={1.5} />
					</NavButton>
					<NavButton
						refCallback={(node) => {
							controlRefs.current.down = node;
						}}
						label="Next depth slide"
						disabled={!activeSlide.routes.down}
						onClick={() => navigate("down")}
					>
						<ArrowDown className="h-4 w-4" strokeWidth={1.5} />
					</NavButton>
					<NavButton
						refCallback={(node) => {
							controlRefs.current.right = node;
						}}
						label="Next slide"
						disabled={!activeSlide.routes.right}
						onClick={() => navigate("right")}
					>
						<ArrowRight className="h-4 w-4" strokeWidth={1.5} />
					</NavButton>
					<Button
						type="button"
						variant="outline"
						size="icon"
						className="h-8 w-8"
						aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
						title={isFullscreen ? "Exit full screen" : "Enter full screen"}
						onClick={toggleFullscreen}
					>
						{isFullscreen ? (
							<Minimize2 className="h-4 w-4" strokeWidth={1.5} />
						) : (
							<Maximize2 className="h-4 w-4" strokeWidth={1.5} />
						)}
					</Button>
				</div>
			</header>
			<div className="relative flex min-h-[520px] flex-1 overflow-hidden">
				{status === "loading" ? (
					<div className="absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded border border-border bg-background/90 px-2 py-1 type-secondary text-fg-muted">
						<Loader2 className="h-3.5 w-3.5 animate-spin" />
						<span>Loading slides</span>
					</div>
				) : null}
				{status === "failed" ? (
					<div className="absolute inset-x-4 top-4 z-20 rounded border border-border bg-background/95 px-3 py-2 type-secondary text-fg-muted">
						Slide reader unavailable.
						{onMarkdownModeRequested ? (
							<Button
								type="button"
								variant="link"
								size="sm"
								className="ml-2 h-auto px-0 py-0 text-xs"
								onClick={onMarkdownModeRequested}
							>
								Open markdown
							</Button>
						) : null}
					</div>
				) : null}
				<section
					ref={deckRootRef}
					className="reveal rp1-walkthrough-reveal-root"
					aria-label="Walkthrough slide deck"
				>
					<div className="slides">
						{deck.slides.map((group, groupIndex) =>
							group.vertical.length > 0 ? (
								<section key={group.horizontal.id}>
									<SlideSection
										slide={group.horizontal}
										path={path}
										groupIndex={groupIndex}
										verticalIndex={0}
									/>
									{group.vertical.map((slide, verticalIndex) => (
										<SlideSection
											key={slide.id}
											slide={slide}
											path={path}
											groupIndex={groupIndex}
											verticalIndex={verticalIndex + 1}
										/>
									))}
								</section>
							) : (
								<SlideSection
									key={group.horizontal.id}
									slide={group.horizontal}
									path={path}
									groupIndex={groupIndex}
									verticalIndex={0}
								/>
							),
						)}
					</div>
				</section>
			</div>
			<div className="sr-only" aria-live="polite" aria-atomic="true">
				{announcement}
			</div>
		</section>
	);
}

function SlideSection({
	slide,
	path,
	groupIndex,
	verticalIndex,
}: {
	readonly slide: WalkthroughSlide;
	readonly path: string;
	readonly groupIndex: number;
	readonly verticalIndex: number;
}) {
	const title = extractSlideTitle(slide);

	return (
		<section
			data-slide-id={slide.id}
			aria-label={title}
			data-rp1-horizontal-index={groupIndex}
			data-rp1-vertical-index={verticalIndex}
		>
			<div className="rp1-walkthrough-slide-content">
				<MarkdownViewer
					content={slide.markdown}
					path={`${path}#${slide.id}`}
					enableAnnotations={false}
					className="rp1-walkthrough-slide-markdown"
					headingIdPrefix={`slide-${slide.id}-`}
				/>
			</div>
			{slide.notesMarkdown ? (
				<aside className="notes" data-markdown={true}>
					{slide.notesMarkdown}
				</aside>
			) : null}
		</section>
	);
}

function NavButton({
	children,
	disabled,
	label,
	onClick,
	refCallback,
}: {
	readonly children: ReactNode;
	readonly disabled: boolean;
	readonly label: string;
	readonly onClick: () => void;
	readonly refCallback: (node: HTMLButtonElement | null) => void;
}) {
	return (
		<Button
			ref={refCallback}
			type="button"
			variant="outline"
			size="icon"
			className="h-8 w-8"
			aria-label={label}
			title={label}
			disabled={disabled}
			onClick={onClick}
		>
			{children}
		</Button>
	);
}

function buildSlideLookup(deck: WalkthroughDeck): {
	readonly entries: readonly SlideLookupEntry[];
	readonly lookup: ReadonlyMap<string, SlideLookupEntry>;
} {
	const entries: SlideLookupEntry[] = [];

	for (const group of deck.slides) {
		entries.push({
			slide: group.horizontal,
			flatIndex: entries.length,
		});

		for (const slide of group.vertical) {
			entries.push({
				slide,
				flatIndex: entries.length,
			});
		}
	}

	return {
		entries,
		lookup: new Map(entries.map((entry) => [entry.slide.id, entry])),
	};
}

function initialActiveSlide(
	entries: readonly SlideLookupEntry[],
	deck: WalkthroughDeck,
): ActiveSlideState {
	const entry = entries[0] ?? null;

	return {
		slide: entry?.slide ?? null,
		title: entry ? extractSlideTitle(entry.slide) : deck.title,
		position: entries.length > 0 ? `1 / ${entries.length}` : "0 / 0",
		routes: {
			...EMPTY_ROUTES,
			right: deck.slides.length > 1,
			down: (deck.slides[0]?.vertical.length ?? 0) > 0,
		},
	};
}

function extractSlideTitle(slide: WalkthroughSlide): string {
	const heading = slide.markdown.match(/^#{1,3}\s+(.+?)\s*$/m)?.[1]?.trim();
	if (heading) return heading.replace(/[`*_]/g, "");
	if (slide.role) return slide.role.replace(/[-_]/g, " ");
	return slide.id;
}

function resolveSlideElement(currentSlide: HTMLElement): HTMLElement | null {
	if (currentSlide.dataset.slideId) return currentSlide;
	return (
		currentSlide.querySelector<HTMLElement>("[data-slide-id].present") ??
		currentSlide.querySelector<HTMLElement>("[data-slide-id]")
	);
}

function focusNavigationControl(
	preferredDirection: NavigationDirection,
	routes: RevealRoutes,
	controls: Readonly<Record<NavigationDirection, HTMLButtonElement | null>>,
) {
	for (const direction of NAVIGATION_FOCUS_ORDER[preferredDirection]) {
		const control = controls[direction];
		if (routes[direction] && control && !control.disabled) {
			control.focus();
			return;
		}
	}

	controls[preferredDirection]?.focus();
}

function isTextInputTarget(target: HTMLElement): boolean {
	return (
		target.tagName === "INPUT" ||
		target.tagName === "TEXTAREA" ||
		target.isContentEditable
	);
}

function renderFailureMessage(_error: unknown): string {
	return FALLBACK_FAILURE_MESSAGE;
}
