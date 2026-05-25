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
	RotateCcw,
} from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
	CSS2DObject,
	CSS2DRenderer,
} from "three/addons/renderers/CSS2DRenderer.js";
import { Button } from "@/components/ui/button";
import {
	type CodeTourViewConcept,
	type CodeTourViewEdge,
	type CodeTourViewFragment,
	type CodeTourViewModel,
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

interface SceneNode {
	readonly id: string;
	readonly kind: SceneNodeKind;
	readonly conceptId: string;
	readonly group: THREE.Group;
	readonly target: THREE.Vector3;
	readonly hitMesh: THREE.Mesh;
	readonly bodyMaterial: THREE.MeshBasicMaterial;
	readonly edgeMaterial: THREE.LineBasicMaterial;
	readonly labelObject: CSS2DObject;
	readonly labelElement: HTMLButtonElement;
	readonly baseScale: number;
	readonly domainColor: THREE.Color;
}

interface SceneEdge {
	readonly edge: CodeTourViewEdge;
	readonly line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
	readonly material: THREE.LineBasicMaterial;
	readonly geometry: THREE.BufferGeometry;
	readonly labelObject: CSS2DObject;
	readonly labelElement: HTMLButtonElement;
}

interface SceneHandles {
	readonly renderer: THREE.WebGLRenderer;
	readonly labelRenderer: CSS2DRenderer;
	readonly scene: THREE.Scene;
	readonly camera: THREE.PerspectiveCamera;
	readonly controls: OrbitControls;
	readonly conceptNodes: ReadonlyMap<string, SceneNode>;
	readonly fragmentNodes: ReadonlyMap<string, SceneNode>;
	readonly conceptEdges: readonly SceneEdge[];
	readonly fragmentEdges: readonly SceneEdge[];
	readonly focusPosition: THREE.Vector3;
	readonly focusTarget: THREE.Vector3;
	animationFrame: number | null;
	dispose: () => void;
}

interface ReaderStateRef {
	readonly mode: TourSceneMode;
	readonly activeConceptId: string;
	readonly activeFragmentId: string;
}

const CONCEPT_RADIUS = 13;
const FRAGMENT_COLUMN_GAP = 5.8;
const NODE_GEOMETRY = new THREE.DodecahedronGeometry(0.82);
const NODE_EDGE_GEOMETRY = new THREE.EdgesGeometry(NODE_GEOMETRY);
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
	const handlesRef = useRef<SceneHandles | null>(null);
	const onRenderFailureRef = useRef(onRenderFailure);
	const lastFailureRef = useRef<string | null>(null);
	const prefersReducedMotion = usePrefersReducedMotion();
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

	const resetCamera = useCallback(() => {
		focusSceneTarget(handlesRef.current, readerStateRef.current);
	}, []);

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
				focusSceneTarget(handlesRef.current, readerStateRef.current);
			});
		};

		document.addEventListener("fullscreenchange", syncFullscreen);
		return () =>
			document.removeEventListener("fullscreenchange", syncFullscreen);
	}, []);

	useEffect(() => {
		focusSceneTarget(handlesRef.current, {
			mode,
			activeConceptId,
			activeFragmentId,
		});
	}, [activeConceptId, activeFragmentId, mode]);

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
				canvas,
				overlay,
				stage,
				stateRef: readerStateRef,
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
				<div className="rp1-code-tour-grid" aria-hidden="true" />
				{sceneUnavailable && (
					<CodeTourDiagnosticState
						kind={diagnosticKind}
						tour={tour}
						activeConcept={activeConcept}
						activeFragment={activeFragment}
						onConceptSelected={selectConcept}
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
						<IconButton
							label="Recenter tour"
							onClick={resetCamera}
							icon={<RotateCcw className="h-3.5 w-3.5" strokeWidth={1.6} />}
						/>
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

				<aside className="rp1-code-tour-inspector">
					<div className="rp1-code-tour-inspector-head">
						<div>
							<p>{activeStep ? `Step ${activeStepIndex + 1}` : "Focus"}</p>
							<h3>{activeStep?.title ?? activeConcept?.label ?? tour.title}</h3>
						</div>
						<span>
							{activeStepIndex + 1}/{Math.max(tour.steps.length, 1)}
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
								<span
									className="rp1-code-tour-domain-dot"
									style={{ backgroundColor: activeConcept.domain.color }}
								/>
								<span>{activeConcept.domain.label}</span>
							</div>
							<h4>{activeConcept.label}</h4>
							{activeConcept.summary && <p>{activeConcept.summary}</p>}
						</section>
					)}

					{conceptFragments.length > 0 && (
						<div className="rp1-code-tour-fragment-tabs">
							{conceptFragments.map((fragment) => (
								<button
									key={fragment.id}
									type="button"
									className={
										fragment.id === activeFragment?.id ? "active" : undefined
									}
									onClick={() => {
										setMode("fragment");
										selectFragment(fragment.id);
									}}
								>
									<span>{fragment.label}</span>
									<small>{fragment.changeCount}</small>
								</button>
							))}
						</div>
					)}

					{activeFragment && (
						<FragmentCard fragment={activeFragment} sourceKind={tour.kind} />
					)}

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
										onClick={() => navigateRelationship(edge)}
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
				</aside>

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
		</section>
	);
}

function CodeTourDiagnosticState({
	kind,
	tour,
	activeConcept,
	activeFragment,
	onConceptSelected,
}: {
	readonly kind: Exclude<RenderState, "ready">;
	readonly tour: CodeTourViewModel;
	readonly activeConcept: CodeTourViewConcept | null;
	readonly activeFragment: CodeTourViewFragment | null;
	readonly onConceptSelected: (conceptId: string) => void;
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
								<span
									style={{ backgroundColor: concept.domain.color }}
									aria-hidden="true"
								/>
								<strong>{concept.label}</strong>
								<small>{concept.fragmentIds.length} fragments</small>
							</button>
						))}
					</div>
					{activeFragment && (
						<FragmentCard fragment={activeFragment} sourceKind={tour.kind} />
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
	canvas,
	overlay,
	stage,
	stateRef,
	onConceptSelected,
	onFragmentSelected,
}: {
	readonly tour: CodeTourViewModel;
	readonly canvas: HTMLCanvasElement;
	readonly overlay: HTMLDivElement;
	readonly stage: HTMLDivElement;
	readonly stateRef: RefObject<ReaderStateRef>;
	readonly onConceptSelected: (conceptId: string) => void;
	readonly onFragmentSelected: (fragmentId: string) => void;
}): SceneHandles {
	const renderer = new THREE.WebGLRenderer({
		canvas,
		antialias: true,
		alpha: false,
		powerPreference: "high-performance",
	});
	renderer.setClearColor(0x11100d, 1);
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

	const labelRenderer = new CSS2DRenderer({ element: overlay });
	labelRenderer.domElement.style.position = "absolute";
	labelRenderer.domElement.style.inset = "0";
	labelRenderer.domElement.style.pointerEvents = "none";

	const scene = new THREE.Scene();
	scene.fog = new THREE.FogExp2(0x11100d, 0.018);
	const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 260);
	camera.position.set(7, 8, 28);

	const controls = new OrbitControls(camera, canvas);
	controls.enableDamping = true;
	controls.dampingFactor = 0.08;
	controls.enablePan = true;
	controls.maxDistance = 70;
	controls.minDistance = 5;
	controls.target.set(0, 0, 0);

	scene.add(new THREE.GridHelper(42, 18, 0x9d8a6d, 0x34302a));
	scene.add(buildAmbientPoints());

	const conceptPositions = conceptPositionMap(tour.concepts);
	const fragmentPositions = fragmentPositionMap(tour);
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
			domainColor: concept.domain.color,
			position: conceptPositions.get(concept.id) ?? new THREE.Vector3(),
			baseScale: conceptScales.get(concept.id) ?? 1,
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
			domainColor: fragment.domain.color,
			position: fragmentPositions.get(fragment.id) ?? new THREE.Vector3(),
			baseScale: (fragmentScales.get(fragment.id) ?? 1) * 0.72,
			onClick: () => onFragmentSelected(fragment.id),
		});
		scene.add(node.group);
		fragmentNodes.set(fragment.id, node);
	}

	const selectConceptRelationship = (edge: CodeTourViewEdge) => {
		const activeId = stateRef.current?.activeConceptId ?? "";
		onConceptSelected(relationshipNavigationTarget(edge, activeId));
	};
	const selectFragmentRelationship = (edge: CodeTourViewEdge) => {
		const activeId = stateRef.current?.activeFragmentId ?? "";
		onFragmentSelected(relationshipNavigationTarget(edge, activeId));
	};

	const conceptEdges = buildSceneEdges({
		edges: tour.conceptEdges,
		nodes: conceptNodes,
		scene,
		onClick: selectConceptRelationship,
	});
	const fragmentEdges = buildSceneEdges({
		edges: tour.fragmentEdges,
		nodes: fragmentNodes,
		scene,
		onClick: selectFragmentRelationship,
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
			if (state?.mode === "concept") selectConceptRelationship(hit.edge.edge);
			else selectFragmentRelationship(hit.edge.edge);
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
		camera,
		controls,
		conceptNodes,
		fragmentNodes,
		conceptEdges,
		fragmentEdges,
		focusPosition,
		focusTarget,
		animationFrame: null,
		dispose: () => {},
	};
	const resizeObserver = new ResizeObserver(() => resizeScene(handles, stage));

	handles.dispose = () => {
		if (handles.animationFrame !== null) {
			cancelAnimationFrame(handles.animationFrame);
		}
		resizeObserver.disconnect();
		canvas.removeEventListener("pointermove", pointerMove);
		canvas.removeEventListener("click", click);
		controls.dispose();
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
	domainColor,
	position,
	baseScale,
	onClick,
}: {
	readonly id: string;
	readonly kind: SceneNodeKind;
	readonly conceptId: string;
	readonly label: string;
	readonly count: string;
	readonly domainColor: string;
	readonly position: THREE.Vector3;
	readonly baseScale: number;
	readonly onClick: () => void;
}): SceneNode {
	const color = new THREE.Color(domainColor);
	const group = new THREE.Group();
	group.position.copy(position);
	group.scale.setScalar(baseScale);
	group.userData = { kind, id };

	const bodyMaterial = new THREE.MeshBasicMaterial({
		color,
		transparent: true,
		opacity: 0.2,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
	});
	const hitMesh = new THREE.Mesh(NODE_GEOMETRY, bodyMaterial);
	hitMesh.userData = { kind, id };
	group.add(hitMesh);

	const edgeMaterial = new THREE.LineBasicMaterial({
		color,
		transparent: true,
		opacity: 0.8,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
	});
	const wire = new THREE.LineSegments(NODE_EDGE_GEOMETRY, edgeMaterial);
	hitMesh.add(wire);

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
	labelObject.position.set(0, 1.55, 0);
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
		labelObject,
		labelElement,
		baseScale,
		domainColor: color,
	};
}

function buildSceneEdges({
	edges,
	nodes,
	scene,
	onClick,
}: {
	readonly edges: readonly CodeTourViewEdge[];
	readonly nodes: ReadonlyMap<string, SceneNode>;
	readonly scene: THREE.Scene;
	readonly onClick: (edge: CodeTourViewEdge) => void;
}): readonly SceneEdge[] {
	const sceneEdges: SceneEdge[] = [];
	for (const edge of edges) {
		const from = nodes.get(edge.from);
		const to = nodes.get(edge.to);
		if (!from || !to) continue;
		const curve = curveBetween(from.target, to.target);
		const geometry = new THREE.BufferGeometry().setFromPoints(
			curve.getPoints(42),
		);
		const material = new THREE.LineBasicMaterial({
			color: from.domainColor.clone().lerp(to.domainColor, 0.45),
			transparent: true,
			opacity: 0.24,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
		});
		const line = new THREE.Line(geometry, material);
		scene.add(line);

		const labelElement = document.createElement("button");
		labelElement.type = "button";
		labelElement.className = "rp1-code-tour-edge-label";
		labelElement.textContent = edge.label;
		labelElement.addEventListener("click", (event) => {
			event.stopPropagation();
			onClick(edge);
		});
		const labelObject = new CSS2DObject(labelElement);
		labelObject.position.copy(curve.getPoint(0.5));
		scene.add(labelObject);

		sceneEdges.push({
			edge,
			line,
			material,
			geometry,
			labelObject,
			labelElement,
		});
	}
	return sceneEdges;
}

function animateScene(
	handles: SceneHandles,
	stateRef: RefObject<ReaderStateRef>,
) {
	const state = stateRef.current;
	if (state) {
		updateSceneNodes(handles, state);
		updateSceneEdges(handles, state);
		handles.camera.position.lerp(handles.focusPosition, 0.045);
		handles.controls.target.lerp(handles.focusTarget, 0.045);
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
		updateNodeVisualState(node, isMode, isActive, isBridge);
	}

	for (const node of handles.fragmentNodes.values()) {
		const isMode = state.mode === "fragment";
		const isActive = node.id === state.activeFragmentId;
		const isSameConcept = node.conceptId === state.activeConceptId;
		const isBridge = fragmentBridgeIds.has(node.id);
		updateNodeVisualState(node, isMode, isActive, isSameConcept || isBridge);
	}
}

function updateNodeVisualState(
	node: SceneNode,
	isMode: boolean,
	isActive: boolean,
	isBridge: boolean,
) {
	const visibleOpacity = !isMode ? 0 : isActive ? 0.95 : isBridge ? 0.52 : 0.18;
	node.bodyMaterial.opacity = THREE.MathUtils.lerp(
		node.bodyMaterial.opacity,
		visibleOpacity * 0.3,
		0.12,
	);
	node.edgeMaterial.opacity = THREE.MathUtils.lerp(
		node.edgeMaterial.opacity,
		visibleOpacity,
		0.12,
	);
	const targetScale = node.baseScale * (isActive ? 1.28 : isBridge ? 1.08 : 1);
	const nextScale = THREE.MathUtils.lerp(node.group.scale.x, targetScale, 0.1);
	node.group.scale.setScalar(nextScale);
	node.hitMesh.rotation.y += isActive ? 0.004 : 0.0012;
	node.hitMesh.rotation.x += isActive ? 0.001 : 0.0003;
	node.group.visible = node.edgeMaterial.opacity > 0.01;
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
		updateEdgeVisualState(edge, state.mode === "concept", active);
	}

	for (const edge of handles.fragmentEdges) {
		const active =
			state.mode === "fragment" &&
			(edge.edge.from === state.activeFragmentId ||
				edge.edge.to === state.activeFragmentId);
		updateEdgeVisualState(edge, state.mode === "fragment", active);
	}
}

function updateEdgeVisualState(
	edge: SceneEdge,
	isMode: boolean,
	isActive: boolean,
) {
	const targetOpacity = !isMode ? 0 : isActive ? 0.88 : 0.18;
	edge.material.opacity = THREE.MathUtils.lerp(
		edge.material.opacity,
		targetOpacity,
		0.12,
	);
	edge.line.visible = edge.material.opacity > 0.02;
	edge.labelObject.visible = isMode && edge.material.opacity > 0.08;
	edge.labelElement.classList.toggle("is-active", isActive);
}

function focusSceneTarget(
	handles: SceneHandles | null,
	state: ReaderStateRef | null,
) {
	if (!handles || !state) return;
	const node =
		state.mode === "concept"
			? handles.conceptNodes.get(state.activeConceptId)
			: (handles.fragmentNodes.get(state.activeFragmentId) ??
				handles.fragmentNodes.get(state.activeConceptId));
	if (!node) return;

	const offset =
		state.mode === "concept"
			? new THREE.Vector3(6, 5, 14)
			: new THREE.Vector3(4, 3, 12);
	handles.focusTarget.copy(node.target);
	handles.focusPosition.copy(node.target).add(offset);
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

function buildAmbientPoints() {
	const count = 420;
	const positions = new Float32Array(count * 3);
	for (let index = 0; index < count; index += 1) {
		const seed = index * 12.9898;
		const x = (fract(Math.sin(seed) * 43758.5453) - 0.5) * 70;
		const y = (fract(Math.sin(seed + 8.12) * 23421.631) - 0.5) * 20 + 2;
		const z = (fract(Math.sin(seed + 3.47) * 12914.019) - 0.5) * 70;
		positions[index * 3] = x;
		positions[index * 3 + 1] = y;
		positions[index * 3 + 2] = z;
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	const material = new THREE.PointsMaterial({
		color: 0xd2bea0,
		size: 0.035,
		transparent: true,
		opacity: 0.34,
		depthWrite: false,
		sizeAttenuation: true,
	});
	return new THREE.Points(geometry, material);
}

function conceptPositionMap(
	concepts: readonly CodeTourViewConcept[],
): ReadonlyMap<string, THREE.Vector3> {
	const positions = new Map<string, THREE.Vector3>();
	const epicenter = concepts.find((concept) => concept.epicenter);
	const radialConcepts = concepts.filter((concept) => concept !== epicenter);
	if (epicenter) positions.set(epicenter.id, new THREE.Vector3(0, 0, 0));

	const count = Math.max(radialConcepts.length, 1);
	for (const [index, concept] of radialConcepts.entries()) {
		const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
		positions.set(
			concept.id,
			new THREE.Vector3(
				Math.cos(angle) * CONCEPT_RADIUS,
				index % 2 === 0 ? 1.4 : -1.4,
				Math.sin(angle) * CONCEPT_RADIUS,
			),
		);
	}

	if (!epicenter && concepts[0]) {
		positions.set(concepts[0].id, new THREE.Vector3(0, 0, 0));
	}

	return positions;
}

function fragmentPositionMap(
	tour: CodeTourViewModel,
): ReadonlyMap<string, THREE.Vector3> {
	const positions = new Map<string, THREE.Vector3>();
	const columns = Math.max(tour.concepts.length, 1);

	tour.concepts.forEach((concept, columnIndex) => {
		const fragments = tour.fragmentsByConceptId.get(concept.id) ?? [];
		const x = (columnIndex - (columns - 1) / 2) * FRAGMENT_COLUMN_GAP;
		const yStart = ((fragments.length - 1) * 2.7) / 2;
		fragments.forEach((fragment, rowIndex) => {
			positions.set(
				fragment.id,
				new THREE.Vector3(x, yStart - rowIndex * 2.7, 0),
			);
		});
	});

	return positions;
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
		node.labelElement.remove();
	}
}

function disposeEdges(edges: readonly SceneEdge[]) {
	for (const edge of edges) {
		edge.material.dispose();
		edge.geometry.dispose();
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

function fract(value: number): number {
	return value - Math.floor(value);
}
