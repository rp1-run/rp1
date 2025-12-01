---
name: maestro
description: Creates and updates Claude Code skills following best practices. Guides through requirements gathering, design, content generation, and validation. Handles both new skill creation and refactoring existing skills. Use when user mentions 'create skill', 'build skill', 'new skill', 'update skill', 'improve skill', 'refactor skill', or asks to build capabilities for Claude Code.
---

# Maestro: Skill Builder for Claude Code

Maestro helps you create high-quality Claude Code skills through a guided, stage-based workflow. It handles both new skill creation and improvements to existing skills.

## What Maestro Does

- **Creates new skills** from scratch with proper structure and best practices
- **Updates existing skills** by analyzing and refactoring them
- Ensures YAML syntax validity and structural correctness
- Enforces best practices (concise content, trigger-rich descriptions, progressive disclosure)
- Generates supporting files only when justified (templates, examples, scripts)
- Provides validation and quality assurance
- Outputs skills to user-specified locations

## When to Use Maestro

Use maestro when:
- User wants to create a new skill for Claude Code
- User wants to improve/refactor/update an existing skill
- User mentions skill-related terms: "build a skill", "create skill", "skill for X"
- User wants to package functionality into a reusable capability

## Workflow Overview

Maestro uses a 5-stage workflow that adapts based on whether you're creating or updating:

### Stage 0: Mode Detection
Determine if this is **Creation Mode** or **Update Mode**:
- **Creation**: User wants a new skill from scratch
- **Update**: User provides existing skill path or asks to improve/refactor

### Stage 1: Requirements & Discovery

**Creation Mode**:
Ask interactive questions to gather requirements:

1. **Core capability**: What task/capability should this skill handle?
2. **Trigger phrases**: What user phrases should activate it? (for description)
3. **Tool requirements**: What tools are needed?
   - Read-only operations?
   - File editing?
   - Web access?
   - Bash execution?
4. **Complexity level**:
   - Simple utility (single file, <300 lines)?
   - Moderate workflow (main file + 1-2 support files)?
   - Complex multi-step (multiple files + scripts)?
5. **Supporting resources**: Does it need:
   - Templates for output formats?
   - Examples showing desired behavior?
   - Reference documentation?
   - Utility scripts (only if deterministic operations needed)?
6. **Output location**: Where to create skill?
   - Default: `./skill-name/` in current directory
   - Custom: User-specified path

Document all requirements clearly before proceeding.

**Update Mode**:
1. Ask for existing skill path (SKILL.md location)
2. Read all skill files (SKILL.md + supporting files)
3. Analyze current structure:
   - YAML frontmatter compliance
   - Content length and organization
   - File structure and references
   - Best practice adherence
4. Identify issues:
   - YAML syntax problems
   - Vague or missing trigger terms in description
   - Anti-patterns (Windows paths, magic numbers, etc.)
   - Length violations (>500 lines)
   - Missing opportunities (could use scripts, needs examples, etc.)
   - Unclear workflows
5. Present improvement proposal with specific changes
6. Get user confirmation on what to fix

### Stage 2: Design & Architecture

**Name Design**:
- Creation: Propose skill names following conventions
- Update: Validate existing name or propose rename if needed

Naming rules:
- Lowercase letters, numbers, hyphens only
- Max 64 characters
- Use gerund form (verb + -ing): `processing-pdfs`, `analyzing-data`
- Avoid vague names: `helper`, `utils`, `tool`

**Description Design**:
Craft trigger-rich descriptions (max 1024 chars) that specify:
- What the skill does (capabilities)
- When to use it (trigger scenarios)
- Key terms users might mention

Example: "Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when user mentions PDFs, documents, forms."

**Information Architecture**:
Determine file structure based on complexity:

1. **Simple** (single SKILL.md, <300 lines):
   - No supporting files
   - All content in SKILL.md
   - No scripts

2. **Moderate** (SKILL.md + 1-2 support files):
   - SKILL.md as overview (~300 lines)
   - TEMPLATES.md for output formats
   - EXAMPLES.md for input/output pairs
   - No scripts or very simple script

3. **Complex** (multiple files + scripts):
   - SKILL.md as navigation hub (~400 lines)
   - Multiple support files (TEMPLATES.md, EXAMPLES.md, REFERENCE.md, WORKFLOWS.md)
   - Utility scripts (only if needed for deterministic operations)
   - Keep scripts simple (<150 lines each)

**Script Planning**:
Only include scripts when:
- Deterministic operations needed (validation, parsing, formatting)
- Script saves significant tokens vs. generating code inline
- Operation is fragile and needs exact sequence

Script requirements:
- Keep simple (<150 lines)
- Document all parameters with comments
- Explicit error handling (solve, don't punt)
- No external dependencies if possible
- Add basic tests if >50 lines or complex logic

**Tool Restrictions**:
Determine if `allowed-tools` frontmatter is needed:
- Use for read-only skills that shouldn't modify files
- Use for security-sensitive workflows
- Omit if skill needs full tool access

### Stage 3: Content Generation

Generate all skill files following best practices.

**SKILL.md Structure**:
```yaml
---
name: skill-name
description: What it does and when to use it with trigger terms
allowed-tools: [optional, only if restrictions needed]
---

# Skill Title

Brief overview paragraph.

## What This Skill Does

- Capability 1
- Capability 2
- Capability 3

## When to Use

Use this skill when...

## How It Works

[For simple skills: direct instructions]
[For complex skills: stage-based workflow or decision tree]

## References

[If applicable, one-level-deep references to supporting files]
- See TEMPLATES.md for output format examples
- See EXAMPLES.md for input/output pairs
- Run validate.py for validation
```

**SKILL.md Best Practices**:
- Keep under 500 lines (ideally 300-400)
- Use progressive disclosure (overview → details in support files)
- Write concisely (assume Claude is smart, only add what's not known)
- Include clear workflows for multi-step tasks
- Provide checklists for complex sequences
- Use consistent terminology throughout
- No time-sensitive information (dates, versions)
- Unix-style paths only (forward slashes)
- Reference support files one level deep only

**Supporting Files** (generate only when justified):

1. **TEMPLATES.md**: Output format examples
   - Include when skill produces structured output
   - Show exact format expected
   - Provide variations for different contexts

2. **EXAMPLES.md**: Input/output pairs
   - Include when behavior needs demonstration
   - Show 3-5 realistic examples
   - Cover edge cases and variations
   - Annotate to explain choices

3. **REFERENCE.md**: Detailed documentation
   - Include when SKILL.md would exceed 500 lines
   - Technical details too lengthy for main file
   - API documentation, schema definitions

4. **WORKFLOWS.md**: Decision trees and conditional logic
   - Include when skill has multiple paths
   - Provide clear decision points
   - Show "if X then Y" logic

5. **Utility Scripts**: Deterministic operations
   - Only when truly needed
   - Keep simple and well-documented
   - Explicit error handling
   - Comment parameter choices

**For Updates**:
- Regenerate problematic sections while preserving good content
- Fix structural issues (YAML, paths, naming)
- Enhance descriptions with trigger terms
- Split oversized SKILL.md into main + support files
- Add missing support files if beneficial
- Simplify or document existing scripts

### Stage 4: Validation & Quality Assurance

Run automated validation using validate_skill.py:

**Structural Checks**:
- YAML syntax valid
- Frontmatter complete (name, description present)
- Name constraints (≤64 chars, lowercase, hyphens only)
- Description constraints (≤1024 chars, non-empty)
- File paths valid and use Unix-style separators
- All referenced files exist

**Best Practice Checks**:
- SKILL.md ≤500 lines
- Description includes trigger terms
- File references one level deep only
- Consistent terminology used
- No time-sensitive information
- No Windows-style paths

**Anti-Pattern Detection**:
- Windows paths (backslashes)
- Vague descriptions ("helper", "utility")
- Magic numbers in scripts (undocumented constants)
- Missing error handling in scripts
- Deeply nested file references
- Excessive options without defaults

**Auto-Fix Minor Issues**:
- Convert Windows paths to Unix paths
- Fix whitespace in YAML
- Normalize line endings

**Report Major Issues**:
- Present validation report with quality score
- List all issues found by category
- Offer to regenerate/fix problematic sections
- Highlight critical vs. optional improvements

### Stage 5: Testing & Iteration Support

Help user test and refine the skill.

**Generate Test Prompts**:
Create 3-5 example user messages that should trigger the skill:
- Vary phrasing to test trigger term matching
- Cover different use cases
- Include edge cases

**Installation Instructions**:
```bash
# Personal skill
cp -r ./skill-name ~/.claude/skills/

# Project skill
cp -r ./skill-name ./.claude/skills/
```

**Testing Guidance**:
1. Install the skill in desired location
2. Start new Claude Code conversation
3. Test with generated prompts
4. Verify skill activates appropriately
5. Check output quality and behavior

**Iteration Support**:
- Common refinements based on testing
- How to adjust trigger terms if not activating
- When to simplify vs. add detail
- Cross-model considerations (Haiku vs. Sonnet vs. Opus)

**Next Steps**:
- If skill works well: done!
- If needs refinement: offer to update (return to Stage 1B)
- If not activating: improve description trigger terms
- If behavior issues: refine instructions or add examples

## Reference Materials

For detailed information, reference these supporting files:

- **TEMPLATES.md**: Ready-to-use skill templates for different complexity levels
- **CHECKLIST.md**: Quality checklist and best practices summary
- **EXAMPLES.md**: Annotated real skill examples with design explanations
- **PATTERNS.md**: Common skill patterns and progressive disclosure strategies

For validation:
- Run `python ~/.claude/skills/maestro/validate_skill.py <path-to-SKILL.md>`

## Quick Start Examples

**Example 1: Create Simple Skill**
```
User: "Create a skill that helps me write commit messages"
Maestro: [Asks questions about requirements]
Maestro: [Designs simple single-file skill]
Maestro: [Generates SKILL.md in ./commit-helper/]
Maestro: [Validates and provides installation instructions]
```

**Example 2: Update Existing Skill**
```
User: "Improve my PDF skill at ~/.claude/skills/pdf-processor/SKILL.md"
Maestro: [Analyzes existing skill]
Maestro: [Identifies issues: description too vague, SKILL.md too long]
Maestro: [Proposes improvements: enhance description, split into SKILL.md + REFERENCE.md]
Maestro: [Regenerates improved skill]
Maestro: [Validates and provides testing guidance]
```

## Important Principles

**Simplicity First**: Start with minimal structure. Only add complexity when justified.

**Scripts as Last Resort**: Only include scripts for deterministic operations that save tokens or ensure consistency. Keep them simple.

**Progressive Disclosure**: Don't load everything upfront. SKILL.md is navigation hub, details in support files.

**Teach While Building**: Explain why design choices matter, not just what to do.

**User Ownership**: Output to user-specified location. User handles installation, git, and distribution.

**Quality Over Speed**: Take time to get structure right. Validate before delivering.

## Output Strategy

**Default**: Create `./skill-name/` in current working directory

**Custom**: Ask user for preferred path if they specify

**Post-Generation Message**:
```
✓ Skill created at ./skill-name/

To install:
  Personal: cp -r ./skill-name ~/.claude/skills/
  Project:  cp -r ./skill-name ./.claude/skills/

Test with prompts like:
  - [generated example 1]
  - [generated example 2]
  - [generated example 3]
```

## Common Pitfalls to Avoid

1. **Vague descriptions**: Always include specific trigger terms
2. **Oversized SKILL.md**: Keep under 500 lines, use support files
3. **Unnecessary complexity**: Don't add scripts/files unless justified
4. **Windows paths**: Always use forward slashes
5. **Missing validation**: Always run validate_skill.py before delivering
6. **Assumed knowledge**: Document script parameters and design choices
7. **Time-sensitive content**: No dates, version cutoffs, or temporal references

## Success Criteria

A well-built skill should:
- ✓ Have valid YAML frontmatter
- ✓ Have trigger-rich description (≤1024 chars)
- ✓ Have concise SKILL.md (≤500 lines)
- ✓ Follow progressive disclosure pattern
- ✓ Include only justified supporting files
- ✓ Pass all validation checks
- ✓ Activate appropriately when tested
- ✓ Follow consistent terminology
- ✓ Include clear workflows for complex tasks
