(() => {
  // docs/src/react-shim.js
  var useState = (...a) => window.React.useState(...a);
  var react_shim_default = new Proxy({}, { get: (_, k) => window.React[k] });

  // docs/src/readiness-assessment.jsx
  var QUESTIONS = [
    {
      id: "codebase_size",
      section: "Codebase Reality",
      icon: "⬡",
      question: "How large is your primary codebase?",
      subtext: "The one your team spends the most time in daily",
      options: [
        { label: "< 10K lines", value: 1, hint: "Small / greenfield" },
        { label: "10K – 100K lines", value: 2, hint: "Growing product" },
        { label: "100K – 500K lines", value: 3, hint: "Established system" },
        { label: "500K+ lines", value: 4, hint: "Legacy or enterprise scale" }
      ]
    },
    {
      id: "session_frustration",
      section: "Codebase Reality",
      icon: "⬡",
      question: "How often does Claude Code give you advice that ignores your architecture?",
      subtext: "e.g. suggesting patterns you've already moved away from",
      options: [
        { label: "Rarely", value: 1, hint: "Good context management already" },
        { label: "Sometimes", value: 2, hint: "Occasional friction" },
        { label: "Often", value: 3, hint: "A recurring frustration" },
        { label: "Almost always", value: 4, hint: "A serious productivity drain" }
      ]
    },
    {
      id: "context_resets",
      section: "Codebase Reality",
      icon: "⬡",
      question: "How much time do you spend re-explaining your codebase to AI tools per week?",
      subtext: "Setting context, restating patterns, correcting wrong assumptions",
      options: [
        { label: "< 30 minutes", value: 1, hint: "Minimal overhead" },
        { label: "30–90 minutes", value: 2, hint: "Noticeable overhead" },
        { label: "1.5–3 hours", value: 3, hint: "Significant waste" },
        { label: "3+ hours", value: 4, hint: "Major bottleneck" }
      ]
    },
    {
      id: "iteration_loops",
      section: "Workflow Efficiency",
      icon: "◈",
      question: "How many back-and-forth iterations does it typically take to get working production-ready code?",
      subtext: "From first prompt to code you'd actually merge",
      options: [
        { label: "1–2 iterations", value: 1, hint: "Near first-shot accuracy" },
        { label: "3–5 iterations", value: 2, hint: "Some back-and-forth" },
        { label: "6–10 iterations", value: 3, hint: "Significant prompting work" },
        { label: "10+ iterations", value: 4, hint: "Constant correction cycle" }
      ]
    },
    {
      id: "pr_review",
      section: "Workflow Efficiency",
      icon: "◈",
      question: "How are AI-generated PRs reviewed for architectural compliance today?",
      subtext: "Not just 'does it work' but 'does it respect our patterns'",
      options: [
        { label: "Automated architectural checks exist", value: 1, hint: "Systematic" },
        { label: "Senior engineers manually review", value: 2, hint: "High-cost gate" },
        { label: "Best-effort — sometimes caught, sometimes not", value: 3, hint: "Risky" },
        { label: "No systematic review", value: 4, hint: "Technical debt accumulating" }
      ]
    },
    {
      id: "parallel_work",
      section: "Workflow Efficiency",
      icon: "◈",
      question: "Do you currently run AI agents on multiple features simultaneously?",
      subtext: "Parallel workstreams, not just sequential single-feature sessions",
      options: [
        { label: "Yes, routinely", value: 1, hint: "Already parallelised" },
        { label: "Occasionally, manually managed", value: 2, hint: "Ad-hoc" },
        { label: "Rarely — context switching is too painful", value: 3, hint: "Friction" },
        { label: "No — one thing at a time", value: 4, hint: "Underutilising agents" }
      ]
    },
    {
      id: "team_size",
      section: "Team Readiness",
      icon: "◉",
      question: "How many engineers on your team actively use AI coding tools?",
      subtext: "Regular use — at least a few times per week",
      options: [
        { label: "Just me", value: 1, hint: "Individual" },
        { label: "2–5 engineers", value: 2, hint: "Small team" },
        { label: "6–20 engineers", value: 3, hint: "Mid-size team" },
        { label: "20+ engineers", value: 4, hint: "Large team" }
      ]
    },
    {
      id: "knowledge_sharing",
      section: "Team Readiness",
      icon: "◉",
      question: "When a new engineer joins, how long before they can contribute AI-assisted code that respects your architecture?",
      subtext: "Without producing costly rewrites",
      options: [
        { label: "Same day — we have good tooling", value: 1, hint: "Excellent onboarding" },
        { label: "A few days", value: 2, hint: "Some ramp-up" },
        { label: "A week or two", value: 3, hint: "Significant ramp-up" },
        { label: "Weeks to months", value: 4, hint: "High onboarding cost" }
      ]
    },
    {
      id: "workflow_standards",
      section: "Team Readiness",
      icon: "◉",
      question: "Do your AI coding workflows vary significantly between engineers on the same team?",
      subtext: "Different prompting styles, context-setting approaches, tool choices",
      options: [
        { label: "No — we have shared standards", value: 1, hint: "Standardised" },
        { label: "Loosely aligned", value: 2, hint: "Some consistency" },
        { label: "Quite varied", value: 3, hint: "Fragmented" },
        { label: "Completely individual — no standards", value: 4, hint: "No alignment" }
      ]
    }
  ];
  var SECTIONS = [
    { id: "Codebase Reality", icon: "⬡", color: "var(--ra-section-codebase)" },
    { id: "Workflow Efficiency", icon: "◈", color: "var(--ra-section-workflow)" },
    { id: "Team Readiness", icon: "◉", color: "var(--ra-section-team)" }
  ];
  var SCORE_LEVELS = [
    {
      min: 9,
      max: 15,
      label: "Workflow-ready",
      headline: "You're already disciplined. rp1 compounds that.",
      summary: "Your team has good AI fundamentals. rp1's knowledge graph and constitutional prompting will eliminate the remaining friction and give you the team-layer your individual workflows lack.",
      commands: ["/knowledge-build", "/pr-review", "/phase-plan"],
      color: "var(--ra-score-green)"
    },
    {
      min: 16,
      max: 24,
      label: "High rp1 ROI",
      headline: "Significant untapped efficiency. rp1 directly addresses your blockers.",
      summary: "You're spending real hours re-explaining context and iterating on AI output. The knowledge graph eliminates the re-explanation loop. Constitutional prompting cuts iterations. Your team will feel the difference within a week.",
      commands: ["/knowledge-build", "/build", "/blueprint", "/pr-review"],
      color: "var(--ra-score-amber)"
    },
    {
      min: 25,
      max: 36,
      label: "Critical workflow debt",
      headline: "You're leaving significant value on the table — and accumulating debt.",
      summary: "Your AI coding setup is creating friction at scale. Without persistent codebase context and architectural enforcement, every AI-generated line of code is a liability. rp1 gives your agents what they need to stop producing expensive rewrites.",
      commands: ["/knowledge-build", "/blueprint", "/build", "/pr-review", "/code-investigate"],
      color: "var(--ra-score-red)"
    }
  ];
  function ScoreBar({ value, max, color }) {
    const pct = Math.round(value / max * 100);
    return /* @__PURE__ */ React.createElement("div", { style: { background: "var(--ra-surface-alt)", borderRadius: 4, height: 8, overflow: "hidden", marginTop: 6 } }, /* @__PURE__ */ React.createElement(
      "div",
      {
        style: {
          width: `${pct}%`,
          height: "100%",
          background: color,
          borderRadius: 4,
          transition: "width 1s cubic-bezier(.4,0,.2,1)",
          boxShadow: `0 0 8px color-mix(in srgb, ${color} 40%, transparent)`
        }
      }
    ));
  }
  var SECTION_RECOMMENDATIONS = {
    "Codebase Reality": {
      bottleneck: "Your biggest bottleneck is context loss — you're spending real time re-explaining your codebase to AI tools that should already understand your architecture.",
      fix: "rp1's /knowledge-build command creates a persistent knowledge graph of your codebase so agents never start from zero, and /code-investigate gives them deep architectural awareness before generating code.",
      firstWeek: "Within the first week, you'll notice AI suggestions that actually respect your existing patterns instead of fighting them."
    },
    "Workflow Efficiency": {
      bottleneck: "Your iteration cycles are where you're bleeding the most time — too many back-and-forth rounds to get code that's actually production-ready.",
      fix: "rp1's /build command gives agents structured, architecture-aware task plans so they produce mergeable code in fewer iterations, and /pr-review enforces your standards automatically.",
      firstWeek: "In the first week, you'll see iteration counts drop noticeably as agents work from structured blueprints instead of guessing at your intent."
    },
    "Team Readiness": {
      bottleneck: "Your team's AI workflows are fragmented — inconsistent patterns across engineers means unpredictable code quality and slow onboarding.",
      fix: "rp1's /knowledge-build creates a shared context layer that every engineer's AI tools inherit, while /pr-review standardises quality gates across the whole team.",
      firstWeek: "In the first week, you'll see new team members producing architecture-compliant AI code from day one instead of weeks of ramp-up."
    }
  };
  var READINESS_LEVELS = [
    { max: 25, overview: "You have strong AI coding fundamentals with minimal friction. rp1 will compound your existing discipline by adding persistent codebase context and team-wide consistency." },
    { max: 50, overview: "You've got a working AI coding setup but there are clear efficiency gaps. rp1 will close those gaps by giving your agents architectural awareness and reducing iteration cycles." },
    { max: 75, overview: "Your AI workflows have significant room for improvement. rp1 directly targets the friction you're experiencing — context loss, excessive iterations, and inconsistent output quality." },
    { max: 100, overview: "Your current AI coding setup is creating substantial friction at scale. rp1's knowledge graph and structured workflows will fundamentally change how your agents interact with your codebase." }
  ];
  function generateInsight(answers, sectionScores) {
    const scorePct = Math.round(
      Object.values(answers).reduce((a, b) => a + b, 0) / 36 * 100
    );
    const readiness = READINESS_LEVELS.find((l) => scorePct <= l.max) || READINESS_LEVELS[READINESS_LEVELS.length - 1];
    const sorted = [...sectionScores].sort((a, b) => b.pct - a.pct);
    const weakest = sorted[sorted.length - 1];
    const secondWeakest = sorted[sorted.length - 2];
    const primary = SECTION_RECOMMENDATIONS[weakest.id];
    const secondary = SECTION_RECOMMENDATIONS[secondWeakest.id];
    const recs = [primary.bottleneck, primary.fix, primary.firstWeek];
    if (secondWeakest.pct >= 50) {
      recs.push(secondary.fix);
    }
    return { overview: readiness.overview, recommendations: recs };
  }
  function AIInsight({ answers, sectionScores }) {
    const { overview, recommendations } = generateInsight(answers, sectionScores);
    return /* @__PURE__ */ React.createElement("div", { style: { fontSize: 14, color: "var(--md-default-fg-color--light)", lineHeight: 1.75, margin: 0 } }, /* @__PURE__ */ React.createElement("p", { style: { margin: "0 0 12px", borderLeft: "3px solid var(--ra-accent)", paddingLeft: 14 } }, overview), recommendations.map((rec, i) => /* @__PURE__ */ React.createElement("p", { key: i, style: { margin: "0 0 8px", borderLeft: "3px solid var(--ra-border)", paddingLeft: 14, fontSize: 13 } }, rec)));
  }
  function App() {
    const [step, setStep] = useState("intro");
    const [currentQ, setCurrentQ] = useState(0);
    const [answers, setAnswers] = useState({});
    const [hovered, setHovered] = useState(null);
    const totalQ = QUESTIONS.length;
    const q = QUESTIONS[currentQ];
    const section = SECTIONS.find((s) => s.id === q?.section);
    const score = Object.values(answers).reduce((a, b) => a + b, 0);
    const level = SCORE_LEVELS.find((l) => score >= l.min && score <= l.max) || SCORE_LEVELS[1];
    const sectionScores = SECTIONS.map((sec) => {
      const qs = QUESTIONS.filter((q2) => q2.section === sec.id);
      const max = qs.length * 4;
      const actual = qs.reduce((acc, q2) => acc + (answers[q2.id] || 0), 0);
      return { ...sec, score: actual, max, pct: max > 0 ? Math.round(actual / max * 100) : 0 };
    });
    function handleAnswer(val) {
      const newAnswers = { ...answers, [q.id]: val };
      setAnswers(newAnswers);
      if (currentQ + 1 < totalQ) {
        setTimeout(() => setCurrentQ((c) => c + 1), 280);
      } else {
        setTimeout(() => setStep("results"), 350);
      }
    }
    const progressPct = Math.round(currentQ / totalQ * 100);
    return /* @__PURE__ */ React.createElement("div", { style: {
      minHeight: "100vh",
      background: "var(--md-default-bg-color)",
      color: "var(--md-default-fg-color--light)",
      fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px"
    } }, /* @__PURE__ */ React.createElement("style", null, `
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');
        * { box-sizing: border-box; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.5; } }
        .opt-btn { transition: all 0.18s ease; cursor: pointer; }
        .opt-btn:hover { transform: translateX(4px); }
      `), /* @__PURE__ */ React.createElement("div", { style: { width: "100%", maxWidth: 640 } }, step === "intro" && /* @__PURE__ */ React.createElement("div", { style: { animation: "fadeUp 0.5s ease" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 32 } }, /* @__PURE__ */ React.createElement("div", { style: { width: 36, height: 36, background: "linear-gradient(135deg, var(--ra-accent-dark), var(--ra-accent))", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk'", fontWeight: 700, color: "var(--ra-cta-text)", fontSize: 15 } }, "r1"), /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'Space Grotesk'", fontWeight: 600, fontSize: 15, color: "var(--md-default-fg-color)" } }, "rp1")), /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 8, fontSize: 11, fontWeight: 600, color: "var(--ra-accent)", letterSpacing: "0.12em", textTransform: "uppercase" } }, "AI Coding Workflow Assessment"), /* @__PURE__ */ React.createElement("h1", { style: { fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 32, color: "var(--md-default-fg-color)", lineHeight: 1.2, margin: "0 0 16px" } }, "Is your codebase ready for production-grade AI workflows?"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 15, color: "var(--md-default-fg-color--lighter)", lineHeight: 1.7, margin: "0 0 32px" } }, "9 questions. 3 minutes. A personalised diagnosis of where AI friction is costing your team the most — and which rp1 commands address it directly."), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 32 } }, SECTIONS.map((s) => /* @__PURE__ */ React.createElement("div", { key: s.id, style: { background: "var(--ra-surface)", border: "0.5px solid var(--ra-border)", borderRadius: 10, padding: "12px 14px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 18, marginBottom: 6 } }, s.icon), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: s.color, letterSpacing: "0.06em", textTransform: "uppercase" } }, s.id)))), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setStep("questions"),
        style: {
          width: "100%",
          padding: "16px 0",
          background: "linear-gradient(135deg, var(--ra-accent-dark), var(--ra-accent))",
          border: "none",
          borderRadius: 10,
          color: "var(--ra-cta-text)",
          fontFamily: "'Space Grotesk'",
          fontWeight: 700,
          fontSize: 15,
          cursor: "pointer",
          letterSpacing: "0.02em",
          boxShadow: "0 0 24px color-mix(in srgb, var(--ra-accent) 20%, transparent)"
        }
      },
      "Start assessment →"
    ), /* @__PURE__ */ React.createElement("p", { style: { textAlign: "center", marginTop: 12, fontSize: 11, color: "var(--md-default-fg-color--lightest)" } }, "No email required \\u00B7 No account needed \\u00B7 Free forever")), step === "questions" && q && /* @__PURE__ */ React.createElement("div", { key: currentQ, style: { animation: "fadeUp 0.3s ease" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 13, color: section?.color, fontWeight: 600 } }, section?.icon, " ", q.section)), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, color: "var(--md-default-fg-color--lightest)" } }, currentQ + 1, " / ", totalQ)), /* @__PURE__ */ React.createElement("div", { style: { background: "var(--ra-surface-alt)", borderRadius: 4, height: 3, marginBottom: 32, overflow: "hidden" } }, /* @__PURE__ */ React.createElement("div", { style: { width: `${progressPct}%`, height: "100%", background: section?.color, transition: "width 0.4s ease", boxShadow: `0 0 6px color-mix(in srgb, ${section?.color} 40%, transparent)` } })), /* @__PURE__ */ React.createElement("h2", { style: { fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 22, color: "var(--md-default-fg-color)", lineHeight: 1.3, margin: "0 0 8px" } }, q.question), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 13, color: "var(--md-default-fg-color--lighter)", marginBottom: 28, lineHeight: 1.5 } }, q.subtext), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } }, q.options.map((opt) => /* @__PURE__ */ React.createElement(
      "button",
      {
        key: opt.value,
        className: "opt-btn",
        onClick: () => handleAnswer(opt.value),
        style: {
          background: answers[q.id] === opt.value ? `color-mix(in srgb, ${section?.color} 10%, var(--md-default-bg-color))` : "var(--ra-surface)",
          border: `0.5px solid ${answers[q.id] === opt.value ? section?.color : "var(--ra-border)"}`,
          borderRadius: 10,
          padding: "14px 16px",
          textAlign: "left",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
          width: "100%"
        }
      },
      /* @__PURE__ */ React.createElement("span", { style: { fontSize: 14, fontWeight: 500, color: "var(--md-default-fg-color)" } }, opt.label),
      /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--md-default-fg-color--lighter)", flexShrink: 0, marginLeft: 12 } }, opt.hint)
    ))), currentQ > 0 && /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setCurrentQ((c) => c - 1),
        style: { background: "none", border: "none", color: "var(--md-default-fg-color--lighter)", fontSize: 12, marginTop: 20, cursor: "pointer", padding: 0 }
      },
      "\\u2190 Back"
    )), step === "results" && /* @__PURE__ */ React.createElement("div", { style: { animation: "fadeUp 0.5s ease" } }, /* @__PURE__ */ React.createElement("div", { style: { background: "var(--ra-surface)", border: `1px solid color-mix(in srgb, ${level.color} 20%, transparent)`, borderRadius: 14, padding: 24, marginBottom: 16 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: level.color, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 } }, "Readiness level"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 20, color: "var(--md-default-fg-color)", lineHeight: 1.2 } }, level.label)), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "right" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: "var(--md-default-fg-color--lighter)", marginBottom: 4 } }, "Score"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 28, color: level.color } }, score, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 14, color: "var(--md-default-fg-color--lighter)", fontWeight: 400 } }, "/36")))), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 13.5, color: "var(--md-default-fg-color--light)", lineHeight: 1.65, margin: 0 } }, level.summary)), /* @__PURE__ */ React.createElement("div", { style: { background: "var(--ra-surface)", border: "0.5px solid var(--ra-border)", borderRadius: 14, padding: 20, marginBottom: 16 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--md-default-fg-color--lighter)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 } }, "Section breakdown"), sectionScores.map((s) => /* @__PURE__ */ React.createElement("div", { key: s.id, style: { marginBottom: 16 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 12 } }, /* @__PURE__ */ React.createElement("span", { style: { color: s.color, fontWeight: 600 } }, s.icon, " ", s.id), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--md-default-fg-color--lighter)" } }, s.score, "/", s.max)), /* @__PURE__ */ React.createElement(ScoreBar, { value: s.score, max: s.max, color: s.color })))), /* @__PURE__ */ React.createElement("div", { style: { background: "var(--ra-surface)", border: "0.5px solid var(--ra-border)", borderRadius: 14, padding: 20, marginBottom: 16 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--md-default-fg-color--lighter)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 } }, "Personalised diagnosis"), /* @__PURE__ */ React.createElement(AIInsight, { answers, sectionScores })), /* @__PURE__ */ React.createElement("div", { style: { background: "var(--ra-surface)", border: "0.5px solid var(--ra-border)", borderRadius: 14, padding: 20, marginBottom: 20 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--md-default-fg-color--lighter)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 } }, "Recommended starting commands"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 8 } }, level.commands.map((cmd) => /* @__PURE__ */ React.createElement("span", { key: cmd, style: { background: "var(--ra-surface-alt)", border: "0.5px solid color-mix(in srgb, var(--ra-accent) 27%, transparent)", borderRadius: 6, padding: "5px 10px", fontSize: 12, color: "var(--ra-accent)", fontFamily: "monospace", fontWeight: 600 } }, cmd)))), /* @__PURE__ */ React.createElement(
      "a",
      {
        href: "https://rp1.run/getting-started",
        style: {
          display: "block",
          width: "100%",
          padding: "16px 0",
          background: "linear-gradient(135deg, var(--ra-accent-dark), var(--ra-accent))",
          border: "none",
          borderRadius: 10,
          color: "var(--ra-cta-text)",
          fontFamily: "'Space Grotesk'",
          fontWeight: 700,
          fontSize: 15,
          cursor: "pointer",
          textAlign: "center",
          textDecoration: "none",
          boxShadow: "0 0 24px color-mix(in srgb, var(--ra-accent) 20%, transparent)",
          letterSpacing: "0.02em"
        }
      },
      "Get started with rp1 →"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setStep("intro");
          setCurrentQ(0);
          setAnswers({});
        },
        style: { background: "none", border: "none", color: "var(--md-default-fg-color--lightest)", fontSize: 12, marginTop: 14, cursor: "pointer", width: "100%", textAlign: "center" }
      },
      "Start over"
    ))));
  }

  // docs/src/readiness-assessment-entry.jsx
  window.ReadinessAssessment = App;
})();
