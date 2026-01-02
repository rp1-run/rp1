---
hide:
  - navigation
  - toc
---

# stop prompting; **start shipping**

Professional development workflows for AI coding assistants.
Skip the iteration loops — single-pass workflows that get it right the first time.
21 commands. 18 specialized agents. Careful context management.
Works today with **Claude Code** and **OpenCode** (experimental).


[:fontawesome-solid-terminal: Get Started](getting-started/installation.md){ .md-button .md-button--primary }
[:fontawesome-brands-github: View on GitHub](https://github.com/rp1-run/rp1){ .md-button .md-button--github }

<div class="carousel-container">
  <div class="splide" id="hero-carousel" aria-label="Product Screenshots">
    <div class="splide__track">
      <ul class="splide__list">
        <li class="splide__slide">
          <div class="carousel-caption">Feature workflow — requirements, design, tasks, build, verify</div>
          <div class="terminal-window">
            <div class="terminal-header">
              <span class="terminal-dot red"></span>
              <span class="terminal-dot yellow"></span>
              <span class="terminal-dot green"></span>
            </div>
            <img src="assets/screens/claude-code.png" alt="rp1 feature workflow showing requirements, design, and build commands">
          </div>
        </li>
        <li class="splide__slide">
          <div class="carousel-caption">PR visualization — understand changes at a glance</div>
          <div class="terminal-window">
            <div class="terminal-header">
              <span class="terminal-dot red"></span>
              <span class="terminal-dot yellow"></span>
              <span class="terminal-dot green"></span>
            </div>
            <img src="assets/screens/pr-visual.png" alt="rp1 PR visual diagram showing code change visualization">
          </div>
        </li>
        <li class="splide__slide">
          <div class="carousel-caption">Artifacts-driven development — structured documentation for every feature</div>
          <div class="terminal-window">
            <div class="terminal-header">
              <span class="terminal-dot red"></span>
              <span class="terminal-dot yellow"></span>
              <span class="terminal-dot green"></span>
            </div>
            <img src="assets/screens/artifacts driven development.png" alt="rp1 artifacts structure showing design decisions and feature documentation">
          </div>
        </li>
      </ul>
    </div>
  </div>
</div>

---

## Try it out

<div class="grid" markdown>

<div markdown>

**Ship a feature**

```bash
/build "user-auth"
```

Or for small well-scoped quick tasks (that don't need extensive planning):

```bash
/build-fast "Add dark mode toggle"
```

**Review a PR**

```bash
/pr-review "feature/auth"
```

**Investigate a bug**

```bash
/code-investigate "bug-123" "Login fails"
```

</div>

<div markdown>

**Generate knowledge base**

```bash
/knowledge-build
```

**Quick code check**

```bash
/code-check
```

**Strategic analysis**

```bash
/strategize
```

[See all 21 commands :material-arrow-right:](reference/index.md)

</div>

</div>

---

## Why rp1?

<div class="grid why" markdown>

<div markdown>

:fontawesome-solid-bolt: **Ship features without iteration loops**

Constitutional prompts encode expert patterns with built-in rules. No "let me revise that" — tasks complete in one shot.

[Learn about constitutional prompting :material-arrow-right:](concepts/constitutional-prompting.md)

</div>

<div markdown>

:fontawesome-solid-brain: **Get context-aware suggestions instantly**

Run `knowledge-build` once. Your architecture becomes context for every command. No generic advice — everything respects your patterns.

[Learn about knowledge-aware agents :material-arrow-right:](concepts/knowledge-aware-agents.md)

</div>

<div markdown>

:fontawesome-solid-layer-group: **Keep your AI focused, not overwhelmed**

Progressive disclosure and subagent delegation offload complex work to specialized agents while keeping your main thread focused. This allows your workflows to run uninterrupted for hours if needed on complex tasks.

[Explore the command-agent pattern :material-arrow-right:](concepts/command-agent-pattern.md)

</div>

<div markdown>

:fontawesome-solid-flask: **Catch bad assumptions before coding**

Automatic hypothesis testing catches bad assumptions early. Design decisions get validated against your codebase before implementation begins.

[See hypothesis validation :material-arrow-right:](reference/dev/validate-hypothesis.md)

</div>

<div markdown>

:fontawesome-solid-door-open: **Jump in with any level of planning**

Full blueprints with charters and PRDs, or jump straight in with a vague idea. Structured when you need it, flexible when you don't.

[Try the blueprint wizard :material-arrow-right:](reference/dev/blueprint.md)

</div>

<div markdown>

:fontawesome-solid-file-lines: **Artifact-driven development**

Understand what is being created, how it's being created, and why. Full transparency into the agent's thinking as work progresses. Artifacts also enable full resumability — workflows aren't tied to the agent's context window to remember state.

[See the feature workflow :material-arrow-right:](guides/feature-development.md)

</div>

<div markdown>

:fontawesome-solid-code-branch: **Parallelize work with git worktrees**

Run multiple features simultaneously in isolated worktrees. No branch switching, no stashing — each task gets its own clean working directory.

[Learn about parallel worktrees :material-arrow-right:](concepts/parallel-worktrees.md)

</div>

</div>

---

## rp1 Principles

<div class="grid principles" markdown>

<div markdown>

:fontawesome-solid-battery-full: **Batteries Included**

Skills, subagents, specialized agent tools, and finely-tuned prompts ship out of the box. No assembly required.

</div>

<div markdown>

:fontawesome-brands-osi: **Always Open Source**

Fully pluggable into existing agentic tools. Your workflows, your control.

</div>

<div markdown>

:fontawesome-solid-eye: **Visual-First**

Heavily leans on visual language — diagrams, charts, and structured outputs for clarity.

</div>

<div markdown>

:fontawesome-solid-rotate: **Continuous Evolution**

Keep improving and adapting as frontier models mature. Today's best, tomorrow's baseline.

</div>

<div markdown>

:fontawesome-solid-shuffle: **Model/Tool Agnostic**

No lock-in to any frontier lab or platform. Works with Claude Code, OpenCode (experimental), and more tools coming.

</div>

</div>

---

## Guides

<div class="grid" markdown>

<div markdown>

**Feature Development**

End-to-end workflow from requirements to verified implementation.

[Read guide :material-arrow-right:](guides/feature-development.md)

</div>

<div markdown>

**Bug Investigation**

Systematic root cause analysis with evidence-based hypothesis testing.

[Read guide :material-arrow-right:](guides/bug-investigation.md)

</div>

<div markdown>

**PR Review**

Thorough multi-pass analysis that catches what single-reviewer approaches miss. Visual diagrams show exactly what changed.

[Read guide :material-arrow-right:](guides/pr-review.md)

</div>

<div markdown>

**Team Onboarding**

Get new developers productive on your codebase fast. Knowledge base + guided exploration beats reading docs alone.

[Read guide :material-arrow-right:](guides/team-onboarding.md)

</div>

</div>

---

## Platform support

<div class="grid" markdown>

<div class="platform-card" markdown>

<img src="assets/brands/claude.png" width="32">

**Claude Code**

[Setup guide :material-arrow-right:](getting-started/installation.md)

</div>

<div class="platform-card" markdown>

<img src="assets/brands/opencode.png" width="32">

**OpenCode** (experimental)

[Setup guide :material-arrow-right:](getting-started/installation.md)

</div>

</div>

**Coming soon:** Cursor, Goose, Amp

---

<div align="center" markdown>

[Get Started](getting-started/installation.md){ .md-button .md-button--primary }

</div>

<script>
// Initialize carousel - works with MkDocs Material instant navigation
(function() {
  var splideInstance = null;

  function initCarousel() {
    var carousel = document.getElementById('hero-carousel');
    if (!carousel) return;

    // Destroy existing instance if present (prevents memory leaks on SPA navigation)
    if (splideInstance) {
      splideInstance.destroy();
      splideInstance = null;
    }

    // Check if Splide is available
    if (typeof Splide === 'undefined') return;

    splideInstance = new Splide('#hero-carousel', {
      type: 'fade',
      rewind: true,
      autoplay: true,
      interval: 8000,
      pauseOnHover: true,
      pauseOnFocus: true,
      pagination: true,
      arrows: false,
      drag: true,
      speed: 600,
      easing: 'ease-in-out',
      keyboard: 'focused',
      reducedMotion: {
        autoplay: false,
        speed: 0
      }
    });

    splideInstance.mount();

    // Focus carousel on hover to enable keyboard navigation
    carousel.addEventListener('mouseenter', function() {
      var track = carousel.querySelector('.splide__track');
      if (track) {
        track.setAttribute('tabindex', '0');
        track.focus();
      }
    });
  }

  // Initialize on first load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCarousel);
  } else {
    initCarousel();
  }

  // Re-initialize on MkDocs Material instant navigation (SPA-style page changes)
  if (typeof document$ !== 'undefined') {
    document$.subscribe(function() {
      initCarousel();
    });
  }
})();
</script>
