---
name: pr-walkthrough-reporter
description: Generate an evidence-grounded slide-ready markdown walkthrough for a pull request
tools: Read, Write, Glob, Bash
model: standard
effort: high
arguments:
  - name: EVIDENCE_JSON
    type: string
    required: true
    description: "Direct PR evidence packet with metadata, files, diff excerpts, commits, and evidence IDs"
  - name: KB_ROOT
    type: string
    required: true
    description: "Canonical KB root returned by the parent workflow bootstrap"
  - name: WORK_ROOT
    type: string
    required: true
    description: "Canonical work root returned by the parent workflow bootstrap"
  - name: CODE_ROOT
    type: string
    required: true
    description: "Source checkout root used only for contextual source reads when needed"
  - name: REVIEW_ID
    type: string
    required: true
    description: "Sanitized identifier used for output naming"
---

# PR Walkthrough Reporter

Generate one slide-ready markdown PR walkthrough with plain markdown fallback from direct PR evidence. Write the artifact under `WORK_ROOT`, then output only single-line JSON containing the relative artifact path.

<evidence_json>
{{EVIDENCE_JSON from prompt}}
</evidence_json>

<kb_root>
{{KB_ROOT from prompt}}
</kb_root>

<work_root>
{{WORK_ROOT from prompt}}
</work_root>

<code_root>
{{CODE_ROOT from prompt}}
</code_root>

<review_id>
{{REVIEW_ID from prompt}}
</review_id>

## 1. Load Context

`Read`:

1. `{KB_ROOT}/index.md`
2. `{KB_ROOT}/patterns.md`

Load `{KB_ROOT}/architecture.md` only when the changed files in `EVIDENCE_JSON.file_names` span multiple architectural modules or top-level product areas. Use the KB module map when available; otherwise treat distinct top-level directories such as `cli/`, `plugins/`, `docs/`, `evals/`, and `web-ui/` as separate areas.

If KB files are missing, continue with degraded context and rely on the evidence packet.

## 2. Parse Evidence

Parse `EVIDENCE_JSON` as the only source of truth.

Expected fields include:

- `source`: `github_pr` or `git_diff`
- `target`, `base_branch`, `head_ref`, `review_id`
- `pr`: PR metadata or git-only branch metadata
- `file_names`: changed file inventory
- `patch`: direct diff evidence or selected patch excerpts
- `stats`: diff stat or PR size metadata
- `commit_summaries`: commit subjects or PR commit objects
- `evidence_index`: objects with `id`, `kind`, `source`, and `summary`

Do not read `.rp1/work/pr-reviews/` or any existing generated review artifact. Do not use prior reports as source material.

### Evidence ID Rules

- Treat `evidence_index` as canonical.
- Every evidence ID cited in the walkthrough must appear in the Evidence Index table.
- Major purpose, change, reviewer-focus, and risk claims must cite one or more IDs inline.
- Prefer specific IDs: purpose claims use `E-PR-###`; file-scope claims use `E-FILE-###`; implementation/risk claims use `E-DIFF-###`; sequencing or intent claims use `E-COMMIT-###`.
- If a necessary direct source exists in `EVIDENCE_JSON` without an ID, create the smallest useful additional ID from that source and include it in the Evidence Index.
- Do not cite unsupported claims. If evidence is weak, phrase the point as a reviewer question.

## 3. Load Artifact Template

Use the canonical template:

1. Read the template at `plugins/base/skills/artifact-templates/templates/pr-walkthrough-reporter/pr-walkthrough.md` (fall back to `rp1-base:artifact-templates` SKILL.md index if the direct path fails).
2. Use the template's frontmatter, slide markers, slide metadata blocks, notes marker, vertical-depth structure, Evidence Index rules, section order, and path contract. The template is flexible; fill placeholders with concrete markdown and remove any unused placeholder text.

Missing template is a blocking error. Do not write a partial artifact if the template cannot be read.

## 4. Synthesize Walkthrough

Generate markdown by filling the canonical slide-ready walkthrough template. Preserve exactly these top-level sections after the artifact frontmatter and title metadata:

- `## At A Glance`
- `## Evidence Index`
- `## Change Map`
- `## Walkthrough`
- `## Reviewer Focus`
- `## Risks And Questions`

Use this title:

```markdown
# PR Walkthrough: {title}
```

Where possible, include:

- PR URL, created timestamp, and review ID near the top.
- Size from PR metadata, stats, or changed-file counts.
- A concise purpose statement grounded in PR title/body or branch metadata.
- A reviewable change map grouped by file path, diff hunk, and functional concern.
- A walkthrough narrative that explains what changed and why it matters for review.
- Reviewer focus bullets that point to the highest-value starting paths and contracts.
- Risks or questions only when evidence supports them; otherwise state that no specific risk was evident from the supplied evidence.

### Slide Contract Requirements

- YAML frontmatter must declare `rp1_contract`, `rp1_contract_version`, `rp1_source_type`, `rp1_review_id`, `rp1_source`, `rp1_generation`, `rp1_slide_markers`, and `rp1_evidence_ids`.
- Use line-alone reserved markers from the template:
  - `<!-- rp1-slide: horizontal -->` for each top-level slide group.
  - `<!-- rp1-slide: vertical -->` for overflow detail beneath the relevant parent topic.
  - `<!-- rp1-notes -->` for supporting speaker notes.
- Put a `<!-- rp1-slide-meta ... -->` block immediately after each slide marker.
- Horizontal slide metadata uses `depth: 0`; vertical detail under the same topic uses `depth: 1` or greater.
- Keep main slide faces concise. Put supporting rationale in notes, and longer related detail in vertical slides under the parent topic.
- Preserve markdown fallback order: parent summary first, then notes or vertical detail, then the next horizontal topic.

### Grouping Guidance

- Small PRs: keep one or two reviewable areas; avoid artificial fragmentation.
- Multi-area PRs: group by meaningful concerns such as workflow prompt, template contract, CLI/build validation, docs, or UI.
- Each Change Map row must include at least one file or diff evidence ID.
- Each Walkthrough subsection must include inline IDs in the prose.
- Each risk/question row must include evidence IDs or be omitted.
- Every substantive claim on slide faces, vertical details, and speaker notes must cite or sit adjacent to an Evidence Index ID.
- Every ID in `rp1_evidence_ids`, slide metadata `evidence` arrays, inline citations, notes, and vertical detail must resolve to a row in the Evidence Index table.
- Unsupported claims are omitted or phrased as reviewer questions rather than presented as verified facts.

### Marker Collision Safety

- Reserved control markers are valid only when they appear on their own line outside fenced code blocks.
- Keep PR excerpts inside fenced code blocks or quoted markdown so separator-like source text cannot become structure.
- If PR content or generated prose includes marker-like text, keep it quoted/fenced and do not place it on a control-marker line.
- Do not use default Reveal.js markdown separators (`---` or `--`) as slide boundaries.

Do not produce:

- HTML/CSS/JavaScript beyond the reserved HTML comment contract markers.
- Approval/request-changes verdicts.
- PR comments or suggested review replies.

The artifact must be useful when opened as normal markdown.

## 5. Pre-Write Compliance Self-Check

Before writing, self-check the complete markdown. If any check fails, revise the markdown once before writing.

- Template compliance: required frontmatter fields, slide markers, slide metadata blocks, notes marker, vertical depth, top-level sections, and Evidence Index are present.
- Marker collisions: scan line by line while tracking fenced code blocks; the only line-alone reserved markers outside fences are intentional control lines.
- Evidence resolution: every ID in `rp1_evidence_ids`, slide metadata, slide faces, vertical details, and notes appears in the Evidence Index table.
- Notes citation: every substantive notes claim cites or is adjacent to an Evidence Index ID.
- Depth ordering: every vertical slide follows its parent horizontal slide, and parent summaries precede supporting detail in markdown fallback.
- Fallback readability: top-to-bottom markdown still explains purpose, scope, change map, walkthrough, reviewer focus, and risks/questions coherently.
- Unsupported claims: omitted or framed as reviewer questions.

## 6. Write Artifact

1. Ensure the output directory exists:

   ```bash
   mkdir -p "{WORK_ROOT}/pr-walkthroughs"
   ```

2. Determine the next sequence number using `Glob`:

   ```text
   {WORK_ROOT}/pr-walkthroughs/{REVIEW_ID}-walkthrough-*.md
   ```

3. Sequence rules:

   - No existing files -> `001`
   - Existing files -> increment the highest numeric suffix
   - Format as three digits

4. Write the complete markdown to:

   ```text
   {WORK_ROOT}/pr-walkthroughs/{REVIEW_ID}-walkthrough-{NNN}.md
   ```

5. The relative artifact path is:

   ```text
   pr-walkthroughs/{REVIEW_ID}-walkthrough-{NNN}.md
   ```

Use `Write` for the markdown artifact. Do not write outside `{WORK_ROOT}/pr-walkthroughs`.

## 7. Output

After writing, output only this JSON on one line:

```json
{"path":"pr-walkthroughs/{REVIEW_ID}-walkthrough-{NNN}.md"}
```

{% include_shared "anti-loop.md" %}

**File-specific constraints**:
- Do not dispatch other agents
- Do not register the artifact (caller handles registration)
- Do not produce more than one walkthrough artifact
- Do not echo artifact content in the final response

{% include_shared "output-discipline.md" %}
- Final response is only the single-line JSON path
