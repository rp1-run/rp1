import {
	AlertTriangle,
	Box,
	ChevronLeft,
	ChevronRight,
	ExternalLink,
	GitBranch,
	Maximize2,
	Minimize2,
	Network,
	PanelRightOpen,
} from "lucide-react";
import type {
	ReactNode,
	PointerEvent as ReactPointerEvent,
	RefObject,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
	CSS2DObject,
	CSS2DRenderer,
} from "three/addons/renderers/CSS2DRenderer.js";
import { Button } from "@/components/ui/button";
import {
	buildCodeTourSceneLayout,
	type CodeTourLayoutPoint,
} from "@/lib/code-tour-layout";
import {
	type CodeTourViewConcept,
	type CodeTourViewEdge,
	type CodeTourViewFragment,
	type CodeTourViewModel,
	type CodeTourViewStep,
	codeLinePrefix,
	codeLineText,
} from "@/lib/code-tour-view-model";
import { cn } from "@/lib/utils";

import "./CodeTour3DReader.css";

export interface CodeTour3DReaderProps {
	readonly tour: CodeTourViewModel;
	readonly path: string;
	readonly className?: string;
	readonly onSourceModeRequested?: () => void;
	readonly onRenderFailure?: (message: string) => void;
}

type TourSceneMode = "concept" | "fragment";
type RenderState = "checking" | "ready" | "unsupported" | "failed" | "reduced";
type SceneNodeKind = "concept" | "fragment";
type CodeTourTheme = "light" | "dark";

interface SceneNode {
	readonly id: string;
	readonly kind: SceneNodeKind;
	readonly conceptId: string;
	readonly group: THREE.Group;
	readonly target: THREE.Vector3;
	readonly hitMesh: THREE.Mesh;
	readonly bodyMaterial: THREE.MeshBasicMaterial;
	readonly edgeMaterial: THREE.LineBasicMaterial;
	readonly pole: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
	readonly poleMaterial: THREE.LineBasicMaterial;
	readonly labelObject: CSS2DObject;
	readonly labelElement: HTMLButtonElement;
	readonly baseScale: number;
	readonly glowColor: THREE.Color;
}

interface SceneEdge {
	readonly edge: CodeTourViewEdge;
	readonly curve: THREE.QuadraticBezierCurve3;
	readonly line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
	readonly material: THREE.LineBasicMaterial;
	readonly geometry: THREE.BufferGeometry;
	readonly particlePoints: THREE.Points<
		THREE.BufferGeometry,
		THREE.PointsMaterial
	>;
	readonly particleGeometry: THREE.BufferGeometry;
	readonly particleMaterial: THREE.PointsMaterial;
	readonly particleBaseColor: THREE.Color;
	readonly particleOffsets: readonly number[];
	readonly labelObject: CSS2DObject;
	readonly labelElement: HTMLDivElement;
}

interface FragmentTetherRefs {
	readonly card: RefObject<HTMLElement>;
	readonly svg: RefObject<SVGSVGElement>;
	readonly glow: RefObject<SVGPathElement>;
	readonly line: RefObject<SVGPathElement>;
	readonly nodeCap: RefObject<SVGCircleElement>;
	readonly cardCap: RefObject<SVGCircleElement>;
}

interface SceneHandles {
	readonly renderer: THREE.WebGLRenderer;
	readonly labelRenderer: CSS2DRenderer;
	readonly scene: THREE.Scene;
	readonly theme: CodeTourTheme;
	readonly ambientPoints: THREE.Points<
		THREE.BufferGeometry,
		THREE.PointsMaterial
	>;
	readonly camera: THREE.PerspectiveCamera;
	readonly controls: OrbitControls;
	readonly stage: HTMLDivElement;
	readonly fragmentTether: FragmentTetherRefs;
	readonly conceptNodes: ReadonlyMap<string, SceneNode>;
	readonly fragmentNodes: ReadonlyMap<string, SceneNode>;
	readonly conceptEdges: readonly SceneEdge[];
	readonly fragmentEdges: readonly SceneEdge[];
	readonly focusPosition: THREE.Vector3;
	readonly focusTarget: THREE.Vector3;
	autoFocusActive: boolean;
	animationFrame: number | null;
	dispose: () => void;
}

interface ReaderStateRef {
	readonly mode: TourSceneMode;
	readonly activeConceptId: string;
	readonly activeFragmentId: string;
}

interface FragmentCardDragState {
	dragging: boolean;
	pointerId: number | null;
	startX: number;
	startY: number;
	baseX: number;
	baseY: number;
	x: number;
	y: number;
}

const FRAGMENT_CARD_MARGIN = 16;
const NODE_GEOMETRY = new THREE.DodecahedronGeometry(0.82);
const NODE_EDGE_GEOMETRY = new THREE.EdgesGeometry(NODE_GEOMETRY);
const NODE_LABEL_POLE_GEOMETRY = new THREE.BufferGeometry().setFromPoints([
	new THREE.Vector3(0, 0.42, 0),
	new THREE.Vector3(0, 1.58, 0),
]);
const EDGE_PARTICLES_PER_EDGE = 4;
const EDGE_PARTICLE_SPEED = 0.075;
const EDGE_PARTICLE_VECTOR = new THREE.Vector3();
const EDGE_PARTICLE_TARGET_COLOR = new THREE.Color();
const EDGE_PARTICLE_ACCENT_COLOR = new THREE.Color();
const NODE_TARGET_COLOR = new THREE.Color();
const SCENE_THEME: Readonly<
	Record<
		CodeTourTheme,
		{
			readonly clear: number;
			readonly fog: number;
			readonly fogDensity: number;
			readonly ambient: number;
			readonly ambientOpacity: number;
			readonly ambientSize: number;
			readonly glow: number;
			readonly glowHot: number;
			readonly edgeParticle: number;
			readonly edgeParticleOpacity: number;
			readonly edgeParticleActiveOpacity: number;
			readonly edgeParticleSize: number;
		}
	>
> = {
	light: {
		clear: 0xeaf2eb,
		fog: 0xe8f0ea,
		fogDensity: 0.014,
		ambient: 0x128071,
		ambientOpacity: 0.24,
		ambientSize: 0.046,
		glow: 0x0b695f,
		glowHot: 0x1f9f84,
		edgeParticle: 0x147c6f,
		edgeParticleOpacity: 0,
		edgeParticleActiveOpacity: 0.24,
		edgeParticleSize: 0.052,
	},
	dark: {
		clear: 0x031814,
		fog: 0x031814,
		fogDensity: 0.02,
		ambient: 0x5dffc4,
		ambientOpacity: 0.5,
		ambientSize: 0.064,
		glow: 0x5dffc4,
		glowHot: 0xc4ffe6,
		edgeParticle: 0xa5ffdf,
		edgeParticleOpacity: 0,
		edgeParticleActiveOpacity: 0.48,
		edgeParticleSize: 0.072,
	},
};
const TOKEN_CLASS: Readonly<Record<string, string>> = {
	kw: "rp1-code-tour-token-keyword",
	fn: "rp1-code-tour-token-function",
	str: "rp1-code-tour-token-string",
	num: "rp1-code-tour-token-number",
	cmt: "rp1-code-tour-token-comment",
	type: "rp1-code-tour-token-type",
};

export function CodeTour3DReader({
	tour,
	path,
	className,
	onSourceModeRequested,
	onRenderFailure,
}: CodeTour3DReaderProps) {
	const rootRef = useRef<HTMLElement>(null);
	const stageRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const overlayRef = useRef<HTMLDivElement>(null);
	const fragmentCardRef = useRef<HTMLElement>(null);
	const tetherSvgRef = useRef<SVGSVGElement>(null);
	const tetherGlowRef = useRef<SVGPathElement>(null);
	const tetherLineRef = useRef<SVGPathElement>(null);
	const tetherNodeCapRef = useRef<SVGCircleElement>(null);
	const tetherCardCapRef = useRef<SVGCircleElement>(null);
	const handlesRef = useRef<SceneHandles | null>(null);
	const onRenderFailureRef = useRef(onRenderFailure);
	const lastFailureRef = useRef<string | null>(null);
	const fragmentCardDragRef = useRef<FragmentCardDragState>({
		dragging: false,
		pointerId: null,
		startX: 0,
		startY: 0,
		baseX: 0,
		baseY: 0,
		x: 0,
		y: 0,
	});
	const prefersReducedMotion = usePrefersReducedMotion();
	const theme = useDocumentTheme();
	const firstConceptId = tour.concepts[0]?.id ?? "";
	const firstStep = tour.steps[0] ?? null;
	const initialConceptId = firstStep?.conceptId ?? firstConceptId;
	const initialFragmentId =
		firstFragmentForConcept(tour, initialConceptId)?.id ??
		tour.fragments[0]?.id ??
		"";
	const [mode, setMode] = useState<TourSceneMode>("concept");
	const [activeStepIndex, setActiveStepIndex] = useState(firstStep?.index ?? 0);
	const [activeConceptId, setActiveConceptId] = useState(initialConceptId);
	const [activeFragmentId, setActiveFragmentId] = useState(initialFragmentId);
	const [renderState, setRenderState] = useState<RenderState>("checking");
	const [isFullscreen, setIsFullscreen] = useState(false);
	const readerStateRef = useRef<ReaderStateRef>({
		mode,
		activeConceptId,
		activeFragmentId,
	});

	const activeConcept =
		tour.conceptById.get(activeConceptId) ?? tour.concepts[0] ?? null;
	const activeFragment =
		tour.fragmentById.get(activeFragmentId) ??
		(activeConcept
			? firstFragmentForConcept(tour, activeConcept.id)
			: tour.fragments[0]) ??
		null;
	const activeStep = tour.steps[activeStepIndex] ?? tour.steps[0] ?? null;
	const conceptFragments = activeConcept
		? (tour.fragmentsByConceptId.get(activeConcept.id) ?? [])
		: [];
	const activeRelationships = useMemo(
		() =>
			mode === "concept" && activeConcept
				? relationshipsFor(tour.conceptEdges, activeConcept.id)
				: activeFragment
					? relationshipsFor(tour.fragmentEdges, activeFragment.id)
					: [],
		[
			activeConcept,
			activeFragment,
			mode,
			tour.conceptEdges,
			tour.fragmentEdges,
		],
	);

	useEffect(() => {
		onRenderFailureRef.current = onRenderFailure;
	}, [onRenderFailure]);

	useEffect(() => {
		const nextStep = tour.steps[0] ?? null;
		const nextConceptId = nextStep?.conceptId ?? tour.concepts[0]?.id ?? "";
		const nextFragmentId =
			firstFragmentForConcept(tour, nextConceptId)?.id ??
			tour.fragments[0]?.id ??
			"";

		setMode("concept");
		setActiveStepIndex(nextStep?.index ?? 0);
		setActiveConceptId(nextConceptId);
		setActiveFragmentId(nextFragmentId);
	}, [tour]);

	useEffect(() => {
		readerStateRef.current = {
			mode,
			activeConceptId,
			activeFragmentId,
		};
	}, [activeConceptId, activeFragmentId, mode]);

	const reportRenderFailure = useCallback(
		(
			nextState: Extract<RenderState, "unsupported" | "failed">,
			message: string,
		) => {
			setRenderState(nextState);
			if (lastFailureRef.current === message) return;
			lastFailureRef.current = message;
			onRenderFailureRef.current?.(message);
		},
		[],
	);

	const selectConcept = useCallback(
		(conceptId: string, preferredFragmentId?: string) => {
			const concept = tour.conceptById.get(conceptId);
			if (!concept) return;

			const stepIndex = tour.steps.findIndex(
				(step) => step.conceptId === concept.id,
			);
			const fragment =
				(preferredFragmentId
					? tour.fragmentById.get(preferredFragmentId)
					: null) ?? firstFragmentForConcept(tour, concept.id);

			setActiveConceptId(concept.id);
			if (fragment) setActiveFragmentId(fragment.id);
			if (stepIndex >= 0) setActiveStepIndex(stepIndex);
		},
		[tour],
	);

	const selectFragment = useCallback(
		(fragmentId: string) => {
			const fragment = tour.fragmentById.get(fragmentId);
			if (!fragment) return;
			setActiveFragmentId(fragment.id);
			selectConcept(fragment.conceptId, fragment.id);
		},
		[selectConcept, tour.fragmentById],
	);

	const selectStep = useCallback(
		(index: number) => {
			const step = tour.steps[index];
			if (!step) return;
			setActiveStepIndex(index);
			selectConcept(step.conceptId);
		},
		[selectConcept, tour.steps],
	);

	const navigateRelationship = useCallback(
		(edge: CodeTourViewEdge) => {
			if (mode === "concept") {
				selectConcept(relationshipNavigationTarget(edge, activeConceptId));
				return;
			}
			selectFragment(relationshipNavigationTarget(edge, activeFragmentId));
		},
		[activeConceptId, activeFragmentId, mode, selectConcept, selectFragment],
	);

	const startFragmentCardDrag = useCallback(
		(event: ReactPointerEvent<HTMLElement>) => {
			if (isInteractiveTarget(event.target)) return;
			const card = fragmentCardRef.current;
			if (!card) return;

			const drag = fragmentCardDragRef.current;
			drag.dragging = true;
			drag.pointerId = event.pointerId;
			drag.startX = event.clientX;
			drag.startY = event.clientY;
			drag.baseX = drag.x;
			drag.baseY = drag.y;

			event.currentTarget.style.cursor = "grabbing";
			event.currentTarget.setPointerCapture(event.pointerId);
			event.preventDefault();
		},
		[],
	);

	const moveFragmentCardDrag = useCallback(
		(event: ReactPointerEvent<HTMLElement>) => {
			const drag = fragmentCardDragRef.current;
			const card = fragmentCardRef.current;
			if (!drag.dragging || drag.pointerId !== event.pointerId || !card) return;

			drag.x = drag.baseX + event.clientX - drag.startX;
			drag.y = drag.baseY + event.clientY - drag.startY;
			card.style.setProperty("--drag-x", `${drag.x}px`);
			card.style.setProperty("--drag-y", `${drag.y}px`);
		},
		[],
	);

	const endFragmentCardDrag = useCallback(
		(event: ReactPointerEvent<HTMLElement>) => {
			const drag = fragmentCardDragRef.current;
			if (!drag.dragging || drag.pointerId !== event.pointerId) return;

			drag.dragging = false;
			drag.pointerId = null;
			event.currentTarget.style.cursor = "grab";
			try {
				event.currentTarget.releasePointerCapture(event.pointerId);
			} catch {}
		},
		[],
	);

	const toggleFullscreen = useCallback(() => {
		const root = rootRef.current;
		if (!root) return;

		if (document.fullscreenElement === root) {
			void document.exitFullscreen();
			return;
		}
		void root.requestFullscreen();
	}, []);

	useEffect(() => {
		const syncFullscreen = () => {
			const isActive = document.fullscreenElement === rootRef.current;
			setIsFullscreen(isActive);
			requestAnimationFrame(() => {
				resizeScene(handlesRef.current, stageRef.current);
			});
		};

		document.addEventListener("fullscreenchange", syncFullscreen);
		return () =>
			document.removeEventListener("fullscreenchange", syncFullscreen);
	}, []);

	useEffect(() => {
		if (!activeStep) return;
		focusSceneTarget(handlesRef.current, readerStateRef.current);
	}, [activeStep]);

	useEffect(() => {
		const canvas = canvasRef.current;
		const overlay = overlayRef.current;
		const stage = stageRef.current;
		if (!canvas || !overlay || !stage) return;

		handlesRef.current?.dispose();
		handlesRef.current = null;
		lastFailureRef.current = null;

		if (prefersReducedMotion) {
			setRenderState("reduced");
			return;
		}

		if (!isWebGlAvailable(canvas)) {
			reportRenderFailure(
				"unsupported",
				"3D Code Tour unavailable because WebGL is not available in this browser.",
			);
			return;
		}

		try {
			const handles = createScene({
				tour,
				theme,
				canvas,
				overlay,
				stage,
				stateRef: readerStateRef,
				fragmentTether: {
					card: fragmentCardRef,
					svg: tetherSvgRef,
					glow: tetherGlowRef,
					line: tetherLineRef,
					nodeCap: tetherNodeCapRef,
					cardCap: tetherCardCapRef,
				},
				onConceptSelected: selectConcept,
				onFragmentSelected: selectFragment,
			});
			handlesRef.current = handles;
			setRenderState("ready");
			focusSceneTarget(handles, readerStateRef.current);
			handles.animationFrame = requestAnimationFrame(() =>
				animateScene(handles, readerStateRef),
			);
		} catch (error) {
			reportRenderFailure("failed", renderFailureMessage(error));
		}

		return () => {
			handlesRef.current?.dispose();
			handlesRef.current = null;
		};
	}, [
		prefersReducedMotion,
		reportRenderFailure,
		selectConcept,
		selectFragment,
		theme,
		tour,
	]);

	const canGoPrevious = activeStepIndex > 0;
	const canGoNext = activeStepIndex < tour.steps.length - 1;
	const sceneUnavailable = renderState !== "ready";
	const diagnosticKind =
		renderState === "reduced"
			? "reduced"
			: renderState === "unsupported"
				? "unsupported"
				: renderState === "failed"
					? "failed"
					: "checking";

	return (
		<section
			ref={rootRef}
			className={cn("rp1-code-tour", className)}
			onKeyDown={(event) => {
				if (isTextEntryTarget(event.target)) return;
				if (event.key === "ArrowRight" && canGoNext) {
					event.preventDefault();
					selectStep(activeStepIndex + 1);
				}
				if (event.key === "ArrowLeft" && canGoPrevious) {
					event.preventDefault();
					selectStep(activeStepIndex - 1);
				}
			}}
			aria-label={`Code Tour for ${tour.title}`}
			data-code-tour-theme={theme}
		>
			<div ref={stageRef} className="rp1-code-tour-stage">
				<canvas
					ref={canvasRef}
					className={cn(
						"rp1-code-tour-canvas",
						sceneUnavailable && "rp1-code-tour-canvas-hidden",
					)}
				/>
				<div
					ref={overlayRef}
					className={cn(
						"rp1-code-tour-label-layer",
						sceneUnavailable && "rp1-code-tour-label-layer-hidden",
					)}
				/>
				{sceneUnavailable && (
					<CodeTourDiagnosticState
						kind={diagnosticKind}
						tour={tour}
						activeStep={activeStep}
						activeStepIndex={activeStepIndex}
						stepCount={Math.max(tour.steps.length, 1)}
						activeConcept={activeConcept}
						activeFragment={activeFragment}
						conceptFragments={conceptFragments}
						activeRelationships={activeRelationships}
						onConceptSelected={selectConcept}
						onFragmentSelected={(fragmentId) => {
							setMode("fragment");
							selectFragment(fragmentId);
						}}
						onRelationshipSelected={navigateRelationship}
					/>
				)}

				<header className="rp1-code-tour-hud">
					<div className="rp1-code-tour-hud-copy">
						<p className="rp1-code-tour-source">{tour.sourceLabel}</p>
						<h2>{tour.title}</h2>
						<p>{path}</p>
					</div>
					<div className="rp1-code-tour-toolbar">
						<div
							className="rp1-code-tour-segment"
							role="tablist"
							aria-label="Code Tour layout"
						>
							<button
								type="button"
								role="tab"
								aria-selected={mode === "concept"}
								className={mode === "concept" ? "active" : undefined}
								onClick={() => setMode("concept")}
							>
								<Network className="h-3.5 w-3.5" strokeWidth={1.6} />
								<span>Concepts</span>
							</button>
							<button
								type="button"
								role="tab"
								aria-selected={mode === "fragment"}
								className={mode === "fragment" ? "active" : undefined}
								onClick={() => setMode("fragment")}
							>
								<GitBranch className="h-3.5 w-3.5" strokeWidth={1.6} />
								<span>Fragments</span>
							</button>
						</div>
						{onSourceModeRequested && (
							<IconButton
								label="Show source JSON"
								onClick={onSourceModeRequested}
								icon={
									<PanelRightOpen className="h-3.5 w-3.5" strokeWidth={1.6} />
								}
							/>
						)}
						<IconButton
							label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
							onClick={toggleFullscreen}
							icon={
								isFullscreen ? (
									<Minimize2 className="h-3.5 w-3.5" strokeWidth={1.6} />
								) : (
									<Maximize2 className="h-3.5 w-3.5" strokeWidth={1.6} />
								)
							}
						/>
					</div>
				</header>

				{!sceneUnavailable && activeFragment && (
					<>
						<svg
							ref={tetherSvgRef}
							className="rp1-code-tour-fragment-tether"
							aria-hidden="true"
						>
							<path
								ref={tetherGlowRef}
								className="rp1-code-tour-fragment-tether-glow"
							/>
							<path
								ref={tetherLineRef}
								className="rp1-code-tour-fragment-tether-line"
							/>
							<circle
								ref={tetherNodeCapRef}
								className="rp1-code-tour-fragment-tether-cap"
								r="3.2"
							/>
							<circle
								ref={tetherCardCapRef}
								className="rp1-code-tour-fragment-tether-cap"
								r="3.2"
							/>
						</svg>
						<FloatingStepCard
							cardRef={fragmentCardRef}
							activeStep={activeStep}
							activeStepIndex={activeStepIndex}
							stepCount={Math.max(tour.steps.length, 1)}
							activeConcept={activeConcept}
							activeFragment={activeFragment}
							conceptFragments={conceptFragments}
							activeRelationships={activeRelationships}
							sourceKind={tour.kind}
							onFragmentSelected={(fragmentId) => {
								setMode("fragment");
								selectFragment(fragmentId);
							}}
							onRelationshipSelected={navigateRelationship}
							onDragPointerDown={startFragmentCardDrag}
							onDragPointerMove={moveFragmentCardDrag}
							onDragPointerUp={endFragmentCardDrag}
						/>
					</>
				)}

				<nav className="rp1-code-tour-bottom-bar" aria-label="Tour steps">
					<Button
						type="button"
						variant="ghost"
						size="icon"
						onClick={() => selectStep(activeStepIndex - 1)}
						disabled={!canGoPrevious}
						aria-label="Previous tour step"
						title="Previous tour step"
					>
						<ChevronLeft className="h-4 w-4" strokeWidth={1.6} />
					</Button>
					<div className="rp1-code-tour-step-strip">
						{tour.steps.map((step, index) => (
							<button
								key={`${step.conceptId}:${index}`}
								type="button"
								className={index === activeStepIndex ? "active" : undefined}
								onClick={() => selectStep(index)}
								aria-label={`Open step ${index + 1}: ${step.title}`}
							>
								<span>{index + 1}</span>
							</button>
						))}
					</div>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						onClick={() => selectStep(activeStepIndex + 1)}
						disabled={!canGoNext}
						aria-label="Next tour step"
						title="Next tour step"
					>
						<ChevronRight className="h-4 w-4" strokeWidth={1.6} />
					</Button>
				</nav>

				<p className="sr-only" aria-live="polite">
					{activeConcept
						? `${activeConcept.label}${activeFragment ? `, ${activeFragment.location}` : ""}`
						: tour.title}
				</p>
			</div>
		</section>
	);
}

function FragmentCard({
	fragment,
	sourceKind,
}: {
	readonly fragment: CodeTourViewFragment;
	readonly sourceKind: string;
}) {
	return (
		<section className="rp1-code-tour-fragment-card">
			<div className="rp1-code-tour-fragment-card-head">
				<div>
					<h4>{fragment.label}</h4>
					<p>{fragment.location}</p>
				</div>
				{fragment.url && (
					<a
						href={fragment.url}
						target="_blank"
						rel="noreferrer"
						aria-label={`Open source for ${fragment.label}`}
						title={`Open ${sourceKind} source`}
					>
						<ExternalLink className="h-3.5 w-3.5" strokeWidth={1.6} />
					</a>
				)}
			</div>
			<FragmentCode fragment={fragment} />
		</section>
	);
}

function FloatingStepCard({
	cardRef,
	activeStep,
	activeStepIndex,
	stepCount,
	activeConcept,
	activeFragment,
	conceptFragments,
	activeRelationships,
	sourceKind,
	onFragmentSelected,
	onRelationshipSelected,
	onDragPointerDown,
	onDragPointerMove,
	onDragPointerUp,
}: {
	readonly cardRef: RefObject<HTMLElement>;
	readonly activeStep: CodeTourViewStep | null;
	readonly activeStepIndex: number;
	readonly stepCount: number;
	readonly activeConcept: CodeTourViewConcept | null;
	readonly activeFragment: CodeTourViewFragment;
	readonly conceptFragments: readonly CodeTourViewFragment[];
	readonly activeRelationships: readonly CodeTourViewEdge[];
	readonly sourceKind: string;
	readonly onFragmentSelected: (fragmentId: string) => void;
	readonly onRelationshipSelected: (edge: CodeTourViewEdge) => void;
	readonly onDragPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
	readonly onDragPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
	readonly onDragPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
	const sourceLabel =
		sourceKind === "pull-request" ? "View full file on GitHub" : "Open source";

	return (
		<section ref={cardRef} className="rp1-code-tour-floating-step-card">
			<div
				className="rp1-code-tour-floating-step-head"
				onPointerDown={onDragPointerDown}
				onPointerMove={onDragPointerMove}
				onPointerUp={onDragPointerUp}
				onPointerCancel={onDragPointerUp}
				title="Move step panel"
			>
				<div>
					<p>{activeStep ? `Step ${activeStepIndex + 1}` : "Focus"}</p>
					<h3>
						{activeStep?.title ?? activeConcept?.label ?? activeFragment.label}
					</h3>
				</div>
				<span>
					{activeStepIndex + 1}/{stepCount}
				</span>
			</div>

			{activeStep?.sub && (
				<p className="rp1-code-tour-step-sub">{activeStep.sub}</p>
			)}
			{activeStep?.reason && (
				<p className="rp1-code-tour-step-reason">{activeStep.reason}</p>
			)}

			{activeConcept && (
				<section className="rp1-code-tour-section">
					<div className="rp1-code-tour-section-title">
						<span>{activeConcept.domain.label}</span>
					</div>
					<h4>{activeConcept.label}</h4>
					{activeConcept.summary && <p>{activeConcept.summary}</p>}
				</section>
			)}

			{conceptFragments.length > 1 && (
				<div className="rp1-code-tour-floating-fragment-tabs">
					{conceptFragments.map((fragment) => (
						<button
							key={fragment.id}
							type="button"
							className={
								fragment.id === activeFragment.id ? "active" : undefined
							}
							onClick={() => onFragmentSelected(fragment.id)}
						>
							<span>{fragment.label}</span>
							<small>{fragment.changeCount}</small>
						</button>
					))}
				</div>
			)}

			<section className="rp1-code-tour-floating-fragment">
				<div className="rp1-code-tour-floating-fragment-path">
					{activeFragment.location}
				</div>
				<div className="rp1-code-tour-floating-fragment-source">
					<h4>{activeFragment.label}</h4>
					{activeFragment.url && (
						<a href={activeFragment.url} target="_blank" rel="noreferrer">
							{sourceLabel}
							<ExternalLink className="h-3 w-3" strokeWidth={1.6} />
						</a>
					)}
				</div>
				<FragmentCode fragment={activeFragment} />
			</section>

			<section className="rp1-code-tour-section">
				<div className="rp1-code-tour-section-title">
					<Box className="h-3 w-3" strokeWidth={1.6} />
					<span>Relationships</span>
				</div>
				<div className="rp1-code-tour-relationships">
					{activeRelationships.length > 0 ? (
						activeRelationships.map((edge) => (
							<button
								key={edge.id}
								type="button"
								onClick={() => onRelationshipSelected(edge)}
							>
								<strong>{edge.label}</strong>
								<span>
									{edge.fromLabel}
									{" -> "}
									{edge.toLabel}
								</span>
							</button>
						))
					) : (
						<p>No labeled relationships for this focus.</p>
					)}
				</div>
			</section>
		</section>
	);
}

function FragmentCode({
	fragment,
}: {
	readonly fragment: CodeTourViewFragment;
}) {
	return (
		<section className="rp1-code-tour-code" aria-label="Source fragment">
			{fragment.code.map((line, index) => {
				const absoluteLine =
					fragment.line !== null ? fragment.line + index : null;
				const highlighted = fragment.highlightedLines.has(index);
				return (
					<div
						key={`${fragment.id}:${index}`}
						className={cn(
							"rp1-code-tour-code-line",
							line.type === "add" && "is-add",
							line.type === "del" && "is-del",
							highlighted && "is-highlighted",
						)}
					>
						<span className="rp1-code-tour-code-number">
							{absoluteLine ?? ""}
						</span>
						<span className="rp1-code-tour-code-prefix">
							{codeLinePrefix(line)}
						</span>
						<span className="rp1-code-tour-code-text">
							{line.tokens.length > 0 ? (
								line.tokens.map(([kind, text], tokenIndex) => (
									<span
										key={`${fragment.id}:${index}:${tokenIndex}`}
										className={TOKEN_CLASS[kind] ?? undefined}
									>
										{text}
									</span>
								))
							) : (
								<span>{codeLineText(line) || " "}</span>
							)}
						</span>
					</div>
				);
			})}
		</section>
	);
}

function CodeTourDiagnosticState({
	kind,
	tour,
	activeStep,
	activeStepIndex,
	stepCount,
	activeConcept,
	activeFragment,
	conceptFragments,
	activeRelationships,
	onConceptSelected,
	onFragmentSelected,
	onRelationshipSelected,
}: {
	readonly kind: Exclude<RenderState, "ready">;
	readonly tour: CodeTourViewModel;
	readonly activeStep: CodeTourViewStep | null;
	readonly activeStepIndex: number;
	readonly stepCount: number;
	readonly activeConcept: CodeTourViewConcept | null;
	readonly activeFragment: CodeTourViewFragment | null;
	readonly conceptFragments: readonly CodeTourViewFragment[];
	readonly activeRelationships: readonly CodeTourViewEdge[];
	readonly onConceptSelected: (conceptId: string) => void;
	readonly onFragmentSelected: (fragmentId: string) => void;
	readonly onRelationshipSelected: (edge: CodeTourViewEdge) => void;
}) {
	const title =
		kind === "reduced"
			? "Reduced motion view"
			: kind === "unsupported"
				? "3D render unavailable"
				: kind === "failed"
					? "3D render failed"
					: "Preparing tour";

	return (
		<div className="rp1-code-tour-diagnostic">
			<div className="rp1-code-tour-diagnostic-panel">
				<div className="rp1-code-tour-diagnostic-title">
					<AlertTriangle className="h-4 w-4" strokeWidth={1.7} />
					<div>
						<p>{tour.sourceLabel}</p>
						<h3>{title}</h3>
					</div>
				</div>
				<div className="rp1-code-tour-diagnostic-grid">
					<div className="rp1-code-tour-diagnostic-concepts">
						{tour.concepts.map((concept) => (
							<button
								key={concept.id}
								type="button"
								className={
									concept.id === activeConcept?.id ? "active" : undefined
								}
								onClick={() => onConceptSelected(concept.id)}
							>
								<strong>{concept.label}</strong>
								<small>{concept.fragmentIds.length} fragments</small>
							</button>
						))}
					</div>
					{activeFragment && (
						<div className="rp1-code-tour-diagnostic-details">
							<div className="rp1-code-tour-diagnostic-step">
								<div>
									<p>{activeStep ? `Step ${activeStepIndex + 1}` : "Focus"}</p>
									<h3>
										{activeStep?.title ??
											activeConcept?.label ??
											activeFragment.label}
									</h3>
								</div>
								<span>
									{activeStepIndex + 1}/{stepCount}
								</span>
							</div>
							{activeStep?.sub && (
								<p className="rp1-code-tour-step-sub">{activeStep.sub}</p>
							)}
							{activeStep?.reason && (
								<p className="rp1-code-tour-step-reason">{activeStep.reason}</p>
							)}
							{conceptFragments.length > 1 && (
								<div className="rp1-code-tour-fragment-tabs">
									{conceptFragments.map((fragment) => (
										<button
											key={fragment.id}
											type="button"
											className={
												fragment.id === activeFragment.id ? "active" : undefined
											}
											onClick={() => onFragmentSelected(fragment.id)}
										>
											<span>{fragment.label}</span>
											<small>{fragment.changeCount}</small>
										</button>
									))}
								</div>
							)}
							<FragmentCard fragment={activeFragment} sourceKind={tour.kind} />
							<section className="rp1-code-tour-section">
								<div className="rp1-code-tour-section-title">
									<Box className="h-3 w-3" strokeWidth={1.6} />
									<span>Relationships</span>
								</div>
								<div className="rp1-code-tour-relationships">
									{activeRelationships.length > 0 ? (
										activeRelationships.map((edge) => (
											<button
												key={edge.id}
												type="button"
												onClick={() => onRelationshipSelected(edge)}
											>
												<strong>{edge.label}</strong>
												<span>
													{edge.fromLabel}
													{" -> "}
													{edge.toLabel}
												</span>
											</button>
										))
									) : (
										<p>No labeled relationships for this focus.</p>
									)}
								</div>
							</section>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

function IconButton({
	label,
	icon,
	onClick,
}: {
	readonly label: string;
	readonly icon: ReactNode;
	readonly onClick: () => void;
}) {
	return (
		<Button
			type="button"
			variant="ghost"
			size="icon"
			onClick={onClick}
			aria-label={label}
			title={label}
			className="rp1-code-tour-icon-button"
		>
			{icon}
		</Button>
	);
}

function createScene({
	tour,
	theme,
	canvas,
	overlay,
	stage,
	stateRef,
	fragmentTether,
	onConceptSelected,
	onFragmentSelected,
}: {
	readonly tour: CodeTourViewModel;
	readonly theme: CodeTourTheme;
	readonly canvas: HTMLCanvasElement;
	readonly overlay: HTMLDivElement;
	readonly stage: HTMLDivElement;
	readonly stateRef: RefObject<ReaderStateRef>;
	readonly fragmentTether: FragmentTetherRefs;
	readonly onConceptSelected: (conceptId: string) => void;
	readonly onFragmentSelected: (fragmentId: string) => void;
}): SceneHandles {
	const renderer = new THREE.WebGLRenderer({
		canvas,
		antialias: true,
		alpha: true,
		powerPreference: "high-performance",
	});
	const sceneTheme = SCENE_THEME[theme];
	renderer.setClearColor(sceneTheme.clear, 0);
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

	const labelRenderer = new CSS2DRenderer({ element: overlay });
	labelRenderer.domElement.style.position = "absolute";
	labelRenderer.domElement.style.inset = "0";
	labelRenderer.domElement.style.pointerEvents = "none";

	const scene = new THREE.Scene();
	scene.fog = new THREE.FogExp2(sceneTheme.fog, sceneTheme.fogDensity);
	const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 260);
	camera.position.set(7, 8, 28);

	const controls = new OrbitControls(camera, canvas);
	controls.enableDamping = true;
	controls.dampingFactor = 0.08;
	controls.enablePan = true;
	controls.maxDistance = 70;
	controls.minDistance = 5;
	controls.target.set(0, 0, 0);

	const ambientPoints = buildAmbientPoints(theme);
	scene.add(ambientPoints);

	const layout = buildCodeTourSceneLayout(tour);
	const conceptNodes = new Map<string, SceneNode>();
	const fragmentNodes = new Map<string, SceneNode>();
	const conceptScales = scaleLookup(tour.concepts);
	const fragmentScales = scaleLookup(tour.fragments);

	for (const concept of tour.concepts) {
		const node = buildSceneNode({
			id: concept.id,
			kind: "concept",
			conceptId: concept.id,
			label: concept.label,
			count: `${concept.fragmentIds.length}f / ${concept.changeCount}`,
			position: toSceneVector(layout.concepts.get(concept.id)),
			baseScale: conceptScales.get(concept.id) ?? 1,
			theme,
			onClick: () => onConceptSelected(concept.id),
		});
		scene.add(node.group);
		conceptNodes.set(concept.id, node);
	}

	for (const fragment of tour.fragments) {
		const node = buildSceneNode({
			id: fragment.id,
			kind: "fragment",
			conceptId: fragment.conceptId,
			label: fragment.label,
			count: `${fragment.changeCount}`,
			position: toSceneVector(layout.fragments.get(fragment.id)),
			baseScale: (fragmentScales.get(fragment.id) ?? 1) * 0.72,
			theme,
			onClick: () => onFragmentSelected(fragment.id),
		});
		scene.add(node.group);
		fragmentNodes.set(fragment.id, node);
	}

	const selectConceptSource = (edge: CodeTourViewEdge) => {
		onConceptSelected(edge.from);
	};
	const selectConceptDestination = (edge: CodeTourViewEdge) => {
		onConceptSelected(edge.to);
	};
	const selectFragmentSource = (edge: CodeTourViewEdge) => {
		onFragmentSelected(edge.from);
	};
	const selectFragmentDestination = (edge: CodeTourViewEdge) => {
		onFragmentSelected(edge.to);
	};

	const conceptEdges = buildSceneEdges({
		edges: tour.conceptEdges,
		nodes: conceptNodes,
		scene,
		theme,
		onDestinationClick: selectConceptDestination,
		onSourceClick: selectConceptSource,
	});
	const fragmentEdges = buildSceneEdges({
		edges: tour.fragmentEdges,
		nodes: fragmentNodes,
		scene,
		theme,
		onDestinationClick: selectFragmentDestination,
		onSourceClick: selectFragmentSource,
	});

	const raycaster = new THREE.Raycaster();
	const ndc = new THREE.Vector2();
	const focusPosition = new THREE.Vector3(7, 8, 28);
	const focusTarget = new THREE.Vector3(0, 0, 0);

	const pick = (event: PointerEvent | MouseEvent) => {
		const state = stateRef.current;
		if (!state) return null;
		const rect = canvas.getBoundingClientRect();
		ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
		raycaster.setFromCamera(ndc, camera);

		const nodes =
			state.mode === "concept"
				? Array.from(conceptNodes.values())
				: Array.from(fragmentNodes.values());
		const nodeHits = raycaster.intersectObjects(
			nodes.map((node) => node.hitMesh),
			false,
		);
		if (nodeHits[0]) {
			const { kind, id } = nodeHits[0].object.userData as {
				readonly kind: SceneNodeKind;
				readonly id: string;
			};
			return { type: "node" as const, kind, id };
		}

		raycaster.params.Line = raycaster.params.Line ?? {};
		const previousThreshold = raycaster.params.Line.threshold;
		raycaster.params.Line.threshold = 0.42;
		const edgeSet = state.mode === "concept" ? conceptEdges : fragmentEdges;
		const edgeHits = raycaster.intersectObjects(
			edgeSet.map((edge) => edge.line),
			false,
		);
		raycaster.params.Line.threshold = previousThreshold;
		if (edgeHits[0]) {
			const edge = edgeSet.find(
				(candidate) => candidate.line === edgeHits[0].object,
			);
			if (edge) return { type: "edge" as const, edge };
		}

		return null;
	};

	const pointerMove = (event: PointerEvent) => {
		const hit = pick(event);
		canvas.style.cursor = hit
			? hit.type === "node"
				? "pointer"
				: "alias"
			: "";
	};
	const click = (event: MouseEvent) => {
		const hit = pick(event);
		if (!hit) return;
		if (hit.type === "edge") {
			const state = stateRef.current;
			if (state?.mode === "concept") selectConceptDestination(hit.edge.edge);
			else selectFragmentDestination(hit.edge.edge);
			return;
		}
		if (hit.kind === "concept") onConceptSelected(hit.id);
		else onFragmentSelected(hit.id);
	};

	canvas.addEventListener("pointermove", pointerMove);
	canvas.addEventListener("click", click);

	const handles: SceneHandles = {
		renderer,
		labelRenderer,
		scene,
		theme,
		ambientPoints,
		camera,
		controls,
		stage,
		fragmentTether,
		conceptNodes,
		fragmentNodes,
		conceptEdges,
		fragmentEdges,
		focusPosition,
		focusTarget,
		autoFocusActive: false,
		animationFrame: null,
		dispose: () => {},
	};
	const cancelAutoFocus = () => cancelSceneAutoFocus(handles);
	const resizeObserver = new ResizeObserver(() => resizeScene(handles, stage));
	controls.addEventListener("start", cancelAutoFocus);
	canvas.addEventListener("wheel", cancelAutoFocus, { passive: true });

	handles.dispose = () => {
		if (handles.animationFrame !== null) {
			cancelAnimationFrame(handles.animationFrame);
		}
		resizeObserver.disconnect();
		controls.removeEventListener("start", cancelAutoFocus);
		canvas.removeEventListener("wheel", cancelAutoFocus);
		canvas.removeEventListener("pointermove", pointerMove);
		canvas.removeEventListener("click", click);
		controls.dispose();
		ambientPoints.geometry.dispose();
		ambientPoints.material.dispose();
		renderer.dispose();
		overlay.replaceChildren();
		disposeNodeMap(conceptNodes);
		disposeNodeMap(fragmentNodes);
		disposeEdges(conceptEdges);
		disposeEdges(fragmentEdges);
	};

	resizeObserver.observe(stage);
	resizeScene(handles, stage);
	return handles;
}

function buildSceneNode({
	id,
	kind,
	conceptId,
	label,
	count,
	position,
	baseScale,
	theme,
	onClick,
}: {
	readonly id: string;
	readonly kind: SceneNodeKind;
	readonly conceptId: string;
	readonly label: string;
	readonly count: string;
	readonly position: THREE.Vector3;
	readonly baseScale: number;
	readonly theme: CodeTourTheme;
	readonly onClick: () => void;
}): SceneNode {
	const color = sceneGlowColor(theme);
	const blending = sceneMaterialBlending(theme);
	const group = new THREE.Group();
	group.position.copy(position);
	group.scale.setScalar(baseScale);
	group.userData = { kind, id };

	const bodyMaterial = new THREE.MeshBasicMaterial({
		color,
		transparent: true,
		opacity: theme === "light" ? 0.14 : 0.2,
		depthWrite: false,
		blending,
		side: THREE.DoubleSide,
	});
	const hitMesh = new THREE.Mesh(NODE_GEOMETRY, bodyMaterial);
	hitMesh.userData = { kind, id };
	group.add(hitMesh);

	const edgeMaterial = new THREE.LineBasicMaterial({
		color,
		transparent: true,
		opacity: theme === "light" ? 0.68 : 0.8,
		depthWrite: false,
		blending,
	});
	const wire = new THREE.LineSegments(NODE_EDGE_GEOMETRY, edgeMaterial);
	hitMesh.add(wire);

	const poleMaterial = new THREE.LineBasicMaterial({
		color,
		transparent: true,
		opacity: theme === "light" ? 0.5 : 0.55,
		depthWrite: false,
		blending,
	});
	const pole = new THREE.Line(NODE_LABEL_POLE_GEOMETRY, poleMaterial);
	group.add(pole);

	const labelElement = document.createElement("button");
	labelElement.type = "button";
	labelElement.className = `rp1-code-tour-node-label ${kind}`;
	labelElement.textContent = `${label} / ${count}`;
	labelElement.addEventListener("click", (event) => {
		event.stopPropagation();
		onClick();
	});
	const labelObject = new CSS2DObject(labelElement);
	labelObject.center.set(0, 0.5);
	labelObject.position.set(0, 1.58, 0);
	group.add(labelObject);

	return {
		id,
		kind,
		conceptId,
		group,
		target: position.clone(),
		hitMesh,
		bodyMaterial,
		edgeMaterial,
		pole,
		poleMaterial,
		labelObject,
		labelElement,
		baseScale,
		glowColor: color,
	};
}

function buildSceneEdges({
	edges,
	nodes,
	scene,
	theme,
	onDestinationClick,
	onSourceClick,
}: {
	readonly edges: readonly CodeTourViewEdge[];
	readonly nodes: ReadonlyMap<string, SceneNode>;
	readonly scene: THREE.Scene;
	readonly theme: CodeTourTheme;
	readonly onDestinationClick: (edge: CodeTourViewEdge) => void;
	readonly onSourceClick: (edge: CodeTourViewEdge) => void;
}): readonly SceneEdge[] {
	const sceneEdges: SceneEdge[] = [];
	for (const [edgeIndex, edge] of edges.entries()) {
		const from = nodes.get(edge.from);
		const to = nodes.get(edge.to);
		if (!from || !to) continue;
		const curve = curveBetween(from.target, to.target);
		const geometry = new THREE.BufferGeometry().setFromPoints(
			curve.getPoints(42),
		);
		const baseColor = from.glowColor.clone().lerp(to.glowColor, 0.45);
		const material = new THREE.LineBasicMaterial({
			color: baseColor,
			transparent: true,
			opacity: theme === "light" ? 0.42 : 0.24,
			depthWrite: false,
			blending: sceneMaterialBlending(theme),
		});
		const line = new THREE.Line(geometry, material);
		scene.add(line);

		const particles = buildEdgeParticles({
			curve,
			color: baseColor
				.clone()
				.lerp(new THREE.Color(SCENE_THEME[theme].edgeParticle), 0.4),
			seed: edgeIndex,
			theme,
		});
		scene.add(particles.points);

		const labelElement = document.createElement("div");
		labelElement.className = "rp1-code-tour-edge-label";
		labelElement.setAttribute("role", "group");
		labelElement.setAttribute("aria-label", `Relationship: ${edge.label}`);

		const destinationButton = document.createElement("button");
		destinationButton.type = "button";
		destinationButton.className = "rp1-code-tour-edge-label-destination";
		destinationButton.title = `Go to destination: ${edge.toLabel}`;
		destinationButton.setAttribute(
			"aria-label",
			`Go to destination: ${edge.toLabel}`,
		);
		const destinationText = document.createElement("span");
		destinationText.className = "rp1-code-tour-edge-label-destination-text";
		destinationText.textContent = edge.label;
		const destinationArrow = document.createElement("span");
		destinationArrow.className = "rp1-code-tour-edge-label-destination-arrow";
		destinationArrow.setAttribute("aria-hidden", "true");
		destinationArrow.textContent = "→";
		destinationButton.append(destinationText, destinationArrow);
		destinationButton.addEventListener("click", (event) => {
			event.stopPropagation();
			onDestinationClick(edge);
		});
		destinationButton.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" || !event.shiftKey) return;
			event.preventDefault();
			event.stopPropagation();
			onSourceClick(edge);
		});

		const sourceButton = document.createElement("button");
		sourceButton.type = "button";
		sourceButton.className =
			"rp1-code-tour-edge-label-nav-button rp1-code-tour-edge-label-source";
		sourceButton.textContent = "←";
		sourceButton.title = `Go to source: ${edge.fromLabel}`;
		sourceButton.setAttribute("aria-label", `Go to source: ${edge.fromLabel}`);
		sourceButton.addEventListener("click", (event) => {
			event.stopPropagation();
			onSourceClick(edge);
		});

		const forwardButton = document.createElement("button");
		forwardButton.type = "button";
		forwardButton.className =
			"rp1-code-tour-edge-label-nav-button rp1-code-tour-edge-label-forward";
		forwardButton.textContent = "→";
		forwardButton.title = `Go to destination: ${edge.toLabel}`;
		forwardButton.setAttribute(
			"aria-label",
			`Go to destination: ${edge.toLabel}`,
		);
		forwardButton.addEventListener("click", (event) => {
			event.stopPropagation();
			onDestinationClick(edge);
		});

		const navElement = document.createElement("div");
		navElement.className = "rp1-code-tour-edge-label-nav";
		navElement.setAttribute("aria-label", "Relationship navigation");
		navElement.append(sourceButton, forwardButton);
		labelElement.append(destinationButton, navElement);

		const labelObject = new CSS2DObject(labelElement);
		labelObject.position.copy(curve.getPoint(0.5));
		scene.add(labelObject);

		sceneEdges.push({
			edge,
			curve,
			line,
			material,
			geometry,
			particlePoints: particles.points,
			particleGeometry: particles.geometry,
			particleMaterial: particles.material,
			particleBaseColor: particles.baseColor,
			particleOffsets: particles.offsets,
			labelObject,
			labelElement,
		});
	}
	return sceneEdges;
}

function buildEdgeParticles({
	curve,
	color,
	seed,
	theme,
}: {
	readonly curve: THREE.QuadraticBezierCurve3;
	readonly color: THREE.Color;
	readonly seed: number;
	readonly theme: CodeTourTheme;
}): {
	readonly points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
	readonly geometry: THREE.BufferGeometry;
	readonly material: THREE.PointsMaterial;
	readonly baseColor: THREE.Color;
	readonly offsets: readonly number[];
} {
	const positions = new Float32Array(EDGE_PARTICLES_PER_EDGE * 3);
	const offsets = Array.from({ length: EDGE_PARTICLES_PER_EDGE }, (_, index) =>
		fract(index / EDGE_PARTICLES_PER_EDGE + seed * 0.137 + index * 0.019),
	);
	for (let index = 0; index < offsets.length; index += 1) {
		const point = curve.getPoint(offsets[index] ?? 0);
		positions[index * 3] = point.x;
		positions[index * 3 + 1] = point.y;
		positions[index * 3 + 2] = point.z;
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	const sceneTheme = SCENE_THEME[theme];
	const material = new THREE.PointsMaterial({
		color,
		size: sceneTheme.edgeParticleSize,
		transparent: true,
		opacity: 0,
		depthWrite: false,
		blending: sceneMaterialBlending(theme),
		sizeAttenuation: true,
	});
	const points = new THREE.Points(geometry, material);
	points.frustumCulled = false;
	return { points, geometry, material, baseColor: color.clone(), offsets };
}

function animateScene(
	handles: SceneHandles,
	stateRef: RefObject<ReaderStateRef>,
) {
	const state = stateRef.current;
	if (state) {
		updateSceneNodes(handles, state);
		updateSceneEdges(handles, state);
		updateAutoFocus(handles);
		updateFragmentTether(handles, state);
	} else {
		hideFragmentTether(handles.fragmentTether);
	}

	handles.controls.update();
	handles.renderer.render(handles.scene, handles.camera);
	handles.labelRenderer.render(handles.scene, handles.camera);
	handles.animationFrame = requestAnimationFrame(() =>
		animateScene(handles, stateRef),
	);
}

function updateSceneNodes(handles: SceneHandles, state: ReaderStateRef) {
	const conceptBridgeIds = bridgeIds(
		handles.conceptEdges,
		state.activeConceptId,
	);
	const fragmentBridgeIds = bridgeIds(
		handles.fragmentEdges,
		state.activeFragmentId,
	);

	for (const node of handles.conceptNodes.values()) {
		const isMode = state.mode === "concept";
		const isActive = node.id === state.activeConceptId;
		const isBridge = conceptBridgeIds.has(node.id);
		updateNodeVisualState(node, isMode, isActive, isBridge, handles.theme);
	}

	for (const node of handles.fragmentNodes.values()) {
		const isMode = state.mode === "fragment";
		const isActive = node.id === state.activeFragmentId;
		const isSameConcept = node.conceptId === state.activeConceptId;
		const isBridge = fragmentBridgeIds.has(node.id);
		updateNodeVisualState(
			node,
			isMode,
			isActive,
			isSameConcept || isBridge,
			handles.theme,
		);
	}
}

function updateNodeVisualState(
	node: SceneNode,
	isMode: boolean,
	isActive: boolean,
	isBridge: boolean,
	theme: CodeTourTheme,
) {
	const sceneTheme = SCENE_THEME[theme];
	const visibleOpacity = !isMode
		? 0
		: isActive
			? 0.96
			: isBridge
				? theme === "light"
					? 0.7
					: 0.52
				: theme === "light"
					? 0.34
					: 0.18;
	node.bodyMaterial.opacity = THREE.MathUtils.lerp(
		node.bodyMaterial.opacity,
		visibleOpacity * (theme === "light" ? 0.13 : 0.3),
		0.12,
	);
	node.edgeMaterial.opacity = THREE.MathUtils.lerp(
		node.edgeMaterial.opacity,
		visibleOpacity,
		0.12,
	);
	const poleOpacity = !isMode
		? 0
		: isActive
			? 0.8
			: isBridge
				? 0.5
				: theme === "light"
					? 0.2
					: 0.28;
	node.poleMaterial.opacity = THREE.MathUtils.lerp(
		node.poleMaterial.opacity,
		poleOpacity,
		0.12,
	);
	NODE_TARGET_COLOR.set(isActive ? sceneTheme.glowHot : sceneTheme.glow);
	node.bodyMaterial.color.lerp(NODE_TARGET_COLOR, 0.1);
	node.edgeMaterial.color.lerp(NODE_TARGET_COLOR, 0.1);
	node.poleMaterial.color.lerp(NODE_TARGET_COLOR, 0.1);
	const targetScale = node.baseScale * (isActive ? 1.28 : isBridge ? 1.08 : 1);
	const nextScale = THREE.MathUtils.lerp(node.group.scale.x, targetScale, 0.1);
	node.group.scale.setScalar(nextScale);
	node.hitMesh.rotation.y += isActive ? 0.004 : 0.0012;
	node.hitMesh.rotation.x += isActive ? 0.001 : 0.0003;
	node.group.visible = node.edgeMaterial.opacity > 0.01;
	node.pole.visible = isMode && node.poleMaterial.opacity > 0.01;
	node.labelObject.visible = isMode && node.edgeMaterial.opacity > 0.08;
	node.labelElement.classList.toggle("is-active", isActive);
	node.labelElement.classList.toggle("is-muted", !isActive && !isBridge);
}

function updateSceneEdges(handles: SceneHandles, state: ReaderStateRef) {
	for (const edge of handles.conceptEdges) {
		const active =
			state.mode === "concept" &&
			(edge.edge.from === state.activeConceptId ||
				edge.edge.to === state.activeConceptId);
		updateEdgeVisualState(
			edge,
			state.mode === "concept",
			active,
			handles.theme,
		);
	}

	for (const edge of handles.fragmentEdges) {
		const active =
			state.mode === "fragment" &&
			(edge.edge.from === state.activeFragmentId ||
				edge.edge.to === state.activeFragmentId);
		updateEdgeVisualState(
			edge,
			state.mode === "fragment",
			active,
			handles.theme,
		);
	}
}

function updateEdgeVisualState(
	edge: SceneEdge,
	isMode: boolean,
	isActive: boolean,
	theme: CodeTourTheme,
) {
	const sceneTheme = SCENE_THEME[theme];
	const targetOpacity = !isMode
		? 0
		: isActive
			? theme === "light"
				? 0.62
				: 0.88
			: theme === "light"
				? 0.26
				: 0.18;
	edge.material.opacity = THREE.MathUtils.lerp(
		edge.material.opacity,
		targetOpacity,
		0.12,
	);
	NODE_TARGET_COLOR.set(isActive ? sceneTheme.glowHot : sceneTheme.glow);
	edge.material.color.lerp(NODE_TARGET_COLOR, 0.15);
	edge.line.visible = edge.material.opacity > 0.02;
	edge.labelObject.visible = isMode && edge.material.opacity > 0.08;
	edge.labelElement.classList.toggle("is-active", isActive);
	updateEdgeParticles(edge, isMode, isActive, theme);
}

function updateEdgeParticles(
	edge: SceneEdge,
	isMode: boolean,
	isActive: boolean,
	theme: CodeTourTheme,
) {
	const sceneTheme = SCENE_THEME[theme];
	const targetOpacity = !isMode
		? 0
		: isActive
			? sceneTheme.edgeParticleActiveOpacity
			: sceneTheme.edgeParticleOpacity;
	edge.particleMaterial.opacity = THREE.MathUtils.lerp(
		edge.particleMaterial.opacity,
		targetOpacity,
		0.12,
	);
	edge.particleMaterial.size = THREE.MathUtils.lerp(
		edge.particleMaterial.size,
		isActive ? sceneTheme.edgeParticleSize * 1.12 : sceneTheme.edgeParticleSize,
		0.1,
	);
	EDGE_PARTICLE_TARGET_COLOR.copy(edge.particleBaseColor).lerp(
		EDGE_PARTICLE_ACCENT_COLOR.set(sceneTheme.edgeParticle),
		isActive ? 0.68 : 0.32,
	);
	edge.particleMaterial.color.lerp(EDGE_PARTICLE_TARGET_COLOR, 0.14);
	edge.particlePoints.visible = edge.particleMaterial.opacity > 0.01;
	if (!edge.particlePoints.visible) return;

	const elapsed = performance.now() / 1000;
	const positions = edge.particleGeometry.getAttribute("position");
	for (let index = 0; index < edge.particleOffsets.length; index += 1) {
		const offset = edge.particleOffsets[index] ?? 0;
		const t = (offset + elapsed * EDGE_PARTICLE_SPEED) % 1;
		const point = edge.curve.getPoint(t, EDGE_PARTICLE_VECTOR);
		positions.setXYZ(index, point.x, point.y, point.z);
	}
	positions.needsUpdate = true;
}

function focusSceneTarget(
	handles: SceneHandles | null,
	state: ReaderStateRef | null,
) {
	if (!handles || !state) return;
	const node = activeSceneNode(handles, state);
	if (!node) return;

	const offset =
		state.mode === "concept"
			? new THREE.Vector3(6, 5, 14)
			: new THREE.Vector3(4, 3, 12);
	handles.focusTarget.copy(node.target);
	handles.focusPosition.copy(node.target).add(offset);
	handles.autoFocusActive = true;
}

function updateAutoFocus(handles: SceneHandles) {
	if (!handles.autoFocusActive) return;

	handles.camera.position.lerp(handles.focusPosition, 0.045);
	handles.controls.target.lerp(handles.focusTarget, 0.045);

	const cameraSettled =
		handles.camera.position.distanceTo(handles.focusPosition) < 0.03;
	const targetSettled =
		handles.controls.target.distanceTo(handles.focusTarget) < 0.03;
	if (!cameraSettled || !targetSettled) return;

	handles.camera.position.copy(handles.focusPosition);
	handles.controls.target.copy(handles.focusTarget);
	handles.autoFocusActive = false;
}

function cancelSceneAutoFocus(handles: SceneHandles) {
	handles.autoFocusActive = false;
	handles.focusPosition.copy(handles.camera.position);
	handles.focusTarget.copy(handles.controls.target);
}

function activeSceneNode(
	handles: SceneHandles,
	state: ReaderStateRef,
): SceneNode | undefined {
	return state.mode === "concept"
		? handles.conceptNodes.get(state.activeConceptId)
		: (handles.fragmentNodes.get(state.activeFragmentId) ??
				handles.fragmentNodes.get(state.activeConceptId));
}

function updateFragmentTether(handles: SceneHandles, state: ReaderStateRef) {
	const tether = handles.fragmentTether;
	const card = tether.card.current;
	const svg = tether.svg.current;
	const glow = tether.glow.current;
	const line = tether.line.current;
	const nodeCap = tether.nodeCap.current;
	const cardCap = tether.cardCap.current;
	const node = activeSceneNode(handles, state);

	if (!card || !svg || !glow || !line || !nodeCap || !cardCap || !node) {
		hideFragmentTether(tether);
		return;
	}

	updateFragmentCardClamp(card, handles.stage);

	const nodePosition = new THREE.Vector3();
	node.group.getWorldPosition(nodePosition);
	nodePosition.project(handles.camera);
	if (nodePosition.z > 1) {
		hideFragmentTether(tether);
		return;
	}

	const stageRect = handles.stage.getBoundingClientRect();
	const nodeX = stageRect.width * (nodePosition.x * 0.5 + 0.5);
	const nodeY = stageRect.height * (-nodePosition.y * 0.5 + 0.5);
	const cardRect = card.getBoundingClientRect();
	const cardCenterX = cardRect.left - stageRect.left + cardRect.width / 2;
	const cardCenterY = cardRect.top - stageRect.top + cardRect.height / 2;
	const dx = nodeX - cardCenterX;
	const dy = nodeY - cardCenterY;
	const halfWidth = Math.max(cardRect.width / 2, 1);
	const halfHeight = Math.max(cardRect.height / 2, 1);
	const edgeScale = Math.min(
		halfWidth / (Math.abs(dx) || 1),
		halfHeight / (Math.abs(dy) || 1),
	);
	const cardX = cardCenterX + dx * edgeScale;
	const cardY = cardCenterY + dy * edgeScale;
	const path = `M ${nodeX.toFixed(1)} ${nodeY.toFixed(1)} L ${cardX.toFixed(
		1,
	)} ${cardY.toFixed(1)}`;

	glow.setAttribute("d", path);
	line.setAttribute("d", path);
	nodeCap.setAttribute("cx", nodeX.toFixed(1));
	nodeCap.setAttribute("cy", nodeY.toFixed(1));
	cardCap.setAttribute("cx", cardX.toFixed(1));
	cardCap.setAttribute("cy", cardY.toFixed(1));
	svg.classList.add("is-visible");
}

function hideFragmentTether(tether: FragmentTetherRefs) {
	tether.svg.current?.classList.remove("is-visible");
}

function updateFragmentCardClamp(card: HTMLElement, stage: HTMLDivElement) {
	const currentX = Number.parseFloat(card.style.getPropertyValue("--clamp-x"));
	const currentY = Number.parseFloat(card.style.getPropertyValue("--clamp-y"));
	const clampX = Number.isFinite(currentX) ? currentX : 0;
	const clampY = Number.isFinite(currentY) ? currentY : 0;
	const cardRect = card.getBoundingClientRect();
	const stageRect = stage.getBoundingClientRect();
	const unclampedLeft = cardRect.left - clampX;
	const unclampedTop = cardRect.top - clampY;
	const minLeft = stageRect.left + FRAGMENT_CARD_MARGIN;
	const minTop = stageRect.top + FRAGMENT_CARD_MARGIN;
	const maxRight = stageRect.right - FRAGMENT_CARD_MARGIN;
	const maxBottom = stageRect.bottom - FRAGMENT_CARD_MARGIN;
	let nextX = 0;
	let nextY = 0;

	if (unclampedLeft < minLeft) {
		nextX = minLeft - unclampedLeft;
	} else if (unclampedLeft + cardRect.width > maxRight) {
		nextX = maxRight - (unclampedLeft + cardRect.width);
	}

	if (unclampedTop < minTop) {
		nextY = minTop - unclampedTop;
	} else if (unclampedTop + cardRect.height > maxBottom) {
		nextY = maxBottom - (unclampedTop + cardRect.height);
	}

	if (Math.abs(nextX - clampX) > 0.5) {
		card.style.setProperty("--clamp-x", `${nextX}px`);
	}
	if (Math.abs(nextY - clampY) > 0.5) {
		card.style.setProperty("--clamp-y", `${nextY}px`);
	}
}

function resizeScene(
	handles: SceneHandles | null,
	stage: HTMLDivElement | null,
) {
	if (!handles || !stage) return;
	const width = Math.max(stage.clientWidth, 1);
	const height = Math.max(stage.clientHeight, 1);
	handles.renderer.setSize(width, height, false);
	handles.labelRenderer.setSize(width, height);
	handles.camera.aspect = width / height;
	handles.camera.updateProjectionMatrix();
}

function buildAmbientPoints(theme: CodeTourTheme) {
	const count = 960;
	const positions = new Float32Array(count * 3);
	for (let index = 0; index < count; index += 1) {
		const seed = index * 12.9898;
		const x = (fract(Math.sin(seed) * 43758.5453) - 0.5) * 96;
		const y = (fract(Math.sin(seed + 8.12) * 23421.631) - 0.5) * 30 + 2;
		const z = (fract(Math.sin(seed + 3.47) * 12914.019) - 0.5) * 96;
		positions[index * 3] = x;
		positions[index * 3 + 1] = y;
		positions[index * 3 + 2] = z;
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	const sceneTheme = SCENE_THEME[theme];
	const material = new THREE.PointsMaterial({
		color: sceneTheme.ambient,
		size: sceneTheme.ambientSize,
		transparent: true,
		opacity: sceneTheme.ambientOpacity,
		depthWrite: false,
		blending: sceneMaterialBlending(theme),
		sizeAttenuation: true,
	});
	return new THREE.Points(geometry, material);
}

function sceneGlowColor(theme: CodeTourTheme): THREE.Color {
	return new THREE.Color(SCENE_THEME[theme].glow);
}

function sceneMaterialBlending(theme: CodeTourTheme): THREE.Blending {
	return theme === "light" ? THREE.NormalBlending : THREE.AdditiveBlending;
}

function toSceneVector(point: CodeTourLayoutPoint | undefined): THREE.Vector3 {
	return point
		? new THREE.Vector3(point.x, point.y, point.z)
		: new THREE.Vector3();
}

function scaleLookup(
	nodes: readonly {
		readonly id: string;
		readonly changeCount: number;
		readonly epicenter?: boolean;
	}[],
): ReadonlyMap<string, number> {
	const changes = nodes.map((node) => node.changeCount);
	const min = Math.min(...changes, 0);
	const max = Math.max(...changes, 1);
	const span = max - min || 1;
	return new Map(
		nodes.map((node) => {
			const normalized = (node.changeCount - min) / span;
			const scale = 0.86 + normalized * 0.76;
			return [node.id, node.epicenter ? Math.max(scale, 1.32) : scale];
		}),
	);
}

function curveBetween(from: THREE.Vector3, to: THREE.Vector3) {
	const midpoint = from.clone().add(to).multiplyScalar(0.5);
	midpoint.y += Math.max(0.5, from.distanceTo(to) * 0.16);
	return new THREE.QuadraticBezierCurve3(from.clone(), midpoint, to.clone());
}

function bridgeIds(
	edges: readonly SceneEdge[],
	activeId: string,
): ReadonlySet<string> {
	const ids = new Set<string>();
	for (const edge of edges) {
		if (edge.edge.from === activeId) ids.add(edge.edge.to);
		if (edge.edge.to === activeId) ids.add(edge.edge.from);
	}
	return ids;
}

function relationshipsFor(
	edges: readonly CodeTourViewEdge[],
	activeId: string,
): readonly CodeTourViewEdge[] {
	return edges.filter((edge) => edge.from === activeId || edge.to === activeId);
}

function relationshipNavigationTarget(
	edge: CodeTourViewEdge,
	activeId: string,
): string {
	if (edge.from === activeId) return edge.to;
	if (edge.to === activeId) return edge.from;
	return edge.to;
}

function firstFragmentForConcept(
	tour: CodeTourViewModel,
	conceptId: string,
): CodeTourViewFragment | null {
	return tour.fragmentsByConceptId.get(conceptId)?.[0] ?? null;
}

function disposeNodeMap(nodes: ReadonlyMap<string, SceneNode>) {
	for (const node of nodes.values()) {
		node.bodyMaterial.dispose();
		node.edgeMaterial.dispose();
		node.poleMaterial.dispose();
		node.labelElement.remove();
	}
}

function disposeEdges(edges: readonly SceneEdge[]) {
	for (const edge of edges) {
		edge.material.dispose();
		edge.geometry.dispose();
		edge.particleMaterial.dispose();
		edge.particleGeometry.dispose();
		edge.labelElement.remove();
	}
}

function isWebGlAvailable(canvas: HTMLCanvasElement): boolean {
	try {
		return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
	} catch {
		return false;
	}
}

function renderFailureMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim()) {
		return `3D Code Tour failed to render: ${error.message}`;
	}
	return "3D Code Tour failed to render.";
}

function isTextEntryTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	return (
		target.tagName === "INPUT" ||
		target.tagName === "TEXTAREA" ||
		target.isContentEditable
	);
}

function isInteractiveTarget(target: EventTarget | null): boolean {
	return target instanceof HTMLElement && Boolean(target.closest("button, a"));
}

function usePrefersReducedMotion(): boolean {
	const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

	useEffect(() => {
		if (!window.matchMedia) return;
		const query = window.matchMedia("(prefers-reduced-motion: reduce)");
		const sync = () => setPrefersReducedMotion(query.matches);
		sync();
		query.addEventListener("change", sync);
		return () => query.removeEventListener("change", sync);
	}, []);

	return prefersReducedMotion;
}

function useDocumentTheme(): CodeTourTheme {
	const [theme, setTheme] = useState<CodeTourTheme>(() =>
		resolveDocumentTheme(),
	);

	useEffect(() => {
		const root = document.documentElement;
		const media = window.matchMedia?.("(prefers-color-scheme: dark)") ?? null;
		const syncTheme = () => setTheme(resolveDocumentTheme());
		const observer = new MutationObserver(syncTheme);

		observer.observe(root, {
			attributeFilter: ["class", "data-theme"],
			attributes: true,
		});
		media?.addEventListener("change", syncTheme);
		syncTheme();

		return () => {
			observer.disconnect();
			media?.removeEventListener("change", syncTheme);
		};
	}, []);

	return theme;
}

function resolveDocumentTheme(): CodeTourTheme {
	if (typeof document === "undefined") return "dark";
	const root = document.documentElement;
	const explicitTheme = root.dataset.theme;
	if (explicitTheme === "light" || root.classList.contains("light")) {
		return "light";
	}
	if (explicitTheme === "dark" || root.classList.contains("dark")) {
		return "dark";
	}
	return window.matchMedia?.("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

function fract(value: number): number {
	return value - Math.floor(value);
}
