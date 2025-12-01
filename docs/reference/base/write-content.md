# write-content

Interactive assistant for creating polished technical documents through structured collaboration.

---

## Synopsis

=== "Claude Code"

    ```bash
    /rp1-base:write-content
    ```

=== "OpenCode"

    ```bash
    /rp1-base/write-content
    ```

## Description

The `write-content` command guides you through creating high-quality technical documents. It uses a structured workflow with clarifying questions to ensure accuracy and completeness before generating the final document.

## Document Types

The command supports three document types:

| Type | Purpose | Example Use Cases |
|------|---------|-------------------|
| **Blog Post** | Educational or thought leadership | Technical tutorials, announcements |
| **Technical Proposal** | Design or architecture proposals | RFCs, ADRs, design docs |
| **Feedback** | Structured code or design feedback | Code reviews, design critiques |

## Workflow

The command follows a structured process:

1. **Determine Document Type** - Choose blog post, proposal, or feedback
2. **Gather Initial Notes** - Provide rough ideas, bullet points, or outlines
3. **Clarifying Questions** - Answer focused questions to fill gaps
4. **Iterative Refinement** - Continue until sufficient detail is gathered
5. **Write Document** - Generate the complete, polished markdown

## Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `RP1_ROOT` | `.rp1/` | Root directory for output |

## Output

Documents are written to: `.rp1/work/content/<topic>/<type>.md`

## Examples

### Start Content Creation

=== "Claude Code"

    ```bash
    /rp1-base:write-content
    ```

=== "OpenCode"

    ```bash
    /rp1-base/write-content
    ```

### Example Interaction

**Command asks:**
```
What type of document would you like to create?
- Blog post
- Technical proposal
- Feedback
```

**You respond:** "Technical proposal"

**Command asks:**
```
Please share your rough notes or outline for the proposal.
```

**You respond:** "We want to add caching to reduce API latency. Currently seeing 500ms response times."

**Command asks clarifying questions:**
```
To ensure accuracy, I need a few more details:

1. What caching solution are you considering? (Redis, Memcached, in-memory?)
2. What is your target latency after caching?
3. Which API endpoints would benefit most?
4. What cache invalidation strategy do you prefer?
```

After gathering sufficient information, the command generates the complete document.

## Style Guidelines

Documents follow these conventions:

- **Active voice** where possible
- **Direct and specific** language
- **Precise technical vocabulary**
- Curly quotation marks ("" not "")
- Oxford commas
- No em-dashes (use semicolons or periods instead)

## Document Structure

### Blog Post Structure

- Compelling introduction with clear thesis
- Logical section flow with descriptive headings
- Concrete examples and illustrations
- Conclusion reinforcing key points

### Technical Proposal Structure

- Executive summary
- Problem statement
- Proposed solution with technical details
- Implementation approach
- Trade-offs and alternatives considered
- Success metrics

### Feedback Structure

- Context about what is being reviewed
- Structured observations (strengths, concerns, suggestions)
- Specific, actionable recommendations
- Prioritized by impact

## Related Commands

- [`project-birds-eye-view`](project-birds-eye-view.md) - Generate project documentation

## See Also

- [Feature Development Tutorial](../../guides/feature-development.md) - Using structured documentation workflows
