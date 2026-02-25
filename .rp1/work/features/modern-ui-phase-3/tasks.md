# Development Tasks: Modern UI Phase 3 -- Visual Polish

**Feature ID**: modern-ui-phase-3
**Status**: In Progress
**Progress**: 36% (4 of 11 tasks)
**Estimated Effort**: 5 days
**Started**: 2026-02-25

## Overview

Phase 3 adds motion design and visual effects to the rp1 WebUI: framer-motion page transitions, list stagger, hover/tap micro-interactions, a reusable StatusGlow component, glassmorphic overlay surfaces, glow-pulse running indicator, and status-colored RunCard accent bars. All animations respect `prefers-reduced-motion` via a custom hook on the existing `useMediaQuery` infrastructure.

## Implementation DAG

**Parallel Groups** (tasks with no inter-dependencies):

1. [T1] - Foundation: no dependencies, all other tasks depend on this
2. [T2, T3, T4, T5, T6, T8] - All depend only on T1; no inter-dependencies among them
3. [T7, T9] - T7 depends on T2 (uses StatusGlow in RunCard); T9 depends on T5 (extends card motion with glass hover)

**Dependencies**:

- T2 -> T1 (interface: uses CSS glow variables and motion config from T1)
- T3 -> T1 (interface: imports motion, AnimatePresence, page variants from T1)
- T4 -> T1 (interface: imports motion, stagger variants from T1)
- T5 -> T1 (interface: imports motion, card hover/tap config from T1)
- T6 -> T1 (interface: imports motion, overlay variants from T1)
- T7 -> T1 (interface: uses status color mapping from T1)
- T7 -> T2 (interface: RunCard may wrap content with StatusGlow for running items)
- T8 -> T1 (interface: uses glow-pulse CSS keyframe from T1)
- T9 -> T5 (sequential: builds glass hover on top of card motion.div from T5)

**Critical Path**: T1 -> T5 -> T9 (or T1 -> T2 -> T7)

## Task Breakdown

### Foundation

- [x] **T1**: Install framer-motion and create shared animation infrastructure -- motion-config.ts with all variant definitions, usePrefersReducedMotion hook, glow-pulse CSS keyframes in globals.css, and status color mapping utility `[complexity:medium]`

    **Implementation Summary**:

    - **Files**: `cli/web-ui/package.json`, `cli/web-ui/src/lib/motion-config.ts`, `cli/web-ui/src/hooks/usePrefersReducedMotion.ts`, `cli/web-ui/src/lib/status-colors.ts`, `cli/web-ui/src/styles/globals.css`
    - **Approach**: Added framer-motion ^11.18.0 to package.json; created centralized motion-config.ts with all variant definitions (page, stagger, card, overlay) plus reduced-motion variants; created usePrefersReducedMotion hook wrapping existing useMediaQuery; created status-colors.ts with border and glow color mappings for all 6 RunStatus values; added glow-pulse keyframes, glow-status-* utilities, border-l-status-* utilities, and reduced-motion override to globals.css
    - **Deviations**: framer-motion could not be installed via `bun add` due to VPN/network issue (per AGENTS.md guidance); dependency added to package.json manually -- user needs to run `bun install` once network is available. Also added border-l-status-* CSS utilities (not explicitly in design) because the status-colors.ts statusBorderColors mapping references them and downstream tasks (T7) will need them.
    - **Tests**: TypeScript type check passes (tsc --noEmit)

    **Validation Summary**:

    | Dimension | Status |
    |-----------|--------|
    | Discipline | PASS |
    | Accuracy | PASS |
    | Completeness | PASS |
    | Quality | PASS |
    | Testing | N/A |
    | Commit | PASS |
    | Comments | PASS |

    **Reference**: [design.md#31-new-files](design.md#31-new-files), [design.md#32-modified-files](design.md#32-modified-files)

    **Effort**: 6 hours

    **Acceptance Criteria**:

    - [x] framer-motion ^11.0.0 is listed in `cli/web-ui/package.json` dependencies and installed via `bun add framer-motion`
    - [x] `cli/web-ui/src/lib/motion-config.ts` exports pageVariants, pageVariantsReduced, pageTransition, pageTransitionReduced, staggerContainer, staggerContainerReduced, staggerItem, staggerItemReduced, cardHover, cardTap, overlayBackdropVariants, overlayBackdropTransition, overlayPanelVariants, overlayPanelTransition
    - [x] `cli/web-ui/src/hooks/usePrefersReducedMotion.ts` exports a hook that returns boolean based on `useMediaQuery("(prefers-reduced-motion: reduce)")`
    - [x] `cli/web-ui/src/styles/globals.css` contains `@keyframes glow-pulse` (0%/100% subtle, 50% strong box-shadow), `.animate-glow-pulse` class, and `@media (prefers-reduced-motion: reduce)` override that disables glow-pulse animation
    - [x] `cli/web-ui/src/styles/globals.css` contains `.glow-status-*` utility classes for all six run statuses (running, failed, completed, waiting, needs-review, queued)
    - [x] `cli/web-ui/src/lib/status-colors.ts` exports `statusBorderColors` and `statusGlowColors` Record<RunStatus, string> mappings covering all six statuses
    - [x] All framer-motion imports use named imports only (`{ motion, AnimatePresence }`)

### Core Animations and Components

- [x] **T2**: Create StatusGlow reusable wrapper component with status-colored box-shadow glow, optional pulse animation, and intensity control `[complexity:medium]`

    **Implementation Summary**:

    - **Files**: `cli/web-ui/src/components/v2/StatusGlow.tsx`
    - **Approach**: Created a div wrapper component that applies status-colored box-shadow glow via inline styles. Uses `statusGlowColors` from status-colors.ts for color mapping, `intensitySpreads` for subtle/normal/strong spread control, and the `animate-glow-pulse` CSS class for pulse mode. When pulse is active with reduced motion, falls back to static glow at strong intensity. Extended CSSProperties with a `GlowCSSProperties` interface for the `--glow-color` custom property. Passes through className (via cn) and HTML div attributes via rest spread.
    - **Deviations**: None
    - **Tests**: TypeScript type check passes; Biome lint passes

    **Reference**: [design.md#31-new-files](design.md#31-new-files)

    **Effort**: 4 hours

    **Acceptance Criteria**:

    - [x] `cli/web-ui/src/components/v2/StatusGlow.tsx` exists and exports a StatusGlow component
    - [x] Component accepts required `status` prop (RunStatus type) and optional `pulse` (boolean, default false), `intensity` ("subtle" | "normal" | "strong", default "normal"), `className` (string), and `children` (ReactNode) props
    - [x] Each status maps to the correct glow color via CSS variables: running=blue, failed=red, completed=green, waiting=amber, needs-review=purple, queued=muted
    - [x] Intensity prop controls box-shadow spread: subtle=`0 0 8px 1px`, normal=`0 0 16px 2px`, strong=`0 0 24px 4px`
    - [x] When `pulse=true` and reduced motion is off, the `animate-glow-pulse` class is applied
    - [x] When `pulse=true` and reduced motion is on, a static glow at max intensity is shown (no animation)
    - [x] Component renders a div wrapper, passes through className and standard HTML div attributes via rest spread
    - [x] Glow is applied via box-shadow and does not affect layout

    **Validation Summary**:

    | Dimension | Status |
    |-----------|--------|
    | Discipline | ✅ PASS |
    | Accuracy | ✅ PASS |
    | Completeness | ✅ PASS |
    | Quality | ✅ PASS |
    | Testing | ⏭️ N/A |
    | Commit | ✅ PASS |
    | Comments | ✅ PASS |

- [x] **T3**: Add AnimatePresence page transitions to V2Layout wrapping both Outlet render paths with opacity+translateY animation `[complexity:medium]`

    **Implementation Summary**:

    - **Files**: `cli/web-ui/src/app/V2Layout.tsx`
    - **Approach**: Wrapped both Outlet render paths (full-height and ScrollArea-wrapped) with AnimatePresence mode="wait" + motion.div keyed by location.pathname; conditionally selects pageVariantsReduced/pageTransitionReduced when prefers-reduced-motion is active; replaced existing div.p-6 wrapper with the motion.div to avoid extra DOM nesting
    - **Deviations**: None
    - **Tests**: N/A (animation wiring; no testable business logic)

    **Reference**: [design.md#32-modified-files](design.md#32-modified-files)

    **Effort**: 4 hours

    **Acceptance Criteria**:

    - [x] `cli/web-ui/src/app/V2Layout.tsx` imports AnimatePresence and motion from framer-motion, page variants from motion-config.ts, and usePrefersReducedMotion hook
    - [x] Both the ScrollArea-wrapped Outlet path and the full-height Outlet path are wrapped with `<AnimatePresence mode="wait">` and a `<motion.div>` keyed by `location.pathname`
    - [x] Transition uses pageVariants (opacity 0->1, y 8->0 enter; opacity 1->0, y 0->-8 exit) with 200ms ease-out
    - [x] When prefers-reduced-motion is active, pageVariantsReduced and pageTransitionReduced are used (zero duration, final state)
    - [x] No flash of blank content or layout shift occurs during route transitions
    - [x] The existing `<div className="p-6">` wrapper is replaced by the motion.div (no extra wrapper added)

    **Validation Summary**:

    | Dimension | Status |
    |-----------|--------|
    | Discipline | ✅ PASS |
    | Accuracy | ✅ PASS |
    | Completeness | ✅ PASS |
    | Quality | ✅ PASS |
    | Testing | ⏭️ N/A |
    | Commit | ✅ PASS |
    | Comments | ✅ PASS |

- [ ] **T4**: Add staggered entrance animations to AttentionSection run lists and ProjectsPage project grid `[complexity:medium]`

    **Reference**: [design.md#32-modified-files](design.md#32-modified-files)

    **Effort**: 4 hours

    **Acceptance Criteria**:

    - [ ] `cli/web-ui/src/components/v2/AttentionSection.tsx` wraps the non-virtualized `<ul>` with `<motion.ul>` using staggerContainer variants and each `<li>` with `<motion.li>` using staggerItem variants
    - [ ] `cli/web-ui/src/pages/v2/ProjectsPage.tsx` wraps the project grid `<div>` with `<motion.div>` using staggerContainer variants and each ProjectCard in a `<motion.div>` with staggerItem variants
    - [ ] Stagger delay is 40ms between children (staggerChildren: 0.04)
    - [ ] Each item animates from opacity 0 + translateY 8px to opacity 1 + translateY 0
    - [ ] Virtualized list path in AttentionSection remains unchanged (no stagger applied)
    - [ ] Existing `animate-in fade-in duration-200` class on list items is removed (framer-motion handles entrance)
    - [ ] When prefers-reduced-motion is active, staggerContainerReduced and staggerItemReduced are used (all items appear immediately)

- [x] **T5**: Add whileHover and whileTap micro-interactions to RunCard and ProjectCard using framer-motion `[complexity:medium]`

    **Implementation Summary**:

    - **Files**: `cli/web-ui/src/components/v2/RunCard.tsx`, `cli/web-ui/src/components/v2/ProjectCard.tsx`
    - **Approach**: Converted outer div to motion.div in both components; added whileHover (cardHover: scale 1.02, y -1, spring stiffness 400, damping 25) and whileTap (cardTap: scale 0.97, 80ms) from centralized motion-config.ts; conditionally set to undefined when usePrefersReducedMotion returns true; removed now-unused biome-ignore suppressions for useSemanticElements (motion.div does not trigger the rule)
    - **Deviations**: None
    - **Tests**: N/A (animation wiring; framer-motion handles transform-only behavior internally)

    **Reference**: [design.md#32-modified-files](design.md#32-modified-files)

    **Effort**: 4 hours

    **Acceptance Criteria**:

    - [x] `cli/web-ui/src/components/v2/RunCard.tsx` converts its outer div to `<motion.div>` with whileHover (scale 1.02, y -1, spring stiffness 400 damping 25) and whileTap (scale 0.97, 80ms)
    - [x] `cli/web-ui/src/components/v2/ProjectCard.tsx` converts its outer div to `<motion.div>` with identical whileHover and whileTap config
    - [x] Hover effect uses transform only (no layout reflow of surrounding elements)
    - [x] On mouse out, cards return to original scale and position smoothly
    - [x] When prefers-reduced-motion is active, whileHover and whileTap are conditionally set to undefined (no motion)
    - [x] Existing CSS-based hover effects (background color changes) continue to work alongside framer-motion

- [ ] **T6**: Apply glassmorphic effect and framer-motion entry/exit animation to Command Palette, and glass effect to Shortcut Help Overlay `[complexity:complex]`

    **Reference**: [design.md#32-modified-files](design.md#32-modified-files)

    **Effort**: 8 hours

    **Acceptance Criteria**:

    - [ ] `cli/web-ui/src/components/v2/CommandPalette.tsx` renders the dialog surface with glassmorphic effect (backdrop-filter blur, semi-transparent background, subtle border)
    - [ ] Command Palette uses AnimatePresence with Radix Dialog (Option B: keep Radix for focus-trap/aria, override CSS animations with framer-motion via forceMount)
    - [ ] Backdrop fades in over 150ms; dialog panel animates from scale 0.95 + opacity 0 to scale 1.0 + opacity 1
    - [ ] Closing the palette reverses the animation (fade out + scale down)
    - [ ] Results list items stagger in after panel animation (stagger on CommandItem wrappers)
    - [ ] Glass effect is visible in both dark and light themes
    - [ ] `cli/web-ui/src/components/v2/ShortcutHelpOverlay.tsx` adds `glass` class to DialogContent (`className="max-w-md gap-6 glass"`)
    - [ ] When prefers-reduced-motion is active, palette appears and disappears instantly (no animation) but glass effect remains
    - [ ] Radix Dialog accessibility features (focus-trap, aria attributes, Escape to close) remain fully functional

- [ ] **T8**: Replace spinning Loader2 icon on running status in StatusBadge with a glow-pulsing filled circle indicator `[complexity:simple]`

    **Reference**: [design.md#32-modified-files](design.md#32-modified-files)

    **Effort**: 2 hours

    **Acceptance Criteria**:

    - [ ] `cli/web-ui/src/components/v2/StatusBadge.tsx` no longer imports or renders Loader2 for the running status
    - [ ] Running status renders a small filled circle (8x8px or matching icon size) with `bg-status-running rounded-full` styling
    - [ ] The filled circle has `animate-glow-pulse` class and inline `--glow-color: hsl(var(--status-running) / 0.5)` style
    - [ ] The status config replaces `animate: true` (spin trigger) with a `glowPulse: true` field
    - [ ] Glow pulse cycles over 2 seconds, smoothly transitioning between subtle and prominent intensity
    - [ ] With prefers-reduced-motion active, the glow is static at prominent intensity (no animation, CSS media query handles this)

### Dependent Enhancements

- [ ] **T7**: Add status-colored left accent bar to RunCard with glow effect on hover and selected states `[complexity:medium]`

    **Reference**: [design.md#32-modified-files](design.md#32-modified-files), [design.md#33-status-color-mapping-utility](design.md#33-status-color-mapping-utility)

    **Effort**: 4 hours

    **Acceptance Criteria**:

    - [ ] Every RunCard renders a left border accent bar (3px wide via `border-l-[3px]`) colored by run status using the statusBorderColors mapping from status-colors.ts
    - [ ] Status-to-border mapping: running=border-l-status-running, failed=border-l-status-failed, completed=border-l-status-completed, waiting=border-l-status-waiting, needs-review=border-l-status-needs-review, queued=border-l-status-queued
    - [ ] The previous `border-l-2 border-l-primary` selected state is replaced with the status-colored accent bar
    - [ ] On hover, the accent bar gains a subtle left-side glow via `box-shadow: -4px 0 12px -2px hsl(var(--status-{color}) / 0.4)`
    - [ ] On selected state (keyboard navigation or click), the accent bar glow is at maximum intensity
    - [ ] Accent bars are always visible on all RunCards (not only on selected state)

- [ ] **T9**: Add glassmorphic background transition on hover to ProjectCard, layered on top of framer-motion whileHover `[complexity:simple]`

    **Reference**: [design.md#32-modified-files](design.md#32-modified-files)

    **Effort**: 2 hours

    **Acceptance Criteria**:

    - [ ] `cli/web-ui/src/components/v2/ProjectCard.tsx` applies a glassmorphic background effect on hover via CSS transition (not framer-motion) on background-color, backdrop-filter, and border-color
    - [ ] On hover, card transitions to semi-transparent background, backdrop-filter blur(8px), and brighter border
    - [ ] The glass hover is combined with the framer-motion whileHover scale/translate from T5
    - [ ] Transition from normal to glass state is smooth (CSS transition timing, not instant)
    - [ ] On mouse-out, the card returns to its normal non-glass appearance
    - [ ] Glass hover effect is visible in both dark and light themes

### User Docs

- [ ] **TD1**: Update modules.md - Web UI components `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#documentation-impact)

    **Type**: edit

    **Target**: `.rp1/context/modules.md`

    **Section**: Web UI components

    **KB Source**: modules.md

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [ ] Section reflects the new StatusGlow component and updated component list (modified RunCard, ProjectCard, StatusBadge, AttentionSection, CommandPalette, ShortcutHelpOverlay, V2Layout)
    - [ ] New motion-config.ts, usePrefersReducedMotion.ts, and status-colors.ts modules are documented

- [ ] **TD2**: Update patterns.md - Frontend patterns `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#documentation-impact)

    **Type**: edit

    **Target**: `.rp1/context/patterns.md`

    **Section**: Frontend patterns

    **KB Source**: patterns.md

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [ ] Section documents the motion/animation pattern: centralized variants in motion-config.ts, reduced-motion hook usage, conditional variant selection pattern
    - [ ] Pattern for framer-motion integration with Radix Dialog (Option B: forceMount + AnimatePresence) is documented

## Acceptance Criteria Checklist

### Page Transitions
- [ ] AC-PT-01: Route changes play exit animation (opacity fade out + translateY) on departing page and entrance animation on arriving page
- [ ] AC-PT-02: Transition duration is approximately 200ms with ease-out easing
- [ ] AC-PT-03: Both ScrollArea-wrapped and full-height Outlet paths wrapped identically with AnimatePresence
- [ ] AC-PT-04: Key prop derived from location.pathname
- [ ] AC-PT-05: No flash of blank content or layout shift during transition
- [ ] AC-PT-06: With prefers-reduced-motion, transitions are instant (no animation)

### List Stagger
- [ ] AC-LS-01: List items stagger in with 40ms delay, opacity 0 + translateY to final position
- [ ] AC-LS-02: Stagger visible on lists of 3+ items
- [ ] AC-LS-03: Virtualized lists exempt from stagger
- [ ] AC-LS-04: With prefers-reduced-motion, all items appear simultaneously

### Hover/Tap Micro-Interactions
- [ ] AC-HT-01: Cards scale to 1.02x and translate -1px on hover
- [ ] AC-HT-02: Buttons scale to 0.97x on press
- [ ] AC-HT-03: No layout reflow from hover transforms
- [ ] AC-HT-04: With prefers-reduced-motion, no scale/translate on hover or tap
- [ ] AC-HT-05: Existing CSS hover effects (background color) continue to work

### Glassmorphic Overlays
- [ ] AC-GL-01: Command Palette renders with backdrop-filter blur and semi-transparent background
- [ ] AC-GL-02: Content behind Command Palette is visibly blurred
- [ ] AC-GL-03: Shortcut Help Overlay renders with same glassmorphic treatment
- [ ] AC-GL-04: Glass effect visible in both dark and light themes
- [ ] AC-GL-05: Command Palette entry: backdrop fades 150ms, panel scales 0.95->1.0 with opacity
- [ ] AC-GL-06: Command Palette exit: reverse animation (scale down + fade)
- [ ] AC-GL-07: Results list items stagger after panel animation
- [ ] AC-GL-08: With prefers-reduced-motion, palette appears/disappears instantly

### StatusGlow Component
- [ ] AC-SG-01: Component accepts status, pulse, intensity, className, children props
- [ ] AC-SG-02: Each status maps to correct glow color
- [ ] AC-SG-03: Glow applied via box-shadow (no layout impact)
- [ ] AC-SG-04: Pulse animates with 2s infinite cycle when enabled
- [ ] AC-SG-05: Intensity controls spread (subtle/normal/strong)
- [ ] AC-SG-06: With prefers-reduced-motion + pulse, static glow at max intensity

### Running Status Pulse
- [ ] AC-RP-01: Running items display glow pulse instead of spinning Loader2
- [ ] AC-RP-02: Glow pulse cycles over 2 seconds (subtle to prominent)
- [ ] AC-RP-03: Pulse animation is infinite
- [ ] AC-RP-04: StatusBadge running icon replaced with filled circle + glow
- [ ] AC-RP-05: With prefers-reduced-motion, static glow at prominent intensity

### Card Uplift
- [ ] AC-CU-01: Every RunCard has status-colored left accent bar (3px)
- [ ] AC-CU-02: Accent bar gains glow on hover
- [ ] AC-CU-03: Accent bar glow at max intensity when selected
- [ ] AC-CU-04: Accent bar replaces previous border-l-primary selected state
- [ ] AC-CU-05: ProjectCard gains glassmorphic hover (backdrop-blur, semi-transparent bg, brighter border)
- [ ] AC-CU-06: Glass hover combined with whileHover scale/translate
- [ ] AC-CU-07: Glass hover visible in both dark and light themes

### framer-motion Dependency
- [ ] AC-FM-01: framer-motion in package.json dependencies
- [ ] AC-FM-02: All imports use named imports only
- [ ] AC-FM-03: No unused framer-motion modules in production build
- [ ] AC-FM-04: Measured gzipped size documented in field notes

## Definition of Done

- [ ] All 11 tasks completed (T1-T9, TD1-TD2)
- [ ] All acceptance criteria verified
- [ ] Code reviewed
- [ ] Docs updated (modules.md, patterns.md)
- [ ] 60 FPS sustained during all animations (Chrome DevTools Performance panel)
- [ ] Reduced-motion tested: toggle OS setting, verify all animations disabled
- [ ] Both dark and light themes verified
- [ ] framer-motion gzipped size measured and documented
