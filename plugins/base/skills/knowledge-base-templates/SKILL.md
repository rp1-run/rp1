---
name: knowledge-base-templates
description: Provides reusable templates for generating comprehensive codebase knowledge bases including architecture diagrams, concept maps, and module documentation. Supports both single-project and monorepo structures. Use when creating project documentation, knowledge bases, or when user mentions KB templates, codebase documentation, or project documentation structure.
---

# Knowledge Base Templates

This skill provides professional templates for creating comprehensive codebase knowledge bases. These templates help document codebases systematically, making them easier to understand and navigate for developers.

## What This Skill Provides

**Documentation Templates**:
- **index.md**: Project overview and quick start guide
- **concept_map.md**: Domain concepts and terminology glossary
- **architecture.md**: System architecture with Mermaid diagrams
- **modules.md**: Component and module breakdown with dependency graphs
- **patterns.md**: Implementation patterns and coding idioms (≤150 lines)
- **dependencies.md**: Inter-project dependencies (monorepo)
- **technology-matrix.md**: Technology stack and architecture decisions (monorepo)
- **state.json**: Metadata and generation tracking

**Two Structure Types**:
- **Single Project**: Standard project documentation structure
- **Monorepo**: Multi-project documentation with cross-project dependencies

## When to Use

Use this skill when:
- Creating knowledge base documentation for a codebase
- Setting up project documentation structure
- Documenting single projects or monorepos
- Generating architecture documentation
- Building technical documentation for onboarding
- User mentions "KB templates", "knowledge base", "codebase documentation"

## How to Use Templates

### Single Project Structure

For standard single-project repositories:

```bash
# Target structure
{RP1_ROOT}/context/
├── index.md              # Project overview
├── concept_map.md        # Domain concepts
├── architecture.md       # System architecture
├── modules.md            # Module breakdown
├── patterns.md           # Implementation patterns
└── state.json            # Metadata
```

**Using Templates**:
1. Read template: `templates/single-project/index.md`
2. Fill in placeholders with project-specific information
3. Write to target location: `{RP1_ROOT}/context/index.md`
4. Repeat for each template

**Template Placeholders**:
- `[Project Name]`: Replace with actual project name
- `[Language]`: Replace with programming language(s)
- `[Date]`: Replace with current date
- `[repo-url]`, `[commands]`, etc.: Replace with actual values
- Sections in brackets: Fill with project-specific content

### Monorepo Structure

For repositories with multiple projects:

```bash
# Target structure
{RP1_ROOT}/context/
├── index.md              # Repository overview
├── concept_map.md        # Cross-project concepts
├── architecture.md       # System-wide architecture
├── modules.md           # Modules across projects
├── dependencies.md       # Inter-project relationships
├── technology-matrix.md  # Tech stack matrix
├── projects/             # Per-project documentation
│   ├── service-a/
│   │   ├── overview.md
│   │   ├── concept_map.md
│   │   ├── architecture.md
│   │   └── modules.md
│   └── frontend/
│       └── ...
└── state.json           # Repository metadata
```

**Using Templates**:
1. Use `templates/monorepo/` templates for repository-level docs
2. Use `templates/single-project/` templates for per-project docs
3. Fill placeholders with monorepo and project-specific information

### Template Loading Workflow

**Step 1: Determine Project Type**
```python
if is_monorepo():
    base_templates = "templates/monorepo/"
    needs_project_level = True
else:
    base_templates = "templates/single-project/"
    needs_project_level = False
```

**Step 2: Load and Fill Templates**
```python
# Read template
template = read_file(f"{skill_path}/{base_templates}/index.md")

# Fill with analyzed data
filled = template.replace("[Project Name]", project_name)
filled = filled.replace("[Date]", current_date)
# ... more replacements

# Write to target location
write_file(f"{RP1_ROOT}/context/index.md", filled)
```

**Step 3: Generate Diagrams**
Templates include Mermaid diagram placeholders. When filling templates:
- Replace example diagrams with project-specific ones
- Use the mermaid skill to validate diagram syntax
- Ensure diagrams accurately represent the codebase

## Template Reference

### index.md
**Purpose**: Entry point and navigation hub for progressive KB loading

**Key Sections**:
- Project summary (WHAT and WHY in 2-3 sentences)
- Quick reference table (entry point, key pattern, tech stack)
- KB File Manifest with line counts and "Load For" guidance
- Task-Based Loading profiles (code review, bug investigation, etc.)
- How to Load instructions
- Project structure tree
- Navigation links to other KB files

**When to Use**: Always - this is the mandatory entry point for all KB-aware agents

**Progressive Loading Pattern**:
Index.md is designed as a "jump off" point. Agents should:
1. Load index.md first to understand project structure
2. Based on task, selectively load additional files per Task-Based Loading table
3. Never load all KB files unless performing holistic analysis

### concept_map.md
**Purpose**: Domain concepts and terminology

**Key Sections**:
- Core business concepts with definitions
- Technical concepts and patterns
- Terminology glossary
- Cross-references to other docs

**When to Use**: Projects with domain-specific terminology or complex business logic

### architecture.md
**Purpose**: System architecture and design

**Key Sections**:
- High-level architecture diagram
- Component architecture
- Data flow diagrams (sequence diagrams)
- Integration points
- Security architecture
- Performance considerations
- Deployment architecture

**When to Use**: Always - helps understand system design

**Diagram Integration**: Uses Mermaid for:
- Component diagrams (graph TB/LR)
- Sequence diagrams (sequenceDiagram)
- Should be validated with mermaid skill

### modules.md
**Purpose**: Detailed module and component breakdown

**Key Sections**:
- Core modules with purposes
- Support modules
- Module dependencies graph
- Module metrics table
- Code quality insights

**When to Use**: Codebases with clear module structure

**Diagram Integration**: Uses Mermaid ER diagrams and dependency graphs

### patterns.md
**Purpose**: Implementation patterns and coding idioms

**Key Sections**:
- Naming & Organization (files, functions, imports)
- Type & Data Modeling (data representation, strictness, immutability)
- Error Handling (strategy, propagation, common types)
- Validation & Boundaries (location, method, normalization)
- Observability (logging, metrics, tracing)
- Testing Idioms (organization, fixtures, levels)
- Conditional: I/O & Integration, Concurrency, DI, Extensions

**When to Use**: Always - helps AI and developers follow established conventions

**Budget**: Hard limit of 150 lines for scannability

### dependencies.md (Monorepo Only)
**Purpose**: Inter-project dependencies and relationships

**Key Sections**:
- Dependency graph
- Project matrix
- Shared code impact analysis
- Build dependencies and order
- Change impact matrix

**When to Use**: Monorepos with multiple projects

### technology-matrix.md (Monorepo Only)
**Purpose**: Technology stack by project

**Key Sections**:
- Project technologies table
- Language distribution
- Shared technologies
- Architecture decision records
- Upgrade path and roadmap

**When to Use**: Monorepos with multiple technology stacks

### state.json
**Purpose**: Shareable metadata and tracking information (safe to commit)

**Key Fields**:
- `strategy`: Build strategy used (e.g., "parallel-map-reduce")
- `repo_type`: "single-project" or "monorepo"
- `monorepo_projects`: List of project directories (monorepo)
- `generated_at`: When analysis was performed (ISO timestamp)
- `git_commit`: Commit hash at generation time
- `files_analyzed`: Number of files processed
- `languages`: Detected programming languages
- `metrics`: Module, component, and concept counts

**When to Use**: Always - tracks knowledge base state

**NOTE**: Does NOT contain local paths. Local values are stored in `meta.json`.

### meta.json
**Purpose**: Local-only values that should NOT be shared with team members

**Key Fields**:
- `repo_root`: Absolute path to repository root (local to each machine)
- `current_project_path`: Relative path from repo_root to current project

**When to Use**: Always generated alongside state.json

**IMPORTANT**: Add to `.gitignore` - these paths may differ per team member and should not be committed.

## Best Practices

### Template Customization
1. **Keep Structure**: Maintain section headings for consistency
2. **Remove Unused Sections**: Delete sections that don't apply
3. **Add Project-Specific Sections**: Extend templates as needed
4. **Update Cross-References**: Ensure links between docs work

### Filling Templates
1. **Be Specific**: Replace generic placeholders with actual details
2. **Keep Concise**: Focus on high-value information
3. **Use Examples**: Include code examples where helpful
4. **Validate Diagrams**: Always validate Mermaid syntax

### Documentation Organization
1. **Progressive Disclosure**: Start with index.md, link to details
2. **One Level Deep**: Reference other docs directly, avoid deep nesting
3. **Consistent Terminology**: Use same terms across all docs
4. **Regular Updates**: Track changes in state.json

### Mermaid Diagrams
1. **Use Subgraphs**: Organize complex diagrams with subgraphs
2. **Clear Labels**: Make node and edge labels descriptive
3. **Consistent Style**: Use similar styling across diagrams
4. **Validate Syntax**: Use mermaid skill to validate before saving

## Integration with Other Tools

### Mermaid Skill
This skill's templates include Mermaid diagrams. Use the mermaid skill to:
- Validate diagram syntax
- Generate complex diagrams
- Fix diagram errors

Example workflow:
```
1. Load architecture.md template
2. Generate Mermaid diagram for project
3. Use mermaid skill to validate diagram
4. Fill template with validated diagram
5. Write completed documentation
```

### Knowledge Build Commands
These templates are designed to work with knowledge building workflows:
- `/knowledge-build`: Uses these templates to generate documentation
- `/knowledge-load`: Loads generated knowledge bases (deprecated - agents load KB directly)
- `/project-birds-eye-view`: May use similar structure

## Index.md Generation (Orchestrator-Owned)

**Important**: Index.md is generated directly by the `/knowledge-build` orchestrator, NOT by a sub-agent. This is because the orchestrator has visibility into all 4 sub-agent outputs and can aggregate key facts into a "jump off" entry point.

### Aggregation Process

Extract data from each sub-agent's JSON output:

| Data | Source Agent | JSON Path |
|------|--------------|-----------|
| Project summary | concept-extractor | `data.concepts[0].description` or domain overview |
| Entry points | architecture-mapper | `data.entry_points[]` |
| Key pattern | pattern-extractor | `data.patterns[0].name` |
| Tech stack | module-analyzer | `data.project.frameworks[]` + `data.project.primary_language` |
| Project name | spatial-analyzer | `project.name` or package.json |
| Languages | module-analyzer | `data.metadata.languages[]` |

### Calculate File Manifest

After writing concept_map.md, architecture.md, modules.md, patterns.md, calculate line counts:

```bash
wc -l {{RP1_ROOT}}/context/concept_map.md
wc -l {{RP1_ROOT}}/context/architecture.md
wc -l {{RP1_ROOT}}/context/modules.md
wc -l {{RP1_ROOT}}/context/patterns.md
# For monorepo, also:
wc -l {{RP1_ROOT}}/context/dependencies.md
wc -l {{RP1_ROOT}}/context/technology-matrix.md
```

### Template Placeholder Mapping

Use template from `templates/{single-project|monorepo}/index.md`:

| Placeholder | Data Source |
|-------------|-------------|
| `[Project Name]` | spatial-analyzer or package.json `name` |
| `[Primary languages]` | module-analyzer languages |
| `[Version]` | package.json version or git describe |
| `[Date]` | Current date (ISO format) |
| `[2-3 sentences...]` | Aggregated from concept-extractor domain description |
| `[main file/command]` | architecture-mapper entry_points[0] |
| `[primary architectural pattern]` | pattern-extractor patterns[0].name |
| `[core technologies]` | module-analyzer frameworks |
| `~[N]` (line counts) | wc -l results from file manifest step |
| `[key directories]` | spatial-analyzer structure or architecture-mapper |
| `[project-a]`, `[project-b]` | spatial-analyzer monorepo_projects (monorepo only) |

### Generation Order

1. Write concept_map.md, architecture.md, modules.md, patterns.md first
2. Calculate line counts for file manifest
3. Fill index.md template with aggregated data
4. Write index.md last

## Examples

See EXAMPLES.md for complete filled-in knowledge base examples.

## Customization Guide

See REFERENCE.md for:
- Detailed template customization instructions
- Section-by-section guidance
- Best practices for each template type
- Common pitfalls and how to avoid them

## Template Locations

All templates are in the `templates/` directory:

```
templates/
├── single-project/
│   ├── index.md
│   ├── concept_map.md
│   ├── architecture.md
│   ├── modules.md
│   └── patterns.md
├── monorepo/
│   ├── index.md
│   ├── concept_map.md
│   ├── architecture.md
│   ├── modules.md
│   ├── patterns.md
│   ├── dependencies.md
│   └── technology-matrix.md
└── state.json
```

Access templates using Read tool with full path from skill base directory.
