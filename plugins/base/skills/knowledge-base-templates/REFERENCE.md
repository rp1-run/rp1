# Knowledge Base Templates - Reference Guide

This guide provides detailed information on customizing templates, best practices, and common patterns for creating effective knowledge bases.

## Template Customization Guide

### General Principles

**1. Preserve Structure, Adapt Content**
- Keep section headings and organization
- Customize content to fit your project
- Remove sections that truly don't apply
- Add project-specific sections as needed

**2. Replace All Placeholders**
Templates use these placeholder patterns:
- `[Bracketed text]`: Replace with actual values
- `[Language]`, `[Date]`, `[Project Name]`: Specific replacements
- Example code blocks: Replace with real examples
- Diagram nodes/labels: Use actual component names

**3. Maintain Cross-References**
- Keep links between documents working
- Update paths if you reorganize structure
- Use relative paths for portability
- Ensure referenced sections exist

### Template-Specific Customization

#### index.md Customization

**Development Setup Section**:
```markdown
# Generic template
git clone [repo-url]
cd [project-name]
[setup commands]

# Customize to actual setup
git clone https://github.com/yourorg/yourproject.git
cd yourproject
npm install
cp .env.example .env
docker-compose up -d
npm run migrate
```

**Project Structure Section**:
- Show only top-level directories (not deep trees)
- Include purpose comment for each directory
- Focus on developer navigation needs
- Update as structure changes

**Entry Points Section**:
- List actual main files developers need
- Include brief description of each
- Show command to run each entry point
- Note any prerequisites

**Key Commands Section**:
- Only include commands developers actually use
- Group by purpose (dev, test, build, deploy)
- Show actual make/npm/cargo commands
- Include helpful flags or options

#### concept_map.md Customization

**Core Business Concepts**:
- Document domain entities, not code classes
- Focus on business meaning, not implementation
- Explain business rules clearly
- Show relationships between concepts

**Technical Concepts**:
- Document patterns and algorithms
- Explain why they exist (not just what)
- Include performance characteristics
- Show usage examples in code

**Terminology Glossary**:
- Define domain-specific terms
- Distinguish business vs technical terms
- Be consistent with terminology elsewhere
- Provide context for abbreviations

**Anti-Pattern**: Don't just list class names without explaining domain meaning.

#### architecture.md Customization

**High-Level Architecture Diagram**:
```mermaid
# Customize node names to actual components
# Use subgraphs to show layers/boundaries
# Show actual communication patterns (REST, gRPC, etc.)
# Include external services you integrate with
```

**Component Architecture**:
- Focus on major components (not every class)
- Explain purpose and responsibilities
- Document public interfaces
- Show key dependencies

**Data Flow Diagrams**:
- Show important user journeys
- Include all significant steps
- Annotate with timing or volumes if relevant
- Use sequence diagrams for temporal flows

**Security Architecture**:
- Document authentication method
- Explain authorization model
- Note encryption and compliance
- Mention audit logging if present

**Diagram Best Practices**:
1. Use consistent node naming
2. Group related components in subgraphs
3. Show direction of data flow
4. Label edges with protocol/method
5. Keep diagrams focused (split if too complex)
6. Validate with mermaid skill before saving

#### modules.md Customization

**Core Modules Section**:
- Document functional modules, not directory structure
- Explain module purpose clearly
- Show public interface (exports)
- Include usage examples
- Note test coverage if known

**Module Dependencies**:
- Create accurate dependency graph
- Identify highly-coupled modules
- Note circular dependencies (and plans to fix)
- Show import patterns

**Module Metrics**:
- Provide actual metrics if available
- Estimate if exact numbers unknown
- Focus on relative comparisons
- Update periodically

**Code Quality Insights**:
- Highlight well-designed modules (explain why)
- Note technical debt areas (with context)
- Document architectural patterns used
- Suggest improvements constructively

#### dependencies.md Customization (Monorepo)

**Dependency Graph**:
- Show all projects and their relationships
- Use different node shapes for different types
- Label edges with dependency type (imports, API calls, events)
- Include external dependencies if significant

**Project Matrix**:
- List all projects in monorepo
- Show direct dependencies
- Note consumers of each project
- Keep updated as dependencies change

**Shared Code Impact**:
- Document each shared library
- List consumers explicitly
- Assess breaking change risk
- Explain versioning strategy

**Build Order**:
- Show correct build sequence
- Note what can be built in parallel
- Document critical path
- Include timing estimates

#### technology-matrix.md Customization (Monorepo)

**Project Technologies Table**:
- Include all relevant technology columns
- Show versions for major dependencies
- Note deployment targets
- Keep current

**Language Distribution**:
- Provide actual percentages
- Show project count per language
- Note version standardization

**Architecture Decision Records**:
- Document major technology choices
- Explain rationale (not just "we chose X")
- Note alternatives considered
- Date decisions for context

**Upgrade Path**:
- List planned upgrades
- Show benefits and effort estimates
- Note dependencies between upgrades
- Track completion status

#### state.json Customization

**Required Fields**:
```json
{
  "repo_type": "single-project",  // or "monorepo"
  "analysis_date": "2025-01-15T10:30:00Z",
  "last_commit": "abc123def",
  "build_strategy": "full_scan"
}
```

**Optional But Recommended**:
```json
{
  "projects_analyzed": ["project1", "project2"],
  "total_files_scanned": 1247,
  "languages_detected": {
    "Go": {"files": 156, "lines": 45000}
  }
}
```

**Validation Context**:
Use this section to track documentation staleness:
```json
{
  "validation_context": {
    "total_issues_found": 5,
    "issues_actioned": 3,
    "issues_remaining": 2,
    "issue_types": {
      "stale_documents": 2
    }
  }
}
```

## Best Practices

### Writing Style

**Be Concise**:
- Short, clear sentences
- Active voice preferred
- Avoid unnecessary words
- Get to the point quickly

**Be Specific**:
- Use actual names, not placeholders
- Include real examples
- Provide concrete numbers
- Show actual code snippets

**Be Helpful**:
- Explain the "why" not just "what"
- Provide context for decisions
- Link related information
- Anticipate questions

### Content Organization

**Progressive Disclosure**:
1. Overview in index.md
2. Key concepts in concept_map.md
3. Detailed architecture in architecture.md
4. Module details in modules.md

**One Level Deep**:
- Reference other docs directly
- Avoid "see X which references Y"
- Keep navigation simple
- Use clear section anchors

**Consistent Terminology**:
- Define terms once in concept_map.md
- Use same terms throughout
- Create glossary for domain terms
- Avoid synonyms for same concept

### Diagram Guidelines

**When to Use Diagrams**:
- Complex relationships benefit from visualization
- Architecture overview (always)
- Data flow for key operations
- Module dependencies
- Database schema

**Diagram Types by Use Case**:
- **Component relationships**: `graph TB` or `graph LR`
- **Temporal flows**: `sequenceDiagram`
- **State machines**: `stateDiagram-v2`
- **Database schema**: `erDiagram`
- **Project dependencies**: `graph TD`

**Diagram Complexity**:
- Maximum 12-15 nodes per diagram
- Split complex diagrams into multiple views
- Use subgraphs to organize
- Keep labels short and clear

**Mermaid Best Practices**:
```mermaid
# Good: Clear, labeled, organized
graph TB
    subgraph "Frontend"
        Web[Web App]
        Mobile[Mobile App]
    end

    subgraph "Backend"
        API[API Gateway]
        Auth[Auth Service]
    end

    Web -->|HTTPS| API
    Mobile -->|HTTPS| API
    API -->|gRPC| Auth
```

```mermaid
# Bad: Too many unlabeled nodes
graph TB
    A --> B
    B --> C
    C --> D
    D --> E
    E --> F
    F --> G
    G --> H
    # (Hard to understand without context)
```

### Maintenance

**Keep Current**:
- Update dates when making changes
- Increment state.json when updating
- Review docs with each major release
- Mark deprecated information

**Track Staleness**:
Use state.json validation_context to track:
- Documents needing updates
- Missing documentation
- Inconsistencies found

**Regular Reviews**:
- Quarterly documentation review
- After major architectural changes
- When onboarding notes confusion
- Before major releases

## Common Pitfalls

### Pitfall 1: Too Generic
**Problem**: Templates still have placeholders after generation
**Solution**: Replace ALL bracketed placeholders with actual values

### Pitfall 2: Too Detailed
**Problem**: Documenting every class and function
**Solution**: Focus on high-level architecture and key concepts

### Pitfall 3: Stale Content
**Problem**: Documentation doesn't match current code
**Solution**: Track updates in state.json, review regularly

### Pitfall 4: Broken Diagrams
**Problem**: Invalid Mermaid syntax
**Solution**: Always validate with mermaid skill before saving

### Pitfall 5: Inconsistent Terms
**Problem**: Same concept called different things
**Solution**: Create glossary, use consistent terminology

### Pitfall 6: Missing Context
**Problem**: Documentation assumes too much knowledge
**Solution**: Explain why, not just what; provide examples

### Pitfall 7: Poor Navigation
**Problem**: Can't find information easily
**Solution**: Clear index.md, good cross-references, logical organization

### Pitfall 8: Overwhelming Detail
**Problem**: Too much information at once
**Solution**: Progressive disclosure - overview first, details in other docs

## Quality Checklist

Before finalizing knowledge base documentation:

**Completeness**:
- [ ] All templates filled in (or removed if not applicable)
- [ ] All placeholders replaced
- [ ] All diagrams present and valid
- [ ] Cross-references working
- [ ] Examples included where helpful

**Accuracy**:
- [ ] Information matches current codebase
- [ ] Diagrams reflect actual architecture
- [ ] Commands work as documented
- [ ] Paths and file references correct
- [ ] Dates and versions current

**Clarity**:
- [ ] Terminology consistent throughout
- [ ] Concepts explained clearly
- [ ] Examples provided for complex topics
- [ ] Navigation is intuitive
- [ ] Purpose of each document clear

**Style**:
- [ ] Writing is concise and clear
- [ ] Active voice used
- [ ] Specific examples, not generic
- [ ] Professional tone maintained

**Technical**:
- [ ] All Mermaid diagrams validated
- [ ] Markdown formatting correct
- [ ] Links use relative paths
- [ ] state.json properly formatted
- [ ] No broken links

## Integration Patterns

### Pattern 1: Knowledge Build Workflow

```python
# Typical workflow for /knowledge-build command
def build_knowledge_base():
    # 1. Analyze codebase
    analysis = analyze_codebase()

    # 2. Determine structure
    if is_monorepo():
        templates = load_monorepo_templates()
    else:
        templates = load_single_project_templates()

    # 3. Fill templates
    for template_name, template_content in templates:
        filled = fill_template(template_content, analysis)
        write_doc(f"{RP1_ROOT}/context/{template_name}", filled)

    # 4. Generate state.json
    state = create_state(analysis)
    write_json(f"{RP1_ROOT}/context/state.json", state)
```

### Pattern 2: Incremental Updates

```python
# Update specific documents based on changes
def update_knowledge_base(changed_files):
    state = load_state()

    # Determine what needs updating
    if architecture_changed(changed_files):
        update_document("architecture.md", changed_files)

    if concepts_changed(changed_files):
        update_document("concept_map.md", changed_files)

    # Update state
    state["incremental_updates"]["last_incremental_date"] = now()
    state["incremental_updates"]["sections_updated"].append(updated_sections)
    save_state(state)
```

### Pattern 3: Validation Workflow

```python
# Validate generated documentation
def validate_knowledge_base():
    issues = []

    # Check completeness
    required_files = ["index.md", "architecture.md", "state.json"]
    for file in required_files:
        if not exists(file):
            issues.append(f"Missing required file: {file}")

    # Validate diagrams
    for doc in find_mermaid_diagrams():
        if not validate_mermaid(doc):
            issues.append(f"Invalid diagram in {doc}")

    # Check cross-references
    for link in find_links():
        if not exists(link.target):
            issues.append(f"Broken link: {link}")

    return issues
```

## Advanced Customization

### Adding Custom Sections

Feel free to add project-specific sections:

**API Documentation Section**:
```markdown
## API Reference

### Authentication Endpoints
- `POST /auth/login`: Authenticate user
- `POST /auth/logout`: End session
- `GET /auth/verify`: Verify token

See [api-reference.md](api-reference.md) for complete API documentation.
```

**Deployment Section**:
```markdown
## Deployment Guide

### Production Deployment
1. Tag release: `git tag v1.2.3`
2. Run CI/CD pipeline
3. Monitor deployment: `make logs:prod`
4. Verify health checks pass

See [deployment.md](deployment.md) for detailed procedures.
```

### Creating Custom Templates

To create your own templates:

1. Copy existing template as starting point
2. Modify sections for your use case
3. Add placeholder patterns: `[YourPlaceholder]`
4. Document your template in comments
5. Test with real project
6. Iterate based on feedback

### Multi-Language Projects

For projects with multiple languages:

**In concept_map.md**:
```markdown
## Language-Specific Concepts

### Python Modules
- **Django Models**: ORM entities in `api/models/`
- **Celery Tasks**: Async jobs in `tasks/`

### Go Services
- **gRPC Services**: Service definitions in `proto/`
- **Middleware**: Request pipeline in `middleware/`
```

**In modules.md**:
```markdown
## Modules by Language

### Python Modules
[Standard module documentation]

### Go Modules
[Standard module documentation]

### Shared Concepts
[Cross-language patterns]
```

## Resources

**Related Skills**:
- **mermaid**: Validate and generate Mermaid diagrams
- **maestro**: Create custom skills and templates

**External Resources**:
- Mermaid documentation: https://mermaid.js.org/
- Markdown guide: https://www.markdownguide.org/
- Architecture documentation: https://c4model.com/

## Version History

**v1.0.0** (2025-01-15):
- Initial release
- 6 core templates
- Single-project and monorepo support
- Examples and reference guide
