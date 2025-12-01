# Common Skill Patterns

This file describes common skill archetypes and design patterns to guide skill creation.

## Skill Archetypes

### 1. Format Handler

**Purpose**: Works with specific file formats (PDF, spreadsheets, images, videos)

**Characteristics**:
- Format-specific operations (read, write, convert, extract)
- May need utility scripts for parsing/generation
- Often needs templates for output formats
- Examples show format-specific patterns

**Structure**:
```
format-handler/
├── SKILL.md (workflow for format operations)
├── TEMPLATES.md (format examples and schemas)
├── EXAMPLES.md (input/output pairs)
└── parser.py (optional: format parsing if complex)
```

**Trigger Terms**: Format name (PDF, Excel, CSV, etc.), format operations (extract, convert, parse)

**Examples**: PDF processor, spreadsheet analyzer, image optimizer

---

### 2. Code Utility

**Purpose**: Analyzes, generates, or transforms code

**Characteristics**:
- Language-specific knowledge
- Code patterns and best practices
- May need validation scripts
- Often includes templates for generated code

**Structure**:
```
code-utility/
├── SKILL.md (code operations workflow)
├── TEMPLATES.md (code templates)
├── PATTERNS.md (language-specific patterns)
└── validate.py (optional: syntax/quality checking)
```

**Trigger Terms**: Language names, code operations (refactor, generate, analyze), code quality terms

**Examples**: Test generator, code refactorer, documentation generator

---

### 3. Workflow Orchestrator

**Purpose**: Guides multi-step processes with decision points

**Characteristics**:
- Stage-based workflows
- Decision trees for branching logic
- Checklists for complex operations
- Validation points between stages

**Structure**:
```
workflow-orchestrator/
├── SKILL.md (stage overview and navigation)
├── WORKFLOWS.md (detailed decision trees)
├── CHECKLIST.md (quality checklists)
└── validate.py (optional: stage validation)
```

**Trigger Terms**: Process names, workflow stages, orchestration terms

**Examples**: Feature builder, deployment manager, data pipeline creator

---

### 4. Data Transformer

**Purpose**: Converts, filters, or reshapes data

**Characteristics**:
- Format conversions (JSON, CSV, XML, YAML)
- Data validation and cleaning
- Transformation rules and filters
- Schema support

**Structure**:
```
data-transformer/
├── SKILL.md (transformation workflow)
├── TEMPLATES.md (format templates and schemas)
├── EXAMPLES.md (transformation examples)
└── transform.py (optional: complex transformations)
```

**Trigger Terms**: Data formats, conversion operations, transformation verbs

**Examples**: Format converter, data cleaner, schema validator

---

### 5. Analysis Tool

**Purpose**: Analyzes and reports on code, data, or systems

**Characteristics**:
- Scanning and pattern detection
- Metric calculation
- Report generation
- Often read-only (tool restrictions)

**Structure**:
```
analysis-tool/
├── SKILL.md (analysis workflow)
├── TEMPLATES.md (report templates)
├── REFERENCE.md (metrics and patterns)
└── analyze.py (optional: metric calculation)
```

**Trigger Terms**: Analysis terms, metric names, report types

**Examples**: Security analyzer, performance profiler, dependency auditor

---

## Design Patterns

### Pattern A: Progressive Disclosure

**When to Use**: Skill has extensive documentation or many options

**How it Works**:
- SKILL.md provides overview and navigation
- Detailed content in referenced files
- Load details only when needed

**Example**:
```markdown
## How It Works

1. Gather requirements (see workflow below)
2. Process input (see EXAMPLES.md for patterns)
3. Generate output (use format from TEMPLATES.md)
4. Validate (run validation.py)

For detailed API documentation, see REFERENCE.md.
```

**Benefits**:
- Keeps SKILL.md under 500 lines
- Reduces token usage
- Maintains access to comprehensive info
- Easy to navigate

---

### Pattern B: Validation Gates

**When to Use**: Multi-step process where errors compound

**How it Works**:
- Define validation points between stages
- Use scripts for deterministic validation
- Stop on validation failure
- Clear rollback procedures

**Example**:
```markdown
## Stage 2: Apply Changes

1. Pre-validation: Run tests to establish baseline
2. Make changes incrementally
3. Post-validation: Run tests again
4. If tests fail: Rollback and diagnose

Use validation script: `python validate.py test`
```

**Benefits**:
- Prevents cascading errors
- Clear quality gates
- Easy to diagnose issues
- Builds confidence in changes

---

### Pattern C: Template Library

**When to Use**: Skill produces structured outputs

**How it Works**:
- Provide exact templates for outputs
- Include variations for different contexts
- Show realistic examples, not placeholders
- Annotate to explain choices

**Example in TEMPLATES.md**:
```markdown
## Template: API Endpoint Documentation

Use this when documenting REST endpoints.

```
## [METHOD] /path/to/endpoint

Description of what this does.

### Request
[template with realistic data]

### Response
[template with realistic data]
```

## Template: Error Response

Use this for error documentation.
[...]
```

**Benefits**:
- Consistent outputs
- Clear expectations
- Easy to follow
- Reduced ambiguity

---

### Pattern D: Decision Trees

**When to Use**: Skill has multiple paths based on context

**How it Works**:
- Present clear decision points
- Show conditions for each path
- Provide specific actions for each branch
- Use flowchart or structured format

**Example in WORKFLOWS.md**:
```markdown
## Decision Tree: Output Format Selection

**Question**: What format does the user need?

→ **JSON**: Structured data for APIs
  1. Use json_template.md
  2. Validate with JSON schema
  3. Format with 2-space indent

→ **CSV**: Tabular data for spreadsheets
  1. Use csv_template.md
  2. Include headers
  3. Quote fields with commas

→ **XML**: Legacy systems
  1. Use xml_template.md
  2. Include schema reference
  3. Validate with XSD
```

**Benefits**:
- Handles complexity without confusion
- Clear path for each scenario
- Easy to extend with new cases
- Reduces decision paralysis

---

### Pattern E: Script-Assisted Operations

**When to Use**: Deterministic operations that are token-heavy or error-prone

**How it Works**:
- Create simple scripts for specific operations
- Document parameters with comments
- Include error handling
- Add tests for complex logic

**Example**:
```markdown
## Validation

Use the validation script for consistent checking:

```bash
python validate.py <input-file>
```

This checks:
- Schema compliance
- Required fields present
- Valid data types
- Constraint satisfaction
```

**Script Requirements**:
- Simple (under 150 lines)
- Well-documented
- Explicit error messages
- No external dependencies if possible

**Benefits**:
- Saves tokens (script code not in context)
- Consistent behavior
- Faster execution
- More reliable for fragile operations

---

## Progressive Disclosure Strategies

### Strategy 1: Overview + Details

**SKILL.md**: High-level workflow and navigation
**Support Files**: Detailed content

```markdown
## How It Works

Brief overview of the process.

For detailed steps, see WORKFLOWS.md.
For output formats, see TEMPLATES.md.
For examples, see EXAMPLES.md.
```

---

### Strategy 2: Layered Information

**SKILL.md**: Core instructions
**REFERENCE.md**: Technical details
**EXAMPLES.md**: Concrete demonstrations

```markdown
## Configuration

Set these required parameters: [brief list]

For complete parameter reference, see REFERENCE.md section 2.
For configuration examples, see EXAMPLES.md.
```

---

### Strategy 3: Conditional Loading

**SKILL.md**: Default path
**ADVANCED.md**: Edge cases and advanced usage

```markdown
## Standard Usage

[Common workflow that covers 80% of cases]

For advanced scenarios (custom schemas, complex transformations),
see ADVANCED.md.
```

---

## When to Use Scripts vs. Instructions

### Use Scripts When:

✅ **Deterministic Operations**
- Parsing structured formats (JSON, CSV, XML)
- Validating against schemas
- Calculating metrics
- Formatting outputs

✅ **Token-Heavy Operations**
- Long, repetitive code that would consume context
- Operations that generate lots of code
- Complex algorithms with fixed logic

✅ **Fragile Operations**
- Exact sequences that must be precise
- Operations prone to subtle errors
- Financial calculations
- Security-sensitive operations

### Use Instructions When:

✅ **Context-Dependent Operations**
- Analyzing code quality (subjective)
- Writing documentation (creative)
- Designing architecture (requires judgment)
- Generating user-facing content

✅ **Simple Operations**
- File reading/writing
- Basic transformations
- Interactive workflows
- Decision-making processes

✅ **Varied Approaches**
- Multiple valid solutions exist
- User preferences matter
- Flexibility needed
- Exploration encouraged

---

## Tool Restriction Patterns

### Pattern: Read-Only Analysis

```yaml
---
name: code-analyzer
description: [...]
allowed-tools: [Read, Grep, Glob, WebFetch]
---
```

**Use for**: Analysis, auditing, reporting (no modifications)

---

### Pattern: Controlled Writing

```yaml
---
name: safe-refactorer
description: [...]
allowed-tools: [Read, Edit, Grep, Glob, Bash]
---
```

**Use for**: Code changes with validation (no web access, controlled edits)

---

### Pattern: Full Access

```yaml
---
name: project-builder
description: [...]
# No allowed-tools restriction
---
```

**Use for**: Full project operations (use with care)

---

## Complexity Decision Guide

### Choose Simple (Single SKILL.md) When:

- Skill has single, focused purpose
- Instructions fit under 300 lines
- No structured outputs needed
- No deterministic operations
- Examples can be inline

### Choose Moderate (SKILL.md + 1-2 files) When:

- Instructions need 300-400 lines
- Structured outputs required (templates)
- Examples would clutter main file
- Clear separation benefits understanding

### Choose Complex (Multiple files + scripts) When:

- Multi-stage workflow with validation
- Deterministic operations needed
- Extensive reference documentation
- Multiple decision paths
- Token savings justify complexity

---

## Anti-Patterns to Avoid

### ❌ Swiss Army Knife

**Problem**: Skill tries to do too many unrelated things
**Solution**: Split into focused, single-purpose skills

### ❌ Over-Engineering

**Problem**: Adds scripts, files, complexity unnecessarily
**Solution**: Start simple, add complexity only when justified

### ❌ Under-Documentation

**Problem**: Assumes too much knowledge, vague instructions
**Solution**: Be explicit, provide examples, explain rationale

### ❌ Orphaned References

**Problem**: References files that don't exist or aren't useful
**Solution**: Only reference files that provide value, ensure they exist

### ❌ Nested References

**Problem**: SKILL.md → FILE1.md → FILE2.md (too deep)
**Solution**: Keep references one level deep from SKILL.md

---

## Quality Patterns

### Pattern: Self-Validating Skill

Includes validation script that checks:
- Input validity
- Output correctness
- Quality metrics
- Consistency

### Pattern: Checklist-Driven Skill

Provides checklists for:
- Pre-requisites
- Process steps
- Quality gates
- Completion criteria

### Pattern: Example-Rich Skill

Shows concrete examples of:
- Common use cases
- Edge cases
- Good vs. bad patterns
- Before/after transformations

---

## Summary

Choose patterns based on:
- Skill complexity and scope
- User needs and workflows
- Token efficiency requirements
- Maintenance considerations

Start simple and add complexity only when clearly justified.
