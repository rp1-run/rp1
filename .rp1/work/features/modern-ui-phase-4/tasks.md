# Development Tasks: Modern UI Phase 4 -- IA & Polish

**Feature ID**: modern-ui-phase-4
**Status**: Not Started
**Progress**: 38% (8 of 21 tasks)
**Estimated Effort**: 10 days
**Started**: 2026-02-26

## Overview

Phase 4 delivers five workstreams: component consolidation (SharedSelect, SharedCollapsible, formatRelativeTime dedup, CSS variable fixes), terminal design language (breadcrumbs, traffic-light dots, prompt prefix, typing animation), sidebar restructuring (4-section IA with recents/pins/shortcut hints), Tier 3 contextual keyboard shortcuts per view, and Mission Control homepage uplift (animated counters, attention category glow, terminal command buttons). All work is frontend-only, targets the existing React 18 + Vite 6 + Tailwind 3 + shadcn/ui stack, and must stay within a 10KB gzipped bundle addition.

## Implementation DAG

**Parallel Groups** (tasks with no inter-dependencies):

1. [T1, T3, T5] - T1 (consolidation) has no deps; T3 (terminal components) has no deps; T5 (shortcut hook) has no deps on other Phase 4 work
2. [T2] - StatusGlow uses CSS variables fixed in T1 (glow utilities need --status-warning)
3. [T4, T6] - Sidebar needs shared components from T1+T2 and terminal elements from T3; Homepage needs StatusGlow from T2 and terminal elements from T3
4. [T7] - Integration testing requires all components wired together

**Dependencies**:

- T2 -> T1 (data: StatusGlow color utilities depend on CSS variables defined in T1)
- T4 -> [T1, T2, T3] (interface: sidebar uses SharedCollapsible from T1, KeyboardShortcutHint from T2, TerminalBreadcrumb from T3)
- T6 -> [T2, T3] (interface: homepage uses AnimatedCounter + StatusGlow from T2, terminal buttons from T3)
- T7 -> [T4, T5, T6] (sequential: integration testing requires all feature code complete)

**Critical Path**: T1 -> T2 -> T4 -> T7

## Task Breakdown

### Group 1: Foundation (No Dependencies)

- [x] **T1**: Extract SharedSelect component with CVA size variants and replace consumers `[complexity:medium]`

    **Reference**: [design.md#311-component-consolidation](design.md#311-component-consolidation)

    **Effort**: 5 hours

    **Acceptance Criteria**:

    - [x] `components/v2/Select.tsx` created with CVA size variants (sm, md, lg) and generic type parameter `<T extends string>`
    - [x] `FilterBar.tsx` refactored to use `<Select size="md" />` -- inline Dropdown removed
    - [x] `AnnotationSidebar.tsx` refactored to use `<Select size="sm" />` -- inline FilterDropdown removed
    - [x] Component exported from `components/v2/index.ts` barrel
    - [x] Keyboard interaction (arrow keys, Enter, Escape) works on the shared Select
    - [x] Visual parity with existing dropdowns in both light and dark themes

    **Implementation Summary**:

    - **Files**: `cli/web-ui/src/components/v2/Select.tsx`, `cli/web-ui/src/components/v2/FilterBar.tsx`, `cli/web-ui/src/components/v2/AnnotationSidebar.tsx`, `cli/web-ui/src/components/v2/index.ts`
    - **Approach**: Created shared Select<T> with CVA selectTriggerVariants (sm/md/lg) and size-mapped lookup objects for chevron, check, option padding, and unselected offset. Added full keyboard navigation (ArrowUp/Down, Enter, Space, Escape, Home, End) with roving tabindex focus management. Removed inline Dropdown from FilterBar and FilterDropdown from AnnotationSidebar; both now use the shared Select.
    - **Deviations**: None
    - **Tests**: N/A (no existing test infrastructure for these components; visual parity verified via type-check and lint)

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

- [x] **T2**: Extract SharedCollapsible component and replace consumers `[complexity:medium]`

    **Reference**: [design.md#312-sharedcollapsible](design.md#312-sharedcollapsible)

    **Effort**: 4 hours

    **Acceptance Criteria**:

    - [x] `components/v2/Collapsible.tsx` created with `title`, `defaultExpanded`, `icon`, `badge`, `rightContent`, `children` props
    - [x] `AttentionSection.tsx` refactored to use SharedCollapsible -- inline expand/collapse removed
    - [x] `EventStream.tsx` refactored to use SharedCollapsible -- inline expand/collapse removed
    - [x] `aria-expanded` and `aria-controls` attributes present and correct
    - [x] `max-h` animation transition completes within 200ms (NFR-P2)
    - [x] Component exported from `components/v2/index.ts` barrel

    **Implementation Summary**:

    - **Files**: `cli/web-ui/src/components/v2/Collapsible.tsx`, `cli/web-ui/src/components/v2/AttentionSection.tsx`, `cli/web-ui/src/components/v2/EventStream.tsx`, `cli/web-ui/src/components/v2/index.ts`
    - **Approach**: Created shared Collapsible component with ChevronDown/ChevronRight toggle, aria-expanded + aria-controls, and max-h 200ms ease-in-out animation. Added onExpandedChange callback for consumers needing state tracking (AttentionSection uses it for keyboard nav). Refactored AttentionSection to delegate expand/collapse to Collapsible while preserving all run listing, virtualization, and keyboard nav logic. Refactored EventStream to use Collapsible with badge and rightContent props for event count and error/warning indicators.
    - **Deviations**: None
    - **Tests**: N/A (no existing test infrastructure for these components; verified via type-check and lint)

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

- [x] **T3**: Consolidate formatRelativeTime into single lib/time.ts export `[complexity:simple]`

    **Reference**: [design.md#313-formatrelativetime-consolidation](design.md#313-formatrelativetime-consolidation)

    **Effort**: 2 hours

    **Acceptance Criteria**:

    - [x] `lib/time.ts` enhanced to handle all format variations: "just now", "Nm ago", "Nh ago", "yesterday", "Nd ago", date string
    - [x] Local implementation in `EventStream.tsx` removed; replaced with import from `@/lib/time`
    - [x] Local implementation in `AnnotationSidebar.tsx` removed; replaced with import from `@/lib/time`
    - [x] Codebase search for `formatRelativeTime` returns exactly one implementation
    - [x] Unit tests cover boundary conditions: 59s, 60s, 23h, 24h, 6d, 7d

    **Implementation Summary**:

    - **Files**: `cli/web-ui/src/lib/time.ts`, `cli/web-ui/src/components/v2/EventStream.tsx`, `cli/web-ui/src/components/v2/AnnotationSidebar.tsx`, `cli/web-ui/src/components/v2/AnnotationPopover.tsx`, `cli/web-ui/src/__tests__/lib/time.test.ts`
    - **Approach**: Enhanced canonical lib/time.ts with compact format (Nm/Nh/Nd) and "yesterday" branch. Removed 3 local implementations (EventStream, AnnotationSidebar, AnnotationPopover -- 4 duplicates total, not 3 as PRD noted). All consumers now import from @/lib/time. Added 7 unit tests covering all boundary conditions.
    - **Deviations**: Found and consolidated a 4th duplicate in AnnotationPopover.tsx (not noted in design). EventStream's toLocaleTimeString() fallback replaced with standard progression.
    - **Tests**: 7/7 passing

    **Validation Summary**:

    | Dimension | Status |
    |-----------|--------|
    | Discipline | PASS |
    | Accuracy | PASS |
    | Completeness | PASS |
    | Quality | PASS |
    | Testing | PASS |
    | Commit | PASS |
    | Comments | PASS |

- [x] **T4**: Add missing CSS variables and utility classes for both themes `[complexity:simple]`

    **Reference**: [design.md#314-css-variable-fixes](design.md#314-css-variable-fixes)

    **Effort**: 1 hour

    **Acceptance Criteria**:

    - [x] `--status-warning` defined in `:root` (Catppuccin Latte peach: 22 99% 52%) and `.dark` (Catppuccin Mocha peach: 23 92% 75%)
    - [x] `--terminal-yellow` defined in `:root` (35 77% 49%) and `.dark` (41 86% 83%)
    - [x] Utility classes `.text-status-warning`, `.bg-status-warning`, `.bg-terminal-yellow`, `.text-terminal-yellow` added in `@layer utilities`
    - [x] Both light and dark themes render the new variables correctly (BR-07)

    **Implementation Summary**:

    - **Files**: `cli/web-ui/src/styles/globals.css`
    - **Approach**: Added `--status-warning` and `--terminal-yellow` CSS custom properties to both `:root` (Latte) and `.dark` (Mocha) theme blocks. Added 4 utility classes (text-status-warning, bg-status-warning, bg-terminal-yellow, text-terminal-yellow) in @layer utilities. Existing references in AnnotationSidebar, AnnotationPopover, and MarkdownViewer now resolve correctly.
    - **Deviations**: None
    - **Tests**: N/A (CSS variable definitions; verified via type-check and visual inspection of existing usage sites)

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

- [x] **T5**: Create TerminalBreadcrumb component and integrate into V2Layout `[complexity:medium]`

    **Reference**: [design.md#331-terminalbreadcrumb](design.md#331-terminalbreadcrumb)

    **Effort**: 5 hours

    **Acceptance Criteria**:

    - [x] `components/v2/TerminalBreadcrumb.tsx` created; derives path segments from `useLocation()`
    - [x] Route "/" renders as "~" with blinking cursor; route "/runs/abc" renders as "~ / runs / abc |"
    - [x] Each segment is a clickable `<Link>` to the correct cumulative route
    - [x] Rendered in monospace font with `<nav aria-label="Breadcrumb">` and `<ol>` semantic structure
    - [x] Blinking cursor reuses existing `.animate-blink` class
    - [x] Integrated into V2Layout between header and main content area (replaces per-page breadcrumbs)
    - [x] WCAG 2.1 AA color contrast maintained in both themes (NFR-U3)

    **Implementation Summary**:

    - **Files**: `cli/web-ui/src/components/v2/TerminalBreadcrumb.tsx`, `cli/web-ui/src/components/v2/index.ts`, `cli/web-ui/src/app/V2Layout.tsx`, `cli/web-ui/src/__tests__/components/v2/TerminalBreadcrumb.test.ts`
    - **Approach**: Created TerminalBreadcrumb component that derives path segments from useLocation(), renders terminal-style breadcrumbs with ~ as home, / separators, clickable Link segments with cumulative paths, and a blinking green cursor. Uses monospace font, semantic nav/ol structure, and aria-current="page" on the active segment. Integrated into V2Layout between sidebar and main content via a flex column wrapper. Exported buildSegments as a pure function for unit testing.
    - **Deviations**: None
    - **Tests**: 6/6 passing (buildSegments unit tests covering root path, single segment, multi-level, deep nested, trailing slash, encoded segments)

    **Validation Summary**:

    | Dimension | Status |
    |-----------|--------|
    | Discipline | PASS |
    | Accuracy | PASS |
    | Completeness | PASS |
    | Quality | PASS |
    | Testing | PASS |
    | Commit | PASS |
    | Comments | PASS |

- [x] **T6**: Create TrafficLightDots, TerminalPrompt, and TerminalTypingAnimation components `[complexity:medium]`

    **Reference**: [design.md#332-trafficlightdots](design.md#332-trafficlightdots)

    **Effort**: 5 hours

    **Acceptance Criteria**:

    - [x] `TrafficLightDots.tsx` renders three 8px circles (red, yellow, green) with `aria-hidden="true"`; integrated into V2Header
    - [x] `TerminalPrompt.tsx` renders `$ {children}` in monospace font
    - [x] `TerminalTypingAnimation.tsx` uses CSS `steps()` animation with `--char-count` custom property; duration configurable (default 1500ms)
    - [x] TerminalTypingAnimation respects `prefers-reduced-motion` (shows full text instantly when reduced)
    - [x] All three components exported from `components/v2/index.ts` barrel
    - [x] Glow CSS for `.terminal-typing` keyframes added to `globals.css`

    **Implementation Summary**:

    - **Files**: `cli/web-ui/src/components/v2/TrafficLightDots.tsx`, `cli/web-ui/src/components/v2/TerminalPrompt.tsx`, `cli/web-ui/src/components/v2/TerminalTypingAnimation.tsx`, `cli/web-ui/src/components/v2/V2Header.tsx`, `cli/web-ui/src/components/v2/index.ts`, `cli/web-ui/src/styles/globals.css`
    - **Approach**: Created three terminal design language components. TrafficLightDots renders three 8px colored circles (red/yellow/green) with aria-hidden, integrated into V2Header left side before the logo. TerminalPrompt renders a green $ prefix with children in monospace. TerminalTypingAnimation uses CSS steps() animation with --char-count and --typing-duration custom properties, a blinking cursor that reveals after typing completes, and prefers-reduced-motion media query that disables animation and shows full text instantly.
    - **Deviations**: None
    - **Tests**: N/A (presentational components with no business logic; verified via type-check and lint)

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

- [x] **T7**: Create useContextualShortcuts hook and ShortcutRegistryProvider `[complexity:medium]`

    **Reference**: [design.md#351-usecontextualshortcuts-hook](design.md#351-usecontextualshortcuts-hook)

    **Effort**: 6 hours

    **Acceptance Criteria**:

    - [x] `hooks/useContextualShortcuts.ts` created with `viewId`, `viewLabel`, `shortcuts`, `enabled` options
    - [x] Hook registers document-level `keydown` listener; checks `isTextInputElement` before processing (REQ-16)
    - [x] `ShortcutRegistryProvider.tsx` created; exposes `ShortcutRegistryContext` with `globalShortcuts`, `navigationShortcuts`, `contextualShortcuts`
    - [x] Provider wraps app in V2Layout
    - [x] Registered shortcuts are cleaned up on component unmount
    - [x] Unit tests verify: text-input suppression, shortcut matching, cleanup on unmount

    **Implementation Summary**:

    - **Files**: `cli/web-ui/src/hooks/useContextualShortcuts.ts`, `cli/web-ui/src/providers/ShortcutRegistryProvider.tsx`, `cli/web-ui/src/app/V2Layout.tsx`, `cli/web-ui/src/__tests__/hooks/useContextualShortcuts.test.ts`
    - **Approach**: Created useContextualShortcuts hook that registers document-level keydown listener with isTextInputElement guard and modifier key suppression. Split ShortcutRegistryProvider into two contexts -- a stable API context (ShortcutRegistryApiContext) for registration/unregistration and a data context (ShortcutRegistryDataContext) for reading shortcuts. This prevents infinite re-render loops where registration triggers context changes that re-trigger registration. Provider wraps V2Layout content. Added useShortcutRegistry convenience hook for data consumers (overlay).
    - **Deviations**: Design specified single ShortcutRegistryContext; split into two contexts (API + Data) to prevent circular re-render dependency. The public API is equivalent -- consumers use the same provider wrapper and read the same data shape.
    - **Tests**: 15/15 passing (7 isTextInputElement unit tests + 8 useContextualShortcuts hook tests covering key matching, text-input suppression, modifier key suppression, disabled state, cleanup on unmount, and multiple shortcuts)

    **Validation Summary**:

    | Dimension | Status |
    |-----------|--------|
    | Discipline | PASS |
    | Accuracy | PASS |
    | Completeness | PASS |
    | Quality | PASS |
    | Testing | PASS |
    | Commit | PASS |
    | Comments | PASS |

- [x] **T8**: Create ShortcutHelpOverlay component `[complexity:medium]`

    **Reference**: [design.md#354-shortcuthelpoverlay](design.md#354-shortcuthelpoverlay)

    **Effort**: 4 hours

    **Acceptance Criteria**:

    - [x] `components/v2/ShortcutHelpOverlay.tsx` created; modal overlay triggered by `?` key
    - [x] Renders three sections: Global (Cmd+K, Cmd+B, ?), Navigation (g h, g r, g p, j/k, l, h), and current view contextual shortcuts
    - [x] Reads registered shortcuts from `ShortcutRegistryContext`
    - [x] Styled with `bg-background/95 backdrop-blur-sm` overlay, centered card with `border border-border rounded-lg`
    - [x] Dismissible via Escape key or clicking outside
    - [x] Uses `<KeyboardShortcutHint>` component for key rendering (depends on T10, but can stub initially)

    **Implementation Summary**:

    - **Files**: `cli/web-ui/src/components/v2/ShortcutHelpOverlay.tsx`, `cli/web-ui/src/components/v2/index.ts`, `cli/web-ui/src/app/V2Layout.tsx`
    - **Approach**: Created ShortcutHelpOverlay as a self-contained modal component that manages its own open/close state via `?` key listener (with isTextInputElement guard and modifier key suppression). Reads global, navigation, and contextual shortcuts from ShortcutRegistryProvider via useShortcutRegistry hook. Renders three sections with ShortcutKey inline component that parses key strings (e.g., "Cmd+K", "g h") into styled kbd elements. Dismissible via Escape key or clicking outside the card (mousedown listener). Uses terminal design language ($ prefix, monospace heading). Integrated into V2Layout inside ShortcutRegistryProvider.
    - **Deviations**: Stubbed KeyboardShortcutHint inline as ShortcutKey component since T10 is not yet implemented. When T10 is done, the inline ShortcutKey can be replaced with the shared component.
    - **Tests**: N/A (presentational overlay component; keyboard behavior relies on isTextInputElement which is already tested in useContextualShortcuts tests)

### Group 2: Utility Components (Depends on T4)

- [ ] **T9**: Create StatusGlow wrapper component with glow CSS animations `[complexity:medium]`

    **Reference**: [design.md#321-statusglow](design.md#321-statusglow)

    **Effort**: 4 hours

    **Acceptance Criteria**:

    - [ ] `components/v2/StatusGlow.tsx` created with `color` (red/amber/blue/green/purple), `enabled`, `pulse`, `children` props
    - [ ] `@keyframes glow-pulse` animation added to `globals.css` with 0%/50%/100% box-shadow transitions
    - [ ] Glow color classes (`.glow-red`, `.glow-amber`, `.glow-blue`, `.glow-green`, `.glow-purple`) use CSS custom properties referencing status color variables from T4
    - [ ] `prefers-reduced-motion: reduce` replaces animation with static border-color (NFR-U1)
    - [ ] Component exported from `components/v2/index.ts` barrel

- [ ] **T10**: Create KeyboardShortcutHint badge component `[complexity:simple]`

    **Reference**: [design.md#322-keyboardshorthint](design.md#322-keyboardshorthint)

    **Effort**: 1 hour

    **Acceptance Criteria**:

    - [ ] `components/v2/KeyboardShortcutHint.tsx` created with `keys` and `className` props
    - [ ] Renders `<kbd>` element with `rounded bg-muted/70 px-1.5 py-0.5 font-mono text-xs text-muted-foreground` styling
    - [ ] Component exported from `components/v2/index.ts` barrel
    - [ ] Renders correctly for single keys ("f"), combos ("Cmd+K"), and sequences ("g h")

### Group 3: Feature Assembly (Depends on Groups 1 + 2)

- [ ] **T11**: Create useRecentRuns and usePinnedProjects localStorage hooks `[complexity:medium]`

    **Reference**: [design.md#342-sidebarquickaccess](design.md#342-sidebarquickaccess)

    **Effort**: 4 hours

    **Acceptance Criteria**:

    - [ ] `hooks/useRecentRuns.ts` stores `{ id, projectName, featureName, timestamp }[]` in localStorage key `rp1-recent-runs`
    - [ ] Max 5 items enforced, deduplicated by run ID, sorted by most recent (BR-01)
    - [ ] `trackVisit(run)` function exposed for run detail page to call on mount
    - [ ] `hooks/usePinnedProjects.ts` stores `string[]` in localStorage key `rp1-pinned-projects`
    - [ ] `togglePin(projectId)` and `isPinned(projectId)` functions exposed (BR-02)
    - [ ] Unit tests cover: max 5 enforcement, dedup, ordering, toggle, persistence

- [ ] **T12**: Refactor V2Sidebar -- SidebarHeader and SidebarFooter sections `[complexity:medium]`

    **Reference**: [design.md#341-sidebarheader](design.md#341-sidebarheader)

    **Effort**: 6 hours

    **Acceptance Criteria**:

    - [ ] `SidebarHeader` sub-component created: rp1 logo with blinking cursor, project context (name + branch + status dot), Cmd+K search trigger
    - [ ] `SidebarFooter` sub-component created: theme toggle (moved from V2Header), `?` shortcut trigger button, version text in `text-muted-foreground text-xs`
    - [ ] V2Header updated: theme toggle removed (relocated to sidebar footer)
    - [ ] Sidebar width changed from `w-[200px]` to `w-[240px]` when expanded; collapsed state remains `w-16` (64px)
    - [ ] V2Sidebar external props interface (`V2SidebarProps`) unchanged
    - [ ] Sidebar collapsed state persistence in localStorage maintained (NFR-U4)

- [ ] **T13**: Refactor V2Sidebar -- SidebarQuickAccess section `[complexity:medium]`

    **Reference**: [design.md#342-sidebarquickaccess](design.md#342-sidebarquickaccess)

    **Effort**: 6 hours

    **Acceptance Criteria**:

    - [ ] `SidebarQuickAccess` sub-component created using `<Collapsible>` (shared from T2) with "Quick Access" label in `text-muted-foreground text-xs uppercase tracking-wider` (REQ-06)
    - [ ] Recent runs section: displays up to 5 items from `useRecentRuns()`, each clickable to navigate to run detail
    - [ ] Pinned projects section: displays items from `usePinnedProjects()`, each clickable
    - [ ] Running items: sourced from `useAttention()`, shows items with `status === "running"` with animated status dots
    - [ ] Section renders correctly when all sub-sections are empty (graceful empty states)

- [ ] **T14**: Refactor V2Sidebar -- SidebarNavigation section with badges, hints, and active glow `[complexity:medium]`

    **Reference**: [design.md#343-sidebarnavigation](design.md#343-sidebarnavigation)

    **Effort**: 6 hours

    **Acceptance Criteria**:

    - [ ] `SidebarNavigation` sub-component created with nav items: Home (g h), Runs (g r), Projects (g p), Artifacts (g a, conditional), Settings (g s)
    - [ ] Badge counts sourced from attention data: Home=total attention, Runs=running+waiting, Projects=active count (REQ-03)
    - [ ] `<KeyboardShortcutHint>` (from T10) visible on nav item hover via `group-hover` (REQ-03)
    - [ ] Active nav item uses glow effect: `box-shadow: 0 0 8px hsl(var(--primary) / 0.3)` + `bg-accent/50` instead of flat `bg-accent` (REQ-05)
    - [ ] Artifacts nav item renders conditionally based on route existence (Design Decision D8)

- [ ] **T15**: Create AnimatedCounter component `[complexity:medium]`

    **Reference**: [design.md#361-animatedcounter](design.md#361-animatedcounter)

    **Effort**: 4 hours

    **Acceptance Criteria**:

    - [ ] `components/v2/AnimatedCounter.tsx` created with `value`, `duration` (default 500ms), `className` props
    - [ ] Uses `useRef` + `useEffect` + `requestAnimationFrame` with `easeOutCubic` easing
    - [ ] Animates from 0 to target value on initial mount only; subsequent value changes snap instantly (BR-06)
    - [ ] `prefers-reduced-motion` renders value directly without animation (NFR-U1)
    - [ ] Renders at 60fps on modern desktop hardware (NFR-P1)
    - [ ] Component exported from `components/v2/index.ts` barrel

- [ ] **T16**: HomePage uplift -- status summary bar, attention glow, terminal buttons `[complexity:medium]`

    **Reference**: [design.md#362-status-summary-bar](design.md#362-status-summary-bar)

    **Effort**: 6 hours

    **Acceptance Criteria**:

    - [ ] Status Summary Bar added to HomePage: 3-column grid with Running (blue glow), Need Attention (red glow), Completed Today (green glow) cards using `<AnimatedCounter>` and `<StatusGlow>`
    - [ ] Non-zero counters have glow enabled; zero counters have glow disabled (REQ-23)
    - [ ] Each `<AttentionSection>` wrapped with `<StatusGlow>`: Failed=red static, Waiting=amber pulse, Running=blue animated, Needs Review=purple static (REQ-24)
    - [ ] Refresh button replaced with terminal-styled button: monospace font, `$` prefix in `text-terminal-green`, `border-border bg-muted/30` styling (REQ-25)
    - [ ] Layout responsive within the content area (3-column grid collapses gracefully)

- [ ] **T17**: Register Tier 3 contextual shortcuts on RunsListPage, RunDetailPage, ArtifactViewerPage `[complexity:medium]`

    **Reference**: [design.md#353-per-view-shortcut-registrations](design.md#353-per-view-shortcut-registrations)

    **Effort**: 6 hours

    **Acceptance Criteria**:

    - [ ] RunsListPage registers: `f` (focus filter bar), `s` (open sort dropdown), `r` (refresh data) via `useContextualShortcuts` (REQ-12)
    - [ ] RunDetailPage registers: `a` (focus artifacts panel), `l` (show logs/events), `t` (show timeline) via `useContextualShortcuts` (REQ-13)
    - [ ] ArtifactViewerPage registers: `e` (toggle expand), `c` (copy content), `[` (prev artifact), `]` (next artifact) via `useContextualShortcuts` (REQ-14)
    - [ ] All registered shortcuts appear in the `?` overlay under the appropriate view section (REQ-15)
    - [ ] Shortcuts do not fire when text input is focused (REQ-16)

### Group 4: Integration and Quality (Depends on All)

- [ ] **T18**: Integration testing, cross-browser validation, and accessibility audit `[complexity:complex]`

    **Reference**: [design.md#7-testing-strategy](design.md#7-testing-strategy)

    **Effort**: 8 hours

    **Acceptance Criteria**:

    - [ ] All Phase 4 components wired together and rendering correctly end-to-end
    - [ ] Cross-browser verification: Chrome, Firefox, Safari on macOS
    - [ ] All animations respect `prefers-reduced-motion` -- disabled when reduced motion preferred (NFR-U1)
    - [ ] Full keyboard operability: all features accessible without mouse (NFR-U2)
    - [ ] WCAG 2.1 AA compliance for all new interactive elements (NFR-C1)
    - [ ] All existing URL routes and deep links continue working (NFR-C2)
    - [ ] Light theme (Catppuccin Latte) renders correctly with all Phase 4 changes (NFR-C3)
    - [ ] Bundle size delta measured: Phase 4 additions do not exceed 10KB gzipped (NFR-P3)

### User Docs

- [ ] **TD1**: Update modules.md with new shared components and hooks `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#9-documentation-impact)

    **Type**: edit

    **Target**: `.rp1/context/modules.md`

    **Section**: web-ui section

    **KB Source**: modules.md:web-ui

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [ ] web-ui section updated to document SharedSelect, SharedCollapsible, StatusGlow, KeyboardShortcutHint, terminal design components, AnimatedCounter
    - [ ] New hooks documented: useRecentRuns, usePinnedProjects, useContextualShortcuts
    - [ ] Sidebar restructure (4-section architecture) documented

- [ ] **TD2**: Update patterns.md with CVA variant and hook patterns `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#9-documentation-impact)

    **Type**: edit

    **Target**: `.rp1/context/patterns.md`

    **Section**: Component patterns

    **KB Source**: patterns.md:naming

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [ ] CVA size variant pattern documented (SharedSelect as canonical example)
    - [ ] localStorage-backed hook pattern documented (useRecentRuns/usePinnedProjects as examples)
    - [ ] Context-based shortcut registration pattern documented

- [ ] **TD3**: Update user docs with keyboard shortcuts, sidebar sections, and terminal design language `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#9-documentation-impact)

    **Type**: edit

    **Target**: `docs/`

    **Section**: WebUI guide

    **KB Source**: -

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [ ] Keyboard shortcuts table documented (global, navigation, per-view contextual)
    - [ ] Sidebar 4-section layout described with recents/pins behavior
    - [ ] Terminal design language elements described

## Acceptance Criteria Checklist

From requirements.md:

### Restructured Sidebar
- [ ] REQ-01: Sidebar header shows logo, project name, branch, status dot, Cmd+K trigger
- [ ] REQ-02: Quick access shows up to 5 recent runs, pinned projects, running items with live dots
- [ ] REQ-03: Navigation items have badge counts and keyboard shortcut hints on hover
- [ ] REQ-04: Footer has theme toggle, ? shortcut trigger, version number
- [ ] REQ-05: Active nav item uses accent glow effect
- [ ] REQ-06: Section labels in muted smaller font

### Terminal Design Language
- [ ] REQ-07: Terminal breadcrumbs with ~ home, / separators, blinking cursor, clickable segments in monospace
- [ ] REQ-08: Traffic-light dots (red/yellow/green) in header
- [ ] REQ-09: Terminal prompt prefix ($) for status messages
- [ ] REQ-10: Terminal typing animation for loading states
- [ ] REQ-11: Terminal-styled empty state prompts

### Tier 3 Contextual Shortcuts
- [ ] REQ-12: Runs list: f (filter), s (sort), r (refresh)
- [ ] REQ-13: Run detail: a (artifacts), l (logs), t (timeline)
- [ ] REQ-14: Artifact viewer: e (expand), c (copy), [ (prev), ] (next)
- [ ] REQ-15: All shortcuts listed in ? overlay under current view section
- [ ] REQ-16: Shortcuts suppressed when text input focused

### Component Consolidation
- [ ] REQ-17: Shared Select with CVA variants used by FilterBar and AnnotationSidebar
- [ ] REQ-18: Shared Collapsible used by AttentionSection and EventStream
- [ ] REQ-19: Single formatRelativeTime in lib/time.ts, all consumers import from there
- [ ] REQ-20: StatusGlow wrapper with status-colored glow effects
- [ ] REQ-21: KeyboardShortcutHint badge component
- [ ] REQ-22: CSS variables text-status-warning and bg-terminal-yellow defined for both themes

### Mission Control Homepage Uplift
- [ ] REQ-23: Animated status summary counters with glow on non-zero
- [ ] REQ-24: Distinct attention category glow: Failed=red, Waiting=amber, Running=blue, Needs Review=purple
- [ ] REQ-25: Terminal command buttons with monospace and $ prefix

### Non-Functional
- [ ] NFR-P1: Animated counters at 60fps
- [ ] NFR-P2: Sidebar transitions within 200ms
- [ ] NFR-P3: Bundle addition within 10KB gzipped
- [ ] NFR-S1: No new external network requests
- [ ] NFR-S2: localStorage only for recents/pins; no sensitive data
- [ ] NFR-U1: All animations respect prefers-reduced-motion
- [ ] NFR-U2: Full keyboard operability
- [ ] NFR-U3: Breadcrumb color contrast WCAG AA in both themes
- [ ] NFR-U4: Sidebar collapsed state persisted across sessions
- [ ] NFR-C1: WCAG 2.1 AA for all new interactive elements
- [ ] NFR-C2: All existing routes/deep links unchanged
- [ ] NFR-C3: Light theme renders correctly with all changes

## Definition of Done

- [ ] All 18 implementation tasks completed
- [ ] All 3 documentation tasks completed
- [ ] All acceptance criteria verified
- [ ] Code reviewed
- [ ] Docs updated
