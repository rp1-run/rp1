---
name: prompt-writer
description: Write maximally terse agent prompts from scratch. Use when creating new agent specs, command prompts, or instruction sets. Teaches structure-first composition with compression-by-default patterns.
---

# Prompt Writer - Terse Prompt Authoring

Guide for writing maximally terse agent prompts without post-hoc compression. Applies compression-by-default principles at authoring time.

## When to Use

- Creating new agent specifications
- Writing command/skill prompts
- Drafting instruction sets for AI agents
- Authoring system prompts

## Core Principles

**Structure-First**: Start with skeleton, not prose. Choose section pattern, fill minimally.

**Compression-by-Default**: Every word must earn its place. Remove before adding.

**Preserve Exactness**: Normative language (MUST/SHOULD/MAY), literals, constraints stay verbatim.

## §1 Section Patterns

Use terse section headers. Pick from:

| Header | Purpose |
|--------|---------|
| §ROLE | Agent identity/persona |
| §OBJ | Goals/objectives |
| §CTX | Context/assumptions |
| §IN | Input format/params |
| §OUT | Output format/deliverables |
| §TOOLS | Available tools/resources |
| §DO | Required behaviors |
| §DONT | Prohibited behaviors |
| §PROC | Step-by-step procedure |
| §FMT | Format/style rules |
| §CHK | Acceptance criteria/checks |
| §LEG | Legend for abbreviations |

Not all sections needed. Use only what's required.

## §2 Composition Tactics

### 2.1 Prefer Structure Over Prose

```markdown
# BAD (prose)
You should first analyze the input, then validate it against the schema,
and finally transform it into the output format while logging any errors.

# GOOD (structured)
§PROC
1. Analyze input
2. Validate vs schema
3. Transform → output fmt
4. Log errors
```

### 2.2 Use Bullet Fragments

```markdown
# BAD
- You need to read the configuration file from the specified path
- You should validate that all required fields are present
- You must handle missing fields gracefully

# GOOD
- Read config from path
- Validate required fields present
- Handle missing fields gracefully
```

### 2.3 Key:Value for Parameters

```markdown
# BAD
The input parameter should be a file path. The mode can be either
"strict" or "lenient", defaulting to "strict". The timeout is in
milliseconds with a default of 5000.

# GOOD
§IN
| Param | Type | Default | Note |
|-------|------|---------|------|
| input | path | (req) | File to process |
| mode | enum | strict | strict/lenient |
| timeout | ms | 5000 | Max wait |
```

### 2.4 Compact Operators

Use freely: `->`, `:`, `/`, `w/`, `w/o`, `>=`, `<=`, `==`, `!=`, `incl`, `excl`, `+`, `&`

```markdown
# BAD
Transform the input to the output format without including timestamps

# GOOD
Input -> output fmt w/o timestamps
```

## §3 Abbreviation Policy

### Safe Abbreviations (use freely)

`w/` `w/o` `req` `opt` `eg` `ie` `vs` `approx` `min` `max` `IO` `ctx` `fmt` `fn` `cfg` `env` `dir` `param` `val` `def` `ref` `spec` `doc` `impl` `init` `exec`

### Legend Rule

If using non-standard abbreviations, add §LEG section:

```markdown
§LEG
- AC = acceptance criteria
- KB = knowledge base
- PR = pull request
```

Limit: ≤8 entries. If more needed, spell out.

## §4 Normative Language

Keep EXACT—no symbols, no softening:

| Word | Meaning |
|------|---------|
| MUST | Absolute requirement |
| MUST NOT | Absolute prohibition |
| SHOULD | Strong recommendation |
| SHOULD NOT | Strong discouragement |
| MAY | Optional/permitted |

```markdown
# BAD
Users are required to provide auth tokens (REQUIRED!)

# GOOD
Users MUST provide auth tokens
```

## §5 Symbolic Encoding

When clearer + shorter, encode as:

- **Mermaid**: flows, sequences, state machines
- **EBNF/regex**: syntax patterns
- **JSON/YAML**: schemas, configs
- **Pseudo-code**: algorithms

```markdown
# Instead of prose describing a flow:
§PROC (mermaid)
​```mermaid
stateDiagram-v2
  [*] --> Parse
  Parse --> Validate
  Validate --> Transform: valid
  Validate --> Error: invalid
  Transform --> [*]
  Error --> [*]
​```
```

Only when it REDUCES confusion. Don't force diagrams.

## §6 Anti-Patterns

| Pattern | Problem | Fix |
|---------|---------|-----|
| Pleasantries | "Please kindly..." wastes tokens | Direct imperatives |
| Redundancy | Saying same thing twice | Single best phrasing |
| Over-hedging | "You might want to consider..." | State directly |
| Verbose conditionals | "In the case that X happens..." | "If X:" |
| Unnecessary context | Explaining obvious things | Omit |
| Meta-commentary | "This section describes..." | Just describe |

## §7 Quick Reference

```
SKELETON
─────────
§ROLE: [identity - 1 line]

§OBJ: [goals - bullets]

§IN: [params - table]

§OUT: [format - example]

§PROC:
1. Step
2. Step
3. Step

§DO: [required - bullets]
§DONT: [prohibited - bullets]

§CHK: [criteria - checklist]
```

## §8 Examples

See TEMPLATES.md for complete prompt templates at different complexity levels.
See PATTERNS.md for common domain-specific patterns (agents, commands, tools).

## Validation Checklist

Before finalizing prompt:

- [ ] Each word earns its place
- [ ] Structure used over prose where possible
- [ ] Normative words preserved exactly
- [ ] Literals/paths/names verbatim
- [ ] No redundancy/repetition
- [ ] Abbreviations obvious or in §LEG
- [ ] Symbolics only where clearer
- [ ] ≤300 lines for simple, ≤500 for complex
