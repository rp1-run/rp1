import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { cn } from "@/lib/utils";

export interface ArtifactEmptyStateProps {
	className?: string;
}

type ArtifactEmptyStateTone = "muted" | "cyan" | "green" | "lime" | "yellow";

interface ArtifactEmptyStateSegment {
	readonly text: string;
	readonly tone: ArtifactEmptyStateTone;
}

type ArtifactEmptyStateLine = readonly ArtifactEmptyStateSegment[];

interface CodeStreamVariant {
	readonly command: string;
	readonly lines: readonly ArtifactEmptyStateLine[];
}

const ARTIFACT_EMPTY_STATE_TONE_FILL: Record<ArtifactEmptyStateTone, string> = {
	muted: "currentColor",
	cyan: "#06b6d4",
	green: "#16a34a",
	lime: "#84cc16",
	yellow: "#ca8a04",
};

const segment = (
	text: string,
	tone: ArtifactEmptyStateTone = "muted",
): ArtifactEmptyStateSegment => ({ text, tone });

const line = (
	text: string,
	tone: ArtifactEmptyStateTone = "muted",
): ArtifactEmptyStateLine => [segment(text, tone)];

const parts = (
	...segments: readonly ArtifactEmptyStateSegment[]
): ArtifactEmptyStateLine => segments;

const kw = (text: string) => segment(text, "cyan");
const value = (text: string) => segment(text, "yellow");
const str = (text: string) => segment(text, "green");
const cursor = (text: string) => segment(text, "lime");

const CODE_STREAM_VARIANTS = [
	{
		command: "tail -f run-output --until artifact_registered",
		lines: [
			line("  // hydrate the right panel as soon as files appear", "green"),
			parts(
				kw("  async "),
				segment("function "),
				cursor("watchArtifacts"),
				segment("(runId: string) {"),
			),
			parts(
				segment("    const stream = "),
				kw("await "),
				segment("events.open(runId);"),
			),
			parts(
				segment("    const panel = createArtifactPanel({ "),
				value("mode"),
				segment(": "),
				str('"aggregate"'),
				segment(" });"),
			),
			line(""),
			parts(segment("    for await (const event of stream) {")),
			parts(
				segment("      if (event.type !== "),
				str('"artifact_registered"'),
				segment(") continue;"),
			),
			parts(
				segment("      const artifact = resolveArtifactPath(event.payload);"),
			),
			parts(segment("      panel.queue(artifact);")),
			parts(
				segment("      panel.status = "),
				str('"visible in right panel"'),
				segment(";"),
			),
			parts(segment("    }")),
			parts(segment("  }")),
		],
	},
	{
		command: "grep -R artifact_registered .rp1/work/features/*",
		lines: [
			line("  // keep the file strip populated without step hunting", "green"),
			parts(
				kw("  export "),
				segment("function mergeArtifactRegistration(state, event) {"),
			),
			parts(
				segment("    const artifact = "),
				kw("parseArtifactEvent"),
				segment("(event);"),
			),
			parts(
				segment(
					"    const existing = state.files.find((file) => file.docId === artifact.docId);",
				),
			),
			line(""),
			parts(segment("    if (existing) {")),
			parts(segment("      existing.path = artifact.path;")),
			parts(segment("      existing.updatedDuringRun = true;")),
			parts(segment("      return state.withFocus(existing.docId);")),
			parts(segment("    }")),
			parts(
				segment("    return state.append(artifact).withFocus(artifact.docId);"),
			),
			parts(segment("  }")),
		],
	},
	{
		command: "rp1 agent-tools emit --event artifact_registered ?",
		lines: [
			line("  // normalize all run and step outputs into one list", "green"),
			parts(
				kw("  const "),
				segment("groups = new Map<string, ArtifactGroup>();"),
			),
			parts(segment("  for (const artifact of run.artifacts) {")),
			parts(
				segment("    const groupKey = artifact.step ?? "),
				str('"run"'),
				segment(";"),
			),
			parts(
				segment(
					"    const group = groups.get(groupKey) ?? createArtifactGroup(groupKey);",
				),
			),
			parts(segment("    group.files.push(artifact);")),
			parts(segment("    groups.set(groupKey, group);")),
			parts(segment("  }")),
			line(""),
			parts(
				segment(
					"  return orderBySelectedStep([...groups.values()], currentStep);",
				),
			),
		],
	},
	{
		command: "resolve storageRoot=work_dir path=features/.../*.md",
		lines: [
			line(
				"  // resolve storage roots before the content viewer asks",
				"green",
			),
			parts(kw("  async "), segment("function resolveArtifact(artifact) {")),
			parts(
				segment("    const root = artifact.storageRoot ?? "),
				str('"work_dir"'),
				segment(";"),
			),
			parts(
				segment(
					"    const absolutePath = await projectPaths.resolve(root, artifact.path);",
				),
			),
			parts(segment("    return {")),
			parts(segment("      ...artifact,")),
			parts(segment("      absolutePath,")),
			parts(segment("      basename: path.basename(artifact.path),")),
			parts(segment("      ready: await fileExists(absolutePath),")),
			parts(segment("    };")),
			parts(segment("  }")),
		],
	},
	{
		command: "render aggregate panel",
		lines: [
			line("  // render a seamless horizontal file strip", "green"),
			parts(
				kw("  function "),
				segment("ArtifactStrip({ files, selectedDocId }) {"),
			),
			parts(segment("    return files.map((file) => (")),
			parts(segment("      <FileButton")),
			parts(segment("        key={file.docId}")),
			parts(segment("        active={file.docId === selectedDocId}")),
			parts(segment("        icon={FileText}")),
			parts(segment("        label={file.basename}")),
			parts(segment("        onClick={() => openArtifact(file)}")),
			parts(segment("      />")),
			parts(segment("    ));")),
			parts(segment("  }")),
		],
	},
	{
		command: "await next artifact_registered event",
		lines: [
			line(
				"  // socket events patch the current run without a full reload",
				"green",
			),
			parts(
				kw("  const "),
				segment("unsubscribe = socket.on("),
				str('"event:notification"'),
				segment(", (message) => {"),
			),
			parts(
				segment("    if (message.payload.event !== "),
				str('"artifact_registered"'),
				segment(") return;"),
			),
			parts(segment("    liveRunIndex.patch(message.runId, (run) => ({")),
			parts(segment("      ...run,")),
			parts(
				segment(
					"      artifacts: mergeArtifactRegistration(run.artifacts, message.payload),",
				),
			),
			parts(segment("      lastEventAt: message.timestamp,")),
			parts(segment("    }));")),
			parts(segment("    hydrateVisibleRun(message.runId);")),
			parts(segment("  });")),
		],
	},
	{
		command: "watch .rp1/work --event write --artifact",
		lines: [
			line("  // file writes become rows before the agent finishes", "green"),
			parts(
				kw("  async "),
				segment("function indexWorkFile(filePath: string) {"),
			),
			parts(segment("    const metadata = await readFrontmatter(filePath);")),
			parts(segment("    if (!metadata.rp1_doc_id) return null;")),
			parts(segment("    return {")),
			parts(segment("      docId: metadata.rp1_doc_id,")),
			parts(segment("      path: toProjectRelativePath(filePath),")),
			parts(segment("      type: detectArtifactType(filePath),")),
			parts(segment("      updatedDuringRun: true,")),
			parts(segment("    };")),
			parts(segment("  }")),
		],
	},
	{
		command: "build artifact index --visible-first",
		lines: [
			line(
				"  // keep the selected artifact first, then preserve run order",
				"green",
			),
			parts(
				kw("  function "),
				segment("visibleArtifacts(groups, selectedArtifact) {"),
			),
			parts(
				segment("    const flat = groups.flatMap((group) => group.artifacts);"),
			),
			parts(
				segment(
					"    const selected = flat.find((item) => item.docId === selectedArtifact?.docId);",
				),
			),
			parts(segment("    if (!selected) return flat;")),
			line(""),
			parts(segment("    return [")),
			parts(segment("      selected,")),
			parts(
				segment(
					"      ...flat.filter((item) => item.docId !== selected.docId),",
				),
			),
			parts(segment("    ];")),
			parts(segment("  }")),
		],
	},
	{
		command: "stream markdown drafts into artifact panel",
		lines: [
			line(
				"  // markdown drafts become inspectable as soon as they exist",
				"green",
			),
			parts(
				kw("  async "),
				segment("function publishDraft(featureId, name, body) {"),
			),
			parts(
				segment("    const path = "),
				str('"features/"'),
				segment(" + featureId + "),
				str('"/"'),
				segment(" + name + "),
				str('".md"'),
				segment(";"),
			),
			parts(segment("    await workDir.write(path, body);")),
			parts(segment("    await emit({")),
			parts(
				segment("      event: "),
				str('"artifact_registered"'),
				segment(","),
			),
			parts(segment("      storageRoot: "), str('"work_dir"'), segment(",")),
			parts(segment("      path,")),
			parts(segment("      type: "), str('"markdown"'), segment(",")),
			parts(segment("    });")),
			parts(segment("  }")),
		],
	},
	{
		command: "compile artifact groups --no-tabs",
		lines: [
			line("  // one surface, many files, no step tabs required", "green"),
			parts(
				kw("  const "),
				segment("artifactRows = groups.reduce((rows, group) => {"),
			),
			parts(segment("    for (const artifact of group.artifacts) {")),
			parts(segment("      rows.push({")),
			parts(segment("        id: artifact.docId,")),
			parts(segment("        label: basename(artifact.path),")),
			parts(
				segment("        sourceStep: group.stepId ?? "),
				str('"run"'),
				segment(","),
			),
			parts(segment("        open: () => selectArtifact(artifact),")),
			parts(segment("      });")),
			parts(segment("    }")),
			parts(segment("    return rows;")),
			parts(segment("  }, []);")),
		],
	},
] satisfies readonly CodeStreamVariant[];

const ARTIFACT_EMPTY_STATE_FOOTERS = [
	[
		line(" stdout  [:::: scan active ::::]"),
		line(" emit    [                  ]  waiting for first artifact"),
		line(" panel   [ empty            ]"),
	],
	[
		line(" stdout  [::::::::::::] -- bytes -- -- --"),
		line(" emit    [====              ]  detecting handoff"),
		line(" panel   [ empty            ]"),
	],
	[
		line(" stdout  [::::::::::::]"),
		line(" emit    [============      ]  registry opening"),
		line(" panel   [ empty            ]"),
	],
	[
		line(" stdout  [::::::::::::]  draft.md"),
		line(" emit    [================] metadata resolved"),
		line(" panel   [....            ] file row forming"),
	],
	[
		line(" stdout  [::::::::::::]  emit [====================]"),
		line(" panel   [ file-list ghosted until first registered artifact ]"),
		line(" cursor  [ steady ]"),
	],
	[
		line(" stdout  [::::::::::::]  emit [....................]"),
		line(" panel   [ empty, listening ]"),
		line(" cursor  [ steady ]"),
	],
] satisfies readonly (readonly ArtifactEmptyStateLine[])[];

export const ARTIFACT_EMPTY_STATE_VARIANT_COUNT = CODE_STREAM_VARIANTS.length;
export const ARTIFACT_EMPTY_STATE_FRAME_COUNT = 6;
export const ARTIFACT_EMPTY_STATE_FRAME_INTERVAL_MS = 440;

const FINAL_FRAME_INDEX = ARTIFACT_EMPTY_STATE_FRAME_COUNT - 1;

const addCursor = (line: ArtifactEmptyStateLine): ArtifactEmptyStateLine => [
	...line,
	cursor(" |"),
];

const buildFrameLines = (
	variant: CodeStreamVariant,
	frameIndex: number,
): readonly ArtifactEmptyStateLine[] => {
	const revealCount = Math.min(
		variant.lines.length,
		Math.ceil(
			((frameIndex + 1) / ARTIFACT_EMPTY_STATE_FRAME_COUNT) *
				variant.lines.length,
		),
	);
	const visibleLines = variant.lines.slice(0, revealCount);
	const animatedLines = visibleLines.map((codeLine, index) =>
		index === visibleLines.length - 1 && frameIndex !== FINAL_FRAME_INDEX
			? addCursor(codeLine)
			: codeLine,
	);

	return [
		line(" rp1://arcade/artifacts"),
		line(` $ ${variant.command}`),
		line(""),
		...animatedLines,
		line(""),
		...(ARTIFACT_EMPTY_STATE_FOOTERS[frameIndex] ?? []),
	];
};

const ARTIFACT_EMPTY_STATE_VARIANT_FRAMES = CODE_STREAM_VARIANTS.map(
	(variant) =>
		Array.from({ length: ARTIFACT_EMPTY_STATE_FRAME_COUNT }, (_, frameIndex) =>
			buildFrameLines(variant, frameIndex),
		),
);

const randomVariantIndex = () =>
	Math.floor(Math.random() * ARTIFACT_EMPTY_STATE_VARIANT_COUNT);

export function ArtifactEmptyState({ className }: ArtifactEmptyStateProps) {
	const prefersReducedMotion = usePrefersReducedMotion();
	const [variantIndex] = useState(randomVariantIndex);
	const [frameIndex, setFrameIndex] = useState(() =>
		prefersReducedMotion ? FINAL_FRAME_INDEX : 0,
	);
	const variantFrames =
		ARTIFACT_EMPTY_STATE_VARIANT_FRAMES[variantIndex] ??
		ARTIFACT_EMPTY_STATE_VARIANT_FRAMES[0];

	useEffect(() => {
		if (prefersReducedMotion) {
			setFrameIndex(FINAL_FRAME_INDEX);
			return;
		}

		setFrameIndex(0);

		const intervalId = window.setInterval(() => {
			setFrameIndex(
				(current) => (current + 1) % ARTIFACT_EMPTY_STATE_FRAME_COUNT,
			);
		}, ARTIFACT_EMPTY_STATE_FRAME_INTERVAL_MS);

		return () => {
			window.clearInterval(intervalId);
		};
	}, [prefersReducedMotion]);

	return (
		<output
			aria-live="polite"
			aria-label="Waiting for artifacts"
			className={cn(
				"flex h-full min-h-[18rem] w-full items-center justify-center px-0 py-6",
				className,
			)}
		>
			<span className="sr-only">Waiting for artifacts</span>
			<svg
				aria-hidden="true"
				data-testid="artifact-empty-state-visual"
				data-animation-state={prefersReducedMotion ? "static" : "running"}
				data-frame-index={frameIndex}
				data-variant-index={variantIndex}
				viewBox="0 0 680 360"
				className="aspect-[17/9] w-[90%] min-w-[min(20rem,92%)] max-w-none select-none overflow-visible text-muted-foreground/65"
			>
				{variantFrames[frameIndex].map((line, index) => (
					<text
						key={`${index}-${line.map((item) => item.text).join("")}`}
						x="2"
						y={22 + index * 13}
						className="font-mono text-[9px] leading-none"
						xmlSpace="preserve"
					>
						{line.map((item, segmentIndex) => (
							<tspan
								key={`${segmentIndex}-${item.text}`}
								data-segment-tone={item.tone}
								style={{ fill: ARTIFACT_EMPTY_STATE_TONE_FILL[item.tone] }}
							>
								{item.text}
							</tspan>
						))}
					</text>
				))}
			</svg>
		</output>
	);
}
