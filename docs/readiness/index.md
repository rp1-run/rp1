---
hide:
  - navigation
  - toc
  - title
---

<style>
/* Full-viewport layout: remove MkDocs Material chrome around the component */
.md-content__inner {
  margin: 0;
  padding: 0;
  max-width: none;
}
.md-content__inner > h1:first-child {
  display: none;
}
.md-main__inner {
  max-width: none;
  margin: 0;
  padding-top: 0;
}
.md-main {
  margin-top: 0;
}
/* Override component's 100vh — account for MkDocs header/tabs above */
#readiness-root > div {
  min-height: calc(100vh - 6rem) !important;
}

/* ── Readiness Assessment: light mode ────────────────────────── */
[data-md-color-scheme="default"] #readiness-root {
  --ra-surface: color-mix(in srgb, var(--md-default-fg-color) 5%, var(--md-default-bg-color));
  --ra-surface-alt: color-mix(in srgb, var(--md-default-fg-color) 8%, var(--md-default-bg-color));
  --ra-border: color-mix(in srgb, var(--md-default-fg-color) 14%, var(--md-default-bg-color));
  --ra-accent: #0f7b56;
  --ra-accent-dark: #0a5e42;
  --ra-section-codebase: #0969b2;
  --ra-section-workflow: #6d28d9;
  --ra-section-team: #0f7b56;
  --ra-score-green: #0f7b56;
  --ra-score-amber: #b45309;
  --ra-score-red: #b91c1c;
  --ra-cta-text: #fff;
}

/* ── Readiness Assessment: dark mode ─────────────────────────── */
[data-md-color-scheme="slate"] #readiness-root {
  --ra-surface: #171a1d;
  --ra-surface-alt: #121518;
  --ra-border: color-mix(in srgb, var(--md-default-fg-color) 12%, var(--md-default-bg-color));
  --ra-accent: var(--md-accent-fg-color);
  --ra-accent-dark: #1aa06b;
  --ra-section-codebase: #60a5fa;
  --ra-section-workflow: #a78bfa;
  --ra-section-team: #34d399;
  --ra-score-green: #34d399;
  --ra-score-amber: #fbbf24;
  --ra-score-red: #f87171;
  --ra-cta-text: var(--rp1-charcoal);
}
</style>

<div id="readiness-root"></div>

<script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
<script src="/javascripts/readiness-assessment.js"></script>
<script>
(function() {
  function mountApp() {
    var root = document.getElementById('readiness-root');
    if (!root || typeof ReactDOM === 'undefined' || typeof ReadinessAssessment === 'undefined') return;
    ReactDOM.createRoot(root).render(React.createElement(ReadinessAssessment));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountApp);
  } else {
    mountApp();
  }

  // Re-mount on MkDocs Material instant navigation
  if (typeof document$ !== 'undefined') {
    document$.subscribe(function() {
      mountApp();
    });
  }
})();
</script>
