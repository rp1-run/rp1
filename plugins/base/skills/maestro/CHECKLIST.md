# Skill Quality Checklist

Use this checklist to ensure skills meet quality standards before delivery.

## Critical Requirements (Must Pass)

These are non-negotiable requirements. Skills MUST pass all of these:

### YAML Frontmatter
- [ ] YAML syntax is valid (proper `---` opening and closing)
- [ ] `name` field present and valid
- [ ] `name` is lowercase with hyphens only
- [ ] `name` is 64 characters or less
- [ ] `description` field present and non-empty
- [ ] `description` is 1024 characters or less
- [ ] No XML tags in `name` or `description`

### File Structure
- [ ] SKILL.md file exists
- [ ] File paths use Unix-style forward slashes (not backslashes)
- [ ] All referenced files exist
- [ ] Directory structure is valid

### Basic Functionality
- [ ] Instructions are clear and actionable
- [ ] Skill has defined purpose and scope
- [ ] No syntax errors in markdown

---

## Best Practice Requirements (Highly Recommended)

These significantly improve skill quality:

### Content Quality
- [ ] SKILL.md is 500 lines or less
- [ ] SKILL.md is ideally under 400 lines
- [ ] Content is concise (no unnecessary verbosity)
- [ ] Consistent terminology throughout
- [ ] No time-sensitive information (dates, versions, "current")

### Description Quality
- [ ] Description explains WHAT the skill does
- [ ] Description explains WHEN to use it
- [ ] Description includes specific trigger terms
- [ ] Description includes keywords users would mention
- [ ] Description is specific, not vague

**Examples**:
- ✅ Good: "Extracts text from PDF files. Use when working with PDFs or when user mentions 'PDF', 'document', 'extract'."
- ❌ Bad: "Helps with documents."

### Information Architecture
- [ ] Uses progressive disclosure (overview → details)
- [ ] File references are one level deep (not nested)
- [ ] Supporting files are justified and necessary
- [ ] Each file has clear, specific purpose
- [ ] SKILL.md serves as navigation hub for complex skills

### Workflows
- [ ] Multi-step processes have clear sequences
- [ ] Decision points are explicit
- [ ] Checklists provided for complex operations
- [ ] Expected outputs are defined

### Scripts (if present)
- [ ] Scripts are necessary (deterministic operations)
- [ ] Scripts are simple (under 150 lines each)
- [ ] All parameters documented with comments
- [ ] Explicit error handling (no silent failures)
- [ ] No magic numbers (constants are explained)
- [ ] Tests included for complex scripts (>50 lines)

---

## Anti-Patterns to Avoid

Check that skills don't contain these common mistakes:

### Naming Issues
- [ ] No vague names like "helper", "utility", "tool", "misc"
- [ ] Name uses gerund form (verb + -ing) when appropriate
- [ ] Name is descriptive and specific

### Description Issues
- [ ] Not too vague or generic
- [ ] Not missing trigger terms
- [ ] Not overly technical without context
- [ ] Not assuming user knowledge of internal terms

### Content Issues
- [ ] No Windows-style paths (backslashes)
- [ ] No deeply nested file references (>1 level deep)
- [ ] No excessive options without defaults
- [ ] No assumed installations without documentation
- [ ] No time-sensitive references ("as of 2024", "currently")

### Script Issues (if present)
- [ ] No missing error handling
- [ ] No undocumented parameters
- [ ] No external dependencies without installation instructions
- [ ] No punting on errors (handle or explain clearly)

---

## Optional Enhancements

These improve quality but aren't required:

### Documentation
- [ ] Examples provided for complex behaviors
- [ ] Templates provided for structured outputs
- [ ] Edge cases documented
- [ ] Troubleshooting section included

### User Experience
- [ ] Clear success criteria defined
- [ ] Quality checklist for users
- [ ] Common issues documented with solutions
- [ ] Testing guidance provided

### Code Quality (if scripts present)
- [ ] Type hints used (Python)
- [ ] Constants defined at top of file
- [ ] Functions are single-purpose
- [ ] Clear variable names

---

## Validation Checklist

Before delivering a skill, complete these validation steps:

### Automated Validation
- [ ] Run `python validate_skill.py <path-to-SKILL.md>`
- [ ] All automated checks pass
- [ ] Fix any issues reported

### Manual Review
- [ ] Read through SKILL.md completely
- [ ] Check that instructions are clear
- [ ] Verify workflows make sense
- [ ] Test referenced file paths
- [ ] Confirm scripts work (if present)

### Testing
- [ ] Generate 3-5 test prompts
- [ ] Verify prompts would trigger the skill
- [ ] Ensure test prompts cover main use cases
- [ ] Document expected behavior for each prompt

---

## Quality Scoring Rubric

Use this to assess overall skill quality:

### Excellent (90-100 points)
- All critical requirements met
- All best practices followed
- No anti-patterns present
- Clear, concise, well-structured
- Comprehensive documentation
- Scripts tested and simple

### Good (75-89 points)
- All critical requirements met
- Most best practices followed
- Few or no anti-patterns
- Clear and functional
- Adequate documentation

### Acceptable (60-74 points)
- All critical requirements met
- Some best practices followed
- Minor anti-patterns present
- Functional but could be clearer
- Basic documentation

### Needs Improvement (<60 points)
- Critical requirements missing, OR
- Many best practices violated, OR
- Multiple anti-patterns present, OR
- Unclear or confusing instructions

---

## Best Practices Summary

### Keep It Concise
- Default assumption: Claude is already smart
- Only add context Claude doesn't have
- Remove unnecessary words
- Use bullets and lists for clarity

### Make It Discoverable
- Include trigger terms in description
- Think about what users would say
- Be specific about capabilities
- Mention key terminology

### Structure for Context Efficiency
- SKILL.md as overview/navigation
- Progressive disclosure of details
- One-level-deep references only
- Scripts for token-heavy operations

### Match Specificity to Fragility
- **High freedom**: Text-based tasks with multiple valid approaches
- **Medium freedom**: Preferred patterns with some variation
- **Low freedom**: Fragile operations needing exact sequences

### Provide the Right Level of Detail
- Simple tasks: Direct instructions
- Complex tasks: Stage-based workflows
- Multi-path tasks: Decision trees
- Fragile operations: Scripts with tests

---

## Common Improvements

When updating skills, look for these improvement opportunities:

### Description Enhancements
- Add trigger terms: "Use when user mentions 'X', 'Y', 'Z'"
- Add scenarios: "Use when working with [specific task]"
- Be more specific about capabilities
- Remove vague language

### Structure Improvements
- Split oversized SKILL.md (>500 lines) into main + support files
- Add TEMPLATES.md if skill produces structured output
- Add EXAMPLES.md if behavior needs demonstration
- Organize with clear sections and navigation

### Content Improvements
- Break walls of text into bullets
- Add workflows for multi-step processes
- Add checklists for complex operations
- Remove redundant information
- Simplify complex sentences

### Script Improvements
- Add comments explaining parameter choices
- Add error handling with clear messages
- Break long functions into smaller ones
- Add tests for complex logic
- Document edge cases

---

## Review Questions

Ask these questions when reviewing a skill:

**Purpose & Scope**
- Is it clear what this skill does?
- Is it clear when to use this skill?
- Is the scope appropriate (not too broad or narrow)?

**Discovery**
- Would users find this skill for their use case?
- Does the description include relevant trigger terms?
- Is the description specific enough?

**Usability**
- Are instructions clear and actionable?
- Are workflows easy to follow?
- Are decision points explicit?
- Is the expected output defined?

**Maintainability**
- Is terminology consistent?
- Is content well-organized?
- Would someone else understand this?
- Is it easy to update/extend?

**Efficiency**
- Is SKILL.md under 500 lines?
- Are supporting files justified?
- Are scripts necessary?
- Does it use progressive disclosure?

**Quality**
- Does it follow best practices?
- Are there anti-patterns?
- Would it work reliably?
- Is error handling adequate?

---

## Quick Reference

### Must Have
1. Valid YAML frontmatter
2. Trigger-rich description (≤1024 chars)
3. Clear purpose and instructions
4. Unix-style paths
5. Concise content (≤500 lines)

### Should Have
1. Progressive disclosure
2. Consistent terminology
3. Clear workflows for complex tasks
4. Examples for unclear behaviors
5. Error handling in scripts

### Must Avoid
1. Vague descriptions
2. Windows paths
3. Time-sensitive content
4. Oversized SKILL.md (>500 lines)
5. Unnecessary complexity

### Quality Check Process
1. Run automated validation
2. Read through completely
3. Test trigger terms
4. Verify file references
5. Test scripts if present
6. Generate test prompts
7. Document expected behavior
