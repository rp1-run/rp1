---
scope: workRoot
path_pattern: "research/{YYYY-MM-DD}-{TOPIC_SLUG}.md"
producer: research-reporter
type: document
description: "Structured research report generated from synthesis data by /deep-research. Path uses date prefix and topic slug."
strictness: flexible
---

# Research Report: {topic}

**Generated**: {YYYY-MM-DD HH:MM}
**Scope**: {single-project | multi-project | technical-investigation}
**Projects Analyzed**: {comma-separated project list}
**KB Status**: {kb status per project from metadata}

## Executive Summary

{executive_summary}

## Research Questions

1. {research_question}

## Findings

### Finding {n}: {title}

**Category**: {architecture | pattern | implementation | integration | performance}
**Confidence**: {High | Medium | Low}

{description}

**Evidence**:
- `{location}` - {snippet excerpt}

## Comparative Analysis

| Aspect | {Project A} | {Project B} | Analysis |
|--------|-------------|-------------|----------|
| {aspect} | {project_a} | {project_b} | {analysis} |

## Recommendations

### Recommendation {n}: {action}

**Priority**: {high | medium | low}
**Rationale**: {rationale}
**Implementation Notes**: {implementation_notes}

## Diagrams

### {title}

{description}

```mermaid
{validated_mermaid_code}
```

## Sources

### Codebase References
- {file:line - description}

### External Sources
- {URL - description}

## Methodology

- **Exploration Mode**: Multi-agent parallel
- **Explorers Spawned**: {count}
- **KB Files Loaded**: {list or "none available"}
- **Files Explored**: {count}
- **Web Searches**: {count}
- **Analysis Mode**: Ultrathink synthesis
