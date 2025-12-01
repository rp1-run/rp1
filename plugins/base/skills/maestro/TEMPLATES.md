# Skill Templates

This file contains ready-to-use templates for different skill complexity levels. Use these as starting points when generating skills.

## Template 1: Simple Single-File Skill

Use for straightforward utilities that don't require supporting files or scripts.

**Characteristics**:
- Single SKILL.md file
- Under 300 lines
- No scripts or support files
- Direct, concise instructions

```markdown
---
name: skill-name-here
description: Clear description of what it does and when to use it. Include trigger terms like 'keyword1', 'keyword2', 'action verb' that users might mention.
---

# Skill Title

Brief one-paragraph overview of what this skill does.

## What This Skill Does

- Specific capability 1
- Specific capability 2
- Specific capability 3

## When to Use

Use this skill when:
- Scenario 1
- Scenario 2
- User mentions specific keywords or requests specific functionality

## How It Works

[Clear, step-by-step instructions for the skill]

Step 1: [Action to take]
Step 2: [Next action]
Step 3: [Final action]

### Important Guidelines

- Guideline 1: [Specific instruction]
- Guideline 2: [Specific instruction]
- Guideline 3: [Specific instruction]

## Expected Output

[Description of what the output should look like]

## Common Edge Cases

- Edge case 1: [How to handle]
- Edge case 2: [How to handle]
```

---

## Template 2: Moderate Skill with Support Files

Use for skills that need templates or examples but aren't overly complex.

**Characteristics**:
- SKILL.md as overview (~300 lines)
- 1-2 supporting files (TEMPLATES.md or EXAMPLES.md)
- No scripts
- Progressive disclosure approach

### SKILL.md Structure

```markdown
---
name: skill-name-here
description: Clear description of what it does and when to use it. Include trigger terms like 'keyword1', 'keyword2', 'action verb' that users might mention.
---

# Skill Title

Overview paragraph explaining the skill's purpose and value.

## What This Skill Does

- High-level capability 1
- High-level capability 2
- High-level capability 3

## When to Use

Use this skill when:
- User requests [specific functionality]
- User mentions [trigger keywords]
- User needs help with [specific task]

## Workflow

Follow this sequence:

1. **Gather Requirements**
   - Ask about [requirement 1]
   - Clarify [requirement 2]
   - Confirm [requirement 3]

2. **Process Information**
   - Analyze [input aspect 1]
   - Consider [input aspect 2]
   - Validate [input aspect 3]

3. **Generate Output**
   - Create [output component 1]
   - Format [output component 2]
   - Verify [output component 3]

4. **Review and Refine**
   - Check [quality criterion 1]
   - Ensure [quality criterion 2]
   - Confirm [quality criterion 3]

## Output Format

The output should follow the format shown in TEMPLATES.md.

See TEMPLATES.md for detailed output format examples.

## Examples

For concrete examples of inputs and outputs, see EXAMPLES.md.

## Best Practices

- Practice 1: [Specific guidance]
- Practice 2: [Specific guidance]
- Practice 3: [Specific guidance]

## Common Issues

**Issue 1**: [Description]
- Solution: [How to handle]

**Issue 2**: [Description]
- Solution: [How to handle]
```

### Accompanying TEMPLATES.md

```markdown
# Output Format Templates

This file contains templates for the outputs this skill generates.

## Template 1: [Template Name]

Use this template when [scenario].

```
[Exact format with placeholders]

Example:
[Concrete example]
```

## Template 2: [Template Name]

Use this template when [different scenario].

```
[Exact format with placeholders]

Example:
[Concrete example]
```

## Variations

### Variation A: [Name]
[When to use and how it differs]

### Variation B: [Name]
[When to use and how it differs]
```

### Accompanying EXAMPLES.md

```markdown
# Examples

This file shows concrete examples of this skill in action.

## Example 1: [Scenario Name]

**Input**:
```
[Realistic input]
```

**Output**:
```
[Expected output]
```

**Notes**: [Explanation of why this output was chosen, what to notice]

## Example 2: [Different Scenario]

**Input**:
```
[Realistic input]
```

**Output**:
```
[Expected output]
```

**Notes**: [Key learning points from this example]

## Example 3: [Edge Case Scenario]

**Input**:
```
[Edge case input]
```

**Output**:
```
[How to handle]
```

**Notes**: [Why this edge case matters and how it's handled]
```

---

## Template 3: Complex Skill with Scripts

Use for skills requiring deterministic operations, validation, or complex multi-step workflows.

**Characteristics**:
- SKILL.md as navigation hub (~400 lines)
- Multiple support files
- Utility scripts (simple, well-documented)
- Tests for complex scripts

### SKILL.md Structure

```markdown
---
name: skill-name-here
description: Comprehensive description of capabilities and use cases. Include trigger terms like 'keyword1', 'keyword2', 'process X', 'handle Y' that users might mention.
allowed-tools: []  # Optional: restrict tools if needed
---

# Skill Title

Comprehensive overview paragraph explaining complex capabilities.

## What This Skill Does

This skill provides:
- Major capability 1 (with sub-capabilities)
- Major capability 2 (with sub-capabilities)
- Major capability 3 (with sub-capabilities)

## When to Use

Use this skill when users need to:
- [Complex task 1]
- [Complex task 2]
- [Complex task 3]

Trigger terms: [keyword1, keyword2, action phrases]

## Architecture Overview

This skill uses a stage-based approach:

1. **Stage 1: [Name]** - [Purpose]
2. **Stage 2: [Name]** - [Purpose]
3. **Stage 3: [Name]** - [Purpose]
4. **Stage 4: [Name]** - [Purpose]

## Detailed Workflow

### Stage 1: [Name]

**Goal**: [What this stage accomplishes]

**Steps**:
1. [Action 1]
2. [Action 2]
3. [Action 3]

**Decision Points**:
- If [condition A]: [action]
- If [condition B]: [different action]

See WORKFLOWS.md for detailed decision trees.

### Stage 2: [Name]

**Goal**: [What this stage accomplishes]

**Steps**:
1. [Action 1]
2. [Action 2]
3. [Action 3]

**Validation**:
Run `python validate.py <input>` to verify before proceeding.

### Stage 3: [Name]

**Goal**: [What this stage accomplishes]

**Steps**:
1. [Action 1]
2. [Action 2]
3. [Action 3]

**Output Format**:
See TEMPLATES.md for expected output structure.

### Stage 4: [Name]

**Goal**: [What this stage accomplishes]

**Steps**:
1. [Action 1]
2. [Action 2]
3. [Action 3]

## Utility Scripts

This skill includes helper scripts for deterministic operations:

**validate.py**:
- Purpose: [What it validates]
- Usage: `python validate.py <input-file>`
- Returns: [What it returns]

**process.py**:
- Purpose: [What it processes]
- Usage: `python process.py <input> <output>`
- Returns: [What it returns]

## Reference Materials

- **TEMPLATES.md**: Output format templates
- **EXAMPLES.md**: Input/output examples with annotations
- **WORKFLOWS.md**: Detailed decision trees and conditional logic
- **REFERENCE.md**: Technical documentation and API details

## Best Practices

- [Practice 1 with rationale]
- [Practice 2 with rationale]
- [Practice 3 with rationale]

## Troubleshooting

**Issue 1**: [Common problem]
- Symptom: [How to identify]
- Cause: [Why it happens]
- Solution: [How to fix]

**Issue 2**: [Common problem]
- Symptom: [How to identify]
- Cause: [Why it happens]
- Solution: [How to fix]

## Quality Checklist

Before completing, verify:
- [ ] [Quality criterion 1]
- [ ] [Quality criterion 2]
- [ ] [Quality criterion 3]
- [ ] All validation scripts pass
- [ ] Output follows templates
```

---

## YAML Frontmatter Variations

### Basic Frontmatter
```yaml
---
name: skill-name
description: What it does and when to use it with trigger terms.
---
```

### With Tool Restrictions (Read-Only)
```yaml
---
name: skill-name
description: What it does and when to use it with trigger terms.
allowed-tools: [Read, Grep, Glob]
---
```

### With Tool Restrictions (Security-Sensitive)
```yaml
---
name: security-analyzer
description: Analyzes code for security vulnerabilities. Use when user mentions 'security', 'vulnerabilities', 'audit', or 'penetration test'.
allowed-tools: [Read, Grep, Glob, WebFetch]
---
```

---

## Description Formula

A good description follows this pattern:

```
[WHAT IT DOES]. [SPECIFIC CAPABILITIES]. Use when [SCENARIOS] or when user mentions '[TRIGGER TERM 1]', '[TRIGGER TERM 2]', '[TRIGGER TERM 3]'.
```

### Examples

**Good**:
```yaml
description: Extracts text, tables, and images from PDF files. Fills PDF forms and merges documents. Use when working with PDF documents or when user mentions 'PDF', 'document', 'form', 'extract', 'merge PDF'.
```

**Bad**:
```yaml
description: Helps with PDFs.  # Too vague, no trigger terms
```

**Good**:
```yaml
description: Analyzes code complexity, detects patterns, and suggests refactoring opportunities. Generates architecture diagrams and documentation. Use when analyzing codebases or when user mentions 'code quality', 'refactor', 'complexity', 'architecture', 'code review'.
```

**Bad**:
```yaml
description: A utility for code analysis.  # Too generic, weak triggers
```

---

## File Naming Conventions

### Support Files
- `TEMPLATES.md` - Output format examples
- `EXAMPLES.md` - Input/output pairs
- `REFERENCE.md` - Detailed technical documentation
- `WORKFLOWS.md` - Decision trees and conditional logic
- `PATTERNS.md` - Common patterns and variations
- `CHECKLIST.md` - Quality checklists

### Scripts
- `validate.py` / `validate.sh` - Validation logic
- `process.py` / `process.sh` - Processing logic
- `format.py` / `format.sh` - Formatting logic
- `test_*.py` / `test_*.sh` - Test files

### Directory Structure Examples

**Simple**:
```
skill-name/
└── SKILL.md
```

**Moderate**:
```
skill-name/
├── SKILL.md
├── TEMPLATES.md
└── EXAMPLES.md
```

**Complex**:
```
skill-name/
├── SKILL.md
├── TEMPLATES.md
├── EXAMPLES.md
├── WORKFLOWS.md
├── REFERENCE.md
├── validate.py
└── test_validate.py
```

---

## Progressive Disclosure Pattern

The key principle: load only what's needed, when it's needed.

**Layer 1**: SKILL.md (always loaded)
- Overview and navigation
- High-level workflows
- References to detailed materials

**Layer 2**: Support files (loaded on reference)
- TEMPLATES.md when generating output
- EXAMPLES.md when demonstrating behavior
- REFERENCE.md when needing technical details

**Layer 3**: Scripts (executed as needed)
- Validation scripts before critical operations
- Processing scripts for deterministic operations
- Format scripts for consistent output

**Example**:
```markdown
## How It Works

1. Gather requirements (see workflow below)
2. Process input (see EXAMPLES.md for patterns)
3. Generate output (use format from TEMPLATES.md)
4. Validate result (run `python validate.py`)

For detailed technical specifications, see REFERENCE.md.
```

This pattern keeps token usage minimal while maintaining access to comprehensive information.
