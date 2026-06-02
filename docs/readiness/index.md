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

<script>
(function() {
  var REACT_URL = 'https://unpkg.com/react@18.3.1/umd/react.production.min.js';
  var REACT_DOM_URL = 'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js';
  var COMPONENT_URL = '/javascripts/readiness-assessment.js';
  // SRI hashes pin the exact CDN payloads for react@18.3.1 / react-dom@18.3.1.
  var REACT_SRI = 'sha384-DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z';
  var REACT_DOM_SRI = 'sha384-gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1';

  function loadScript(url, integrity) {
    return new Promise(function(resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.crossOrigin = 'anonymous';
      if (integrity) s.integrity = integrity;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function mountApp() {
    var root = document.getElementById('readiness-root');
    if (!root || !window.React || !window.ReactDOM || !window.ReadinessAssessment) return;
    if (root._reactRoot) {
      root._reactRoot.render(window.React.createElement(window.ReadinessAssessment));
    } else {
      root._reactRoot = window.ReactDOM.createRoot(root);
      root._reactRoot.render(window.React.createElement(window.ReadinessAssessment));
    }
  }

  function showLoadError() {
    var root = document.getElementById('readiness-root');
    if (root) {
      root.innerHTML = '<div style="text-align:center;padding:64px 16px;color:var(--md-default-fg-color--light);font-size:15px;line-height:1.6;">'
        + 'The readiness assessment couldn\'t load. Please check your connection and refresh the page.'
        + '</div>';
    }
  }

  function ensureAndMount() {
    if (window.React && window.ReactDOM && window.ReadinessAssessment) {
      mountApp();
      return;
    }
    var chain = Promise.resolve();
    if (!window.React) chain = chain.then(function() { return loadScript(REACT_URL, REACT_SRI); });
    if (!window.ReactDOM) chain = chain.then(function() { return loadScript(REACT_DOM_URL, REACT_DOM_SRI); });
    if (!window.ReadinessAssessment) chain = chain.then(function() { return loadScript(COMPONENT_URL); });
    chain.then(mountApp).catch(showLoadError);
  }

  ensureAndMount();

  if (typeof document$ !== 'undefined' && !window.__raReadinessSubscribed) {
    window.__raReadinessSubscribed = true;
    document$.subscribe(function() {
      setTimeout(ensureAndMount, 0);
    });
  }
})();
</script>
