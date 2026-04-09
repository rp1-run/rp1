---
hide:
  - navigation
  - toc
---

# stop prompting; **start shipping**

Professional development workflows for AI coding assistants.
Skip the iteration loops. Keep work attached to projects, artifacts, and feedback instead of ephemeral sessions.
40 workflow skills. 51 specialized agents. Use the same workflows in **Claude Code**, **OpenCode**, and **Codex**, then review them in **Arcade**.


[:fontawesome-solid-terminal: Get Started](getting-started/installation.md){ .md-button .md-button--primary }
[:fontawesome-brands-github: View on GitHub](https://github.com/rp1-run/rp1){ .md-button .md-button--github }
[:fontawesome-brands-discord: Discord](https://discord.gg/cjmqWGb5q){ .md-button .md-button--discord }

<div class="carousel-container">
  <div class="splide" id="hero-carousel" aria-label="Product Screenshots">
    <div class="splide__track">
      <ul class="splide__list">
        <li class="splide__slide">
          <div class="carousel-caption">Project overview</div>
          <img src="assets/screens/home/arcade-projects.png" alt="Arcade project overview showing project cards and recent workflow state">
        </li>
        <li class="splide__slide">
          <div class="carousel-caption">Workflow detail</div>
          <img src="assets/screens/home/arcade-design-step.png" alt="Arcade run detail view showing a workflow design step and related artifacts">
        </li>
        <li class="splide__slide">
          <div class="carousel-caption">Artifact feedback</div>
          <img src="assets/screens/home/arcade-annotations.png" alt="Arcade annotations view showing comments attached to an artifact">
        </li>
        <li class="splide__slide">
          <div class="carousel-caption">Claude Code workflow</div>
          <img src="assets/screens/home/claude-code.png" alt="Claude Code running an rp1 feature workflow with structured commands">
        </li>
      </ul>
    </div>
  </div>
</div>

---

## Start with an outcome

Pick the workflow that matches the outcome you want. RP1 keeps the artifact trail and review loop intact across Claude Code, OpenCode, and Codex.

<div class="try-grid">
  <div class="try-card">
    <p class="try-card-title">Ship a feature</p>
    <p>Turn a feature idea into requirements, design, implementation, and verification with durable artifacts at every step.</p>
    <pre><code class="language-bash">/build "user-auth"</code></pre>
  </div>
  <div class="try-card">
    <p class="try-card-title">Make a quick change</p>
    <p>Push through a bounded change fast without giving up structure, reviewability, or resumability.</p>
    <pre><code class="language-bash">/build-fast "Add dark mode toggle"</code></pre>
  </div>
  <div class="try-card">
    <p class="try-card-title">Power through small changes</p>
    <p>Work through a queue of small requests with speed, but still grounded in the codebase, its patterns, and the knowledge base.</p>
    <pre><code class="language-bash">/speedrun "Tighten the empty state copy"</code></pre>
  </div>
  <div class="try-card">
    <p class="try-card-title">Review a PR</p>
    <p>Get structured findings, sharper confidence, and visual summaries instead of a shallow skim.</p>
    <pre><code class="language-bash">/pr-review "feature/auth"</code></pre>
  </div>
  <div class="try-card">
    <p class="try-card-title">Investigate a bug</p>
    <p>Move from a vague failure to an evidence-backed root cause instead of bouncing through ad hoc prompts.</p>
    <pre><code class="language-bash">/code-investigate "bug-123" "Login fails"</code></pre>
  </div>
  <div class="try-card">
    <p class="try-card-title">Build project context</p>
    <p>Generate a project-aware knowledge base so every workflow starts from your actual system, not generic assumptions.</p>
    <pre><code class="language-bash">/knowledge-build</code></pre>
  </div>
  <div class="try-card">
    <p class="try-card-title">Deep research</p>
    <p>Investigate a system, compare multiple projects, or pull together a technical brief with grounded findings.</p>
    <pre><code class="language-bash">/deep-research "Compare backend and frontend error handling"</code></pre>
  </div>
</div>

<div class="try-hosts">
  <p class="try-hosts-title">Same workflow, different harness</p>
  <div class="try-hosts-grid">
    <div>
      <strong>Claude Code</strong><br>
      <code>/build "user-auth"</code>
    </div>
    <div>
      <strong>OpenCode</strong><br>
      <code>/rp1-dev-build "user-auth"</code>
    </div>
    <div>
      <strong>Codex</strong><br>
      <code>$rp1-dev-build "user-auth"</code>
    </div>
  </div>
  <p class="try-hosts-links">
    <a href="reference/index.md">See the workflow reference</a>
    <span>·</span>
    <a href="arcade/index.md">Explore Arcade</a>
  </p>
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

:fontawesome-solid-brain: **Project-aware from the first command**

Run `knowledge-build` once. Your architecture becomes context for every command. No generic advice — everything respects your patterns.

[Learn about knowledge-aware agents :material-arrow-right:](concepts/knowledge-aware-agents.md)

</div>

<div markdown>

:fontawesome-solid-comment-dots: **Give feedback in context**

Open artifacts in Arcade and annotate the exact file or section you want changed. Agents can pick that feedback up without forcing you into copy-paste loops.

[Use Arcade annotations :material-arrow-right:](arcade/annotations.md)

</div>

<div markdown>

:fontawesome-solid-flask: **Catch bad assumptions before coding**

Automatic hypothesis testing catches bad assumptions early. Design decisions get validated against your codebase before implementation begins.

[See hypothesis validation :material-arrow-right:](reference/dev/validate-hypothesis.md)

</div>

<div markdown>

:fontawesome-solid-shuffle: **Switch harnesses without switching costs**

rp1 keeps the workflow layer stable across Claude Code, OpenCode, and Codex. The syntax adapts to each host, but the workflow, artifacts, and review loop stay the same.

[See the same workflows on every host :material-arrow-right:](reference/dev/index.md)

</div>

<div markdown>

:fontawesome-solid-file-lines: **Durable artifacts, not disposable chats**

Requirements, design, tasks, verification, and reports stay attached to the project and remain resumable across sessions, reviews, and handoffs.

[See the feature workflow :material-arrow-right:](guides/feature-development.md)

</div>

</div>

---

## rp1 Principles

<div class="grid principles" markdown>

<div markdown>

:fontawesome-solid-battery-full: **Batteries Included**

Workflows, subagents, KB generation, and structured artifacts ship together. No prompt assembly required.

</div>

<div markdown>

:fontawesome-brands-osi: **Always Open Source**

Fully pluggable into existing agentic tools. Your workflows, your control.

</div>

<div markdown>

:fontawesome-solid-eye: **Observable by Default**

Runs, gates, artifacts, and annotations stay visible in Arcade instead of disappearing into chat scrollback.

</div>

<div markdown>

:fontawesome-solid-rotate: **Stable Workflows, Evolving Harnesses**

Keep the workflow layer stable while frontier models and host tools keep changing.

</div>

<div markdown>

:fontawesome-solid-shuffle: **Same Workflows, Different Hosts**

Use rp1 from Claude Code, OpenCode, or Codex without rewriting how your team works.

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

<span class="platform-logo platform-logo--claude" aria-hidden="true"></span>

**Claude**

[Setup guide :material-arrow-right:](getting-started/installation.md)

</div>

<div class="platform-card" markdown>

<span class="platform-logo platform-logo--opencode" aria-hidden="true"></span>

**opencode**

[Setup guide :material-arrow-right:](getting-started/installation.md)

</div>

<div class="platform-card" markdown>

<span class="platform-logo platform-logo--codex" aria-hidden="true"></span>

**Codex**

[Setup guide :material-arrow-right:](getting-started/installation.md)

</div>

</div>

---

<div align="center" markdown>

[Get Started](getting-started/index.md){ .md-button .md-button--primary }
[Why rp1?](comparison/vs-raw-prompting.md){ .md-button }

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
